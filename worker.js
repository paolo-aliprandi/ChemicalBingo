import { DurableObject } from 'cloudflare:workers';
import elements from './public/elements.json';
import { blocks, blockPoints, rowBonuses, columnBonus, completedLines, scoreBoard } from './public/scoring.js';

const allElements = Object.assign({}, ...Object.values(elements));
const elementBlocks = Object.fromEntries(blocks.flatMap((block) =>
  Object.keys(elements[block]).map((symbol) => [symbol, block])));
const gameDuration = 10 * 60 * 1000;
const clueDuration = 5000;
const roomLifetime = 2 * 60 * 60 * 1000;
const reconnectGrace = 60 * 1000;
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function errorResponse(error) {
  if (error instanceof RequestError) return json({ error: error.message }, error.status);
  console.error('Chemical Bingo request failed:', error);
  return json({ error: 'Something went wrong. Please retry.' }, 500);
}

async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    throw new RequestError(415, 'Send a JSON request.');
  }
  if (!request.body) throw new RequestError(400, 'The request body is missing.');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) {
      await reader.cancel();
      throw new RequestError(413, 'The request is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new RequestError(400, 'The request contains invalid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'The request must be a JSON object.');
  }
  return body;
}

function nickname(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 24 ||
      /[\u0000-\u001f\u007f]/.test(value)) {
    throw new RequestError(400, 'Choose a player name between 1 and 24 characters.');
  }
  return value.trim();
}

function newBoard() {
  return Object.fromEntries(blocks.map((block) => {
    const available = Object.keys(elements[block]);
    const board = [];
    for (let index = 0; index < 5; index += 1) {
      board.push(available.splice(Math.floor(Math.random() * available.length), 1)[0]);
    }
    return [block, board];
  }));
}

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => codeAlphabet[byte % codeAlphabet.length]).join('');
}

function sessionFrom(request) {
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)cb_session=([a-f0-9]{64})(?:;|$)/)?.[1];
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        throw new RequestError(400, 'Multiplayer requires HTTPS. Open the secure game URL.');
      }
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) throw new RequestError(403, 'Use the game on its own website.');
      const match = url.pathname.match(/^\/api\/rooms(?:\/([A-Z0-9]{6})\/(join|state|connect|start|reset|mark|ready|draw|leave))?$/);
      if (!match) throw new RequestError(404, 'This game endpoint does not exist.');
      const action = match[2] || 'create';
      const expectedMethod = ['state', 'connect'].includes(action) ? 'GET' : 'POST';
      if (request.method !== expectedMethod) throw new RequestError(405, `Use ${expectedMethod} for this action.`);
      let session = sessionFrom(request);
      if (!session && !['create', 'join'].includes(action)) {
        throw new RequestError(401, 'Join the room before playing.');
      }
      session ||= crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      const headers = new Headers(request.headers);
      headers.set('X-Bingo-Session', session);
      const code = match[1] || newCode();
      const target = new URL(`/api/rooms/${code}/${action}`, url);
      const forwarded = new Request(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      });
      const response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(forwarded);
      if (['create', 'join'].includes(action) && response.ok) {
        const result = new Response(response.body, response);
        const secure = url.protocol === 'https:' ? '; Secure' : '';
        result.headers.set('Set-Cookie', `cb_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secure}`);
        return result;
      }
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  },
};

export class BingoRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = await this.ctx.storage.get('room') || null;
      if (this.room && this.room.rulesVersion !== 5) {
        this.newGame('lobby');
        await this.save();
        this.broadcast();
      }
      if (this.room) {
        for (const player of this.room.players) {
          player.mistakes ??= 0;
          player.clueMistakes ??= 0;
          player.retryAt ??= 0;
        }
      }
    });
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  online(player) {
    return this.ctx.getWebSockets(player.session).some((socket) => socket.readyState === 1);
  }

  snapshot(player) {
    return {
      code: this.room.code,
      gameId: this.room.gameId,
      revision: this.room.revision || 0,
      phase: this.room.phase,
      hostId: this.room.hostId,
      selfId: player.id,
      winnerId: this.room.winnerId,
      winnerIds: this.room.winnerIds,
      claims: this.room.claims,
      drawn: this.room.drawId,
      totalElements: Object.keys(allElements).length,
      blockPoints,
      rowBonuses,
      columnBonus,
      remainingMs: this.room.phase === 'playing' ? Math.max(0, this.room.gameEndsAt - Date.now()) : 0,
      clueRemainingMs: Math.max(0, (this.room.advanceAt || 0) - Date.now()),
      endReason: this.room.endReason,
      previousAnswer: this.room.previousAnswer || null,
      retryAfterMs: Math.max(0, player.retryAt - Date.now()),
      current: this.room.current ? {
        symbol: this.room.current.symbol,
        name: this.room.current.name,
        block: this.room.current.block,
        id: this.room.current.id,
        claimedBy: this.room.current.claimedBy,
        claimedName: this.room.current.claimedName,
      } : null,
      board: player.board,
      marked: player.marked,
      advancing: Boolean(this.room.resolving),
      players: this.room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        host: candidate.id === this.room.hostId,
        online: this.online(candidate),
        ready: candidate.ready,
        matched: candidate.marked.length,
        score: this.score(candidate),
        mistakes: candidate.mistakes,
        clueMistakes: candidate.clueMistakes,
        blocks: completedLines(candidate.board, candidate.marked).rows.length,
        columns: completedLines(candidate.board, candidate.marked).columns.length,
      })),
    };
  }

  broadcast() {
    if (!this.room) return;
    for (const socket of this.ctx.getWebSockets()) {
      const session = socket.deserializeAttachment()?.session;
      const player = this.room.players.find((candidate) => candidate.session === session);
      if (!player || socket.readyState !== 1) continue;
      try {
        socket.send(JSON.stringify({ type: 'state', state: this.snapshot(player) }));
      } catch (error) {
        console.error('Unable to update a room connection:', error);
        socket.close(1011, 'Connection interrupted. Please reconnect.');
      }
    }
  }

  async save() {
    if (!this.room) return;
    this.room.revision = (this.room.revision || 0) + 1;
    await this.ctx.storage.put('room', this.room);
    const deadlines = [this.room.expiresAt];
    if (this.room.phase === 'playing') deadlines.push(this.room.gameEndsAt);
    if (this.room.advanceAt) deadlines.push(this.room.advanceAt);
    for (const player of this.room.players) {
      if (player.offlineAt) deadlines.push(player.offlineAt + reconnectGrace);
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
  }

  queueDraw() {
    if (this.room.phase === 'playing' && this.room.current && !this.room.resolving &&
        this.room.players.every((player) => player.ready)) {
      this.room.resolving = true;
      this.room.advanceAt = Math.min(this.room.advanceAt, Date.now() + 1800);
    }
  }

  newGame(phase) {
    this.room.rulesVersion = 5;
    this.room.gameId += 1;
    this.room.phase = phase;
    this.room.current = null;
    this.room.drawId = 0;
    this.room.pool = Object.keys(allElements);
    this.room.retryPool = [];
    this.room.recycling = false;
    this.room.advanceAt = null;
    this.room.resolving = false;
    this.room.gameEndsAt = phase === 'playing' ? Date.now() + gameDuration : null;
    this.room.endReason = null;
    this.room.winnerId = null;
    this.room.winnerIds = [];
    this.room.claims = {};
    this.room.previousAnswer = null;
    for (const player of this.room.players) {
      player.board = newBoard();
      player.marked = [];
      player.ready = false;
      player.mistakes = 0;
      player.clueMistakes = 0;
      player.retryAt = 0;
    }
    if (phase === 'playing') this.draw();
  }

  score(player) {
    return scoreBoard(player.board, player.marked);
  }

  canReturn(symbol) {
    return !this.room.claims[symbol] && this.room.players.some((player) =>
      player.board[elementBlocks[symbol]].includes(symbol) && !player.marked.includes(symbol));
  }

  finish(reason, winnerId) {
    if (this.room.current) {
      const { name, symbol } = this.room.current;
      this.room.previousAnswer = { name, symbol };
    }
    this.room.phase = 'finished';
    this.room.endReason = reason;
    this.room.advanceAt = null;
    this.room.resolving = false;
    this.room.current = null;
    const best = Math.max(...this.room.players.map((player) => this.score(player)));
    this.room.winnerIds = winnerId ? [winnerId] : best > 0 ? this.room.players
      .filter((player) => this.score(player) === best).map((player) => player.id) : [];
    this.room.winnerId = this.room.winnerIds[0] || null;
  }

  settleDeadlines() {
    if (this.room.phase !== 'playing') return false;
    if (this.room.gameEndsAt <= Date.now()) {
      this.finish('time');
      return true;
    }
    if (this.room.advanceAt && this.room.advanceAt <= Date.now()) {
      this.draw();
      return true;
    }
    return false;
  }

  draw() {
    this.room.advanceAt = null;
    this.room.resolving = false;
    if (this.room.current) {
      const { name, symbol } = this.room.current;
      this.room.previousAnswer = { name, symbol };
      if (this.canReturn(symbol) && !this.room.retryPool.includes(symbol)) this.room.retryPool.push(symbol);
    }
    if (this.room.recycling) this.room.pool = this.room.pool.filter((symbol) => this.canReturn(symbol));
    if (!this.room.pool.length) {
      this.room.pool = this.room.retryPool.filter((symbol) => this.canReturn(symbol));
      this.room.retryPool = [];
      this.room.recycling = true;
    }
    const previous = this.room.current?.symbol;
    this.room.current = null;
    if (!this.room.pool.length) return;
    const available = this.room.pool.filter((symbol) => this.room.pool.length === 1 || symbol !== previous);
    const symbol = available[Math.floor(Math.random() * available.length)];
    this.room.pool.splice(this.room.pool.indexOf(symbol), 1);
    const block = elementBlocks[symbol];
    this.room.drawId += 1;
    this.room.current = {
      block, symbol, name: elements[block][symbol], id: this.room.drawId,
      claimedBy: null, claimedName: null,
    };
    this.room.advanceAt = Date.now() + clueDuration;
    for (const player of this.room.players) {
      player.ready = false;
      player.clueMistakes = 0;
      player.retryAt = 0;
    }
    this.queueDraw();
  }

  async closeRoom(message) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'closed', message }));
        socket.close(1000, message);
      }
    }
    this.room = null;
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
  }

  async fetch(request) {
    try {
      const parts = new URL(request.url).pathname.split('/');
      const action = parts.at(-1);
      const code = parts.at(-2);
      const session = request.headers.get('X-Bingo-Session');
      if (!/^[a-f0-9]{64}$/.test(session || '')) throw new RequestError(401, 'Please join the room again.');
      if (this.room && this.room.expiresAt <= Date.now()) await this.closeRoom('The room expired.');
      if (action === 'create') {
        if (this.room) throw new RequestError(409, 'That room code is already in use.');
        const body = await readBody(request);
        const player = {
          id: crypto.randomUUID(), session, name: nickname(body.name),
          board: newBoard(), marked: [], ready: false, offlineAt: Date.now(), lastActionAt: 0,
          mistakes: 0, clueMistakes: 0, retryAt: 0,
        };
        this.room = {
          code, gameId: 1, revision: 0, rulesVersion: 5, phase: 'lobby', hostId: player.id,
          winnerId: null, winnerIds: [], claims: {},
          players: [player], current: null, pool: Object.keys(allElements), drawId: 0,
          retryPool: [], recycling: false, resolving: false, gameEndsAt: null, endReason: null,
          advanceAt: null, expiresAt: Date.now() + roomLifetime,
        };
        await this.save();
        return json(this.snapshot(player), 201);
      }
      if (!this.room) throw new RequestError(404, 'Room not found. Check the code or create a new room.');
      if (this.settleDeadlines()) {
        await this.save();
        this.broadcast();
      }
      let player = this.room.players.find((candidate) => candidate.session === session);
      if (action === 'join') {
        const body = await readBody(request);
        if (this.settleDeadlines()) {
          await this.save();
          this.broadcast();
        }
        const name = nickname(body.name);
        if (!player) {
          if (this.room.phase !== 'lobby') throw new RequestError(409, 'The game has started. Ask the host to reset the room before joining.');
          if (this.room.players.length >= 20) throw new RequestError(409, 'This room already has 20 players.');
          if (this.room.players.some((candidate) => candidate.name.toLowerCase() === name.toLowerCase())) {
            throw new RequestError(409, 'That player name is already in use in this room.');
          }
          player = {
            id: crypto.randomUUID(), session, name, board: newBoard(),
            marked: [], ready: false, offlineAt: Date.now(), lastActionAt: 0,
            mistakes: 0, clueMistakes: 0, retryAt: 0,
          };
          this.room.players.push(player);
        }
        this.room.expiresAt = Date.now() + roomLifetime;
        await this.save();
        this.broadcast();
        return json(this.snapshot(player));
      }
      if (!player) throw new RequestError(401, 'You are no longer in this room. Please join again.');
      if (action === 'state') return json(this.snapshot(player));
      if (action === 'connect') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
          throw new RequestError(426, 'Use a WebSocket connection.');
        }
        if (this.ctx.getWebSockets(session).filter((socket) => socket.readyState === 1).length >= 3) {
          throw new RequestError(429, 'This player already has three open game tabs.');
        }
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server, [session]);
        server.serializeAttachment({ session });
        player.offlineAt = null;
        await this.save();
        this.broadcast();
        return new Response(null, { status: 101, webSocket: client });
      }
      const body = await readBody(request);
      if (this.settleDeadlines()) {
        await this.save();
        this.broadcast();
      }
      if (Date.now() - player.lastActionAt < 100) throw new RequestError(429, 'Please wait a moment before the next action.');
      player.lastActionAt = Date.now();
      const host = player.id === this.room.hostId;
      if (['start', 'reset', 'draw'].includes(action) && !host) {
        throw new RequestError(403, 'Only the host can do that.');
      }
      if (action === 'leave') {
        this.room.players = this.room.players.filter((candidate) => candidate !== player);
        for (const socket of this.ctx.getWebSockets(session)) socket.close(1000, 'Left room');
        if (!this.room.players.length) {
          await this.closeRoom('The room is empty.');
          return json({ left: true });
        }
        if (host) this.room.hostId = (this.room.players.find((candidate) => this.online(candidate)) || this.room.players[0]).id;
        this.queueDraw();
      } else if (action === 'reset' || action === 'start') {
        if (action === 'start' && this.room.phase !== 'lobby') throw new RequestError(409, 'This game has already started.');
        this.newGame(action === 'start' ? 'playing' : 'lobby');
      } else {
        if (this.room.phase !== 'playing') throw new RequestError(409, this.room.phase === 'finished' ?
          'This game has ended. Check the scoreboard.' : 'Wait for the host to start the game.');
        if (!this.room.current) throw new RequestError(409, 'No claimable elements remain. Wait for the final scoreboard.');
        if (body.gameId !== this.room.gameId || !Number.isInteger(body.drawId) ||
            body.drawId !== this.room.current.id) {
          throw new RequestError(409, 'The clue changed. Please use the current element.');
        }
        if (action === 'mark') {
          const { symbol } = this.room.current;
          const owner = this.room.claims[symbol];
          if (owner) throw new RequestError(409, `Already claimed by ${owner.name}. Wait for the next element.`);
          if (player.ready) throw new RequestError(409, 'You skipped this clue. Wait for the next element.');
          if (!Object.values(player.board).some((row) => row.includes(body.symbol)) || player.marked.includes(body.symbol) ||
              this.room.claims[body.symbol]) {
            throw new RequestError(422, 'Choose an available symbol on your board.');
          }
          if (player.retryAt > Date.now()) throw new RequestError(429, 'Take a moment, then try again.');
          if (body.symbol !== symbol) {
            player.mistakes += 1;
            player.clueMistakes += 1;
            player.ready = player.clueMistakes >= 2;
            player.retryAt = player.ready ? 0 : Date.now() + 1000;
            this.queueDraw();
            this.room.expiresAt = Date.now() + roomLifetime;
            await this.save();
            this.broadcast();
            return json({
              ...this.snapshot(player),
              answer: { correct: false, symbol: body.symbol, gameId: body.gameId, drawId: body.drawId },
            });
          }
          this.room.claims[symbol] = { playerId: player.id, name: player.name };
          this.room.current.claimedBy = player.id;
          this.room.current.claimedName = player.name;
          player.marked.push(symbol);
          for (const candidate of this.room.players) candidate.ready = true;
          if (player.marked.length === 20) this.finish('cartella', player.id);
          else this.queueDraw();
        } else if (action === 'ready') {
          player.ready = true;
          this.queueDraw();
        } else if (action === 'draw') {
          if (this.room.resolving) throw new RequestError(409, 'The next clue is already on its way.');
          this.draw();
        } else {
          throw new RequestError(404, 'Unknown room action.');
        }
      }
      this.room.expiresAt = Date.now() + roomLifetime;
      await this.save();
      this.broadcast();
      return action === 'leave' ? json({ left: true }) : json(this.snapshot(player));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async webSocketClose(socket) {
    if (!this.room) return;
    const session = socket.deserializeAttachment()?.session;
    const player = this.room.players.find((candidate) => candidate.session === session);
    if (player && !this.online(player)) {
      player.offlineAt = Date.now();
      await this.save();
      this.broadcast();
    }
  }

  webSocketMessage(socket) {
    socket.close(1008, 'Use the room controls for game actions.');
  }

  webSocketError(socket, error) {
    console.error('Room WebSocket failed:', error);
    socket.close(1011, 'Connection interrupted. Please reconnect.');
  }

  async alarm() {
    if (!this.room) return;
    const now = Date.now();
    if (this.room.expiresAt <= now) {
      await this.closeRoom('Room expired after two hours without activity.');
      return;
    }
    this.room.players = this.room.players.filter((player) =>
      !player.offlineAt || player.offlineAt + reconnectGrace > now);
    if (!this.room.players.length) {
      await this.closeRoom('All players have left the room.');
      return;
    }
    if (!this.room.players.some((player) => player.id === this.room.hostId)) {
      this.room.hostId = (this.room.players.find((player) => this.online(player)) || this.room.players[0]).id;
    }
    this.settleDeadlines();
    this.queueDraw();
    await this.save();
    this.broadcast();
  }
}
