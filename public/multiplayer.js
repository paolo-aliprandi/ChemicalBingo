'use strict';

(() => {
  const code = new URLSearchParams(location.search).get('room')?.toUpperCase();
  if (!code) return;
  const panel = document.getElementById('roomPanel');
  const codeLabel = document.getElementById('roomCode');
  const invite = document.getElementById('inviteLink');
  const copy = document.getElementById('copyInvite');
  const players = document.getElementById('playerList');
  const message = document.getElementById('roomMessage');
  const start = document.getElementById('startRoom');
  const draw = document.getElementById('drawNow');
  const leave = document.getElementById('leaveRoom');
  const roundResult = document.getElementById('roundResult');
  const roomHint = 'First valid claim wins the element and scores 1 point. Only the host can start, reset, or draw early.';
  panel.hidden = false;
  codeLabel.textContent = code;
  invite.value = `${location.origin}/?room=${encodeURIComponent(code)}`;
  document.getElementById('instructions').textContent =
    'Compete for shared clues: the first correct claim wins the element and scores 1 point. Opponents lose that symbol. Four rounds; highest total score wins.';
  let state;
  let socket;
  let pending = false;
  let connected = false;
  let stopped = false;
  let retryTimer;
  let heartbeatTimer;
  let retryDelay = 1000;

  function notify(text, error = false) {
    message.textContent = text;
    message.classList.toggle('error', error);
  }

  function render() {
    if (!state) return;
    const host = state.selfId === state.hostId;
    start.hidden = state.phase !== 'lobby' || !host;
    draw.hidden = state.phase !== 'playing' || !host;
    start.disabled = pending || !connected;
    draw.disabled = pending || !connected || state.advancing;
    leave.disabled = pending;
    const fragments = [...state.players].sort((a, b) => b.matched - a.matched).map((player) => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = `${player.name}${player.id === state.selfId ? ' (you)' : ''}`;
      const detail = document.createElement('span');
      const parts = [`${player.matched} ${player.matched === 1 ? 'point' : 'points'}`, `${player.roundWins} round wins`];
      if (player.host) parts.push('Host');
      if (!player.online) parts.push('Reconnecting');
      else if (player.ready && state.phase === 'playing') parts.push('Ready');
      if (state.winnerIds.includes(player.id)) parts.push('Winner!');
      detail.textContent = parts.join(' \u00b7 ');
      item.append(name, detail);
      return item;
    });
    players.replaceChildren(...fragments);
    const last = state.roundResults.at(-1);
    roundResult.hidden = !last;
    roundResult.textContent = last ? last.winners.length ?
      `${last.block} round: ${last.winners.map((winner) => winner.name).join(' & ')} ${last.winners.length > 1 ? 'tie' : 'wins'} with ${last.winners[0].score} points.` :
      `${last.block} round ended with no claims.` : '';
    window.dispatchEvent(new CustomEvent('bingo:room', {
      detail: { ...state, connected, pending },
    }));
  }

  function acceptState(next) {
    if (!state || next.revision >= state.revision) state = next;
    render();
  }

  async function api(action, body) {
    const response = await fetch(`/api/rooms/${code}/${action}`, body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      const local = ['localhost', '127.0.0.1'].includes(location.hostname);
      throw new Error(local ? 'Multiplayer needs the game server. Start it with npm run dev.' :
        `Multiplayer is temporarily unavailable (HTTP ${response.status}). Please retry later.`);
    }
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || `Room request failed (HTTP ${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function stop() {
    stopped = true;
    clearTimeout(retryTimer);
    clearInterval(heartbeatTimer);
    socket?.close();
    connected = false;
  }

  async function connect() {
    if (stopped) return;
    try {
      acceptState(await api('state'));
    } catch (error) {
      console.error('Unable to reconnect to the room:', error);
      notify(error.message, true);
      window.dispatchEvent(new CustomEvent('bingo:feedback', {
        detail: { message: error.message, tone: 'error' },
      }));
      if ([401, 404].includes(error.status)) {
        stop();
      } else {
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(10000, retryDelay * 2);
      }
      return;
    }
    if (stopped) return;
    const url = new URL(`/api/rooms/${code}/connect`, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      connected = true;
      retryDelay = 1000;
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('ping');
      }, 30000);
      notify(roomHint);
      render();
    });
    socket.addEventListener('message', (event) => {
      if (event.data === 'pong') return;
      const update = JSON.parse(event.data);
      if (update.type === 'closed') {
        stop();
        notify(update.message, true);
        render();
        window.dispatchEvent(new CustomEvent('bingo:feedback', {
          detail: { message: update.message, tone: 'error' },
        }));
      } else if (update.type === 'state') {
        acceptState(update.state);
      }
    });
    socket.addEventListener('error', () => {
      notify('Connection interrupted. Reconnecting to your room...', true);
    });
    socket.addEventListener('close', () => {
      connected = false;
      clearInterval(heartbeatTimer);
      render();
      if (!stopped) {
        notify('Connection interrupted. Reconnecting to your room...', true);
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(10000, retryDelay * 2);
      }
    });
  }

  async function command(action, body = {}) {
    if (pending || (!connected && action !== 'leave')) return;
    pending = true;
    render();
    try {
      const result = await api(action, { ...body, gameId: state?.gameId });
      if (action === 'leave') {
        stop();
        location.assign('./');
        return;
      }
      acceptState(result);
      notify(roomHint);
    } catch (error) {
      console.error(`Room action ${action} failed:`, error);
      notify(error.message, true);
      pending = false;
      render();
      window.dispatchEvent(new CustomEvent('bingo:feedback', {
        detail: { message: error.message, tone: 'error' },
      }));
      return;
    } finally {
      pending = false;
    }
    render();
  }

  start.addEventListener('click', () => command('start'));
  draw.addEventListener('click', () => command('draw', { drawId: state.current.id }));
  leave.addEventListener('click', () => {
    if (stopped) location.assign('./');
    else command('leave');
  });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(invite.value);
      notify('Invitation copied. Send it to your friends!');
    } catch (error) {
      console.error('Unable to copy the invitation:', error);
      invite.focus();
      invite.select();
      notify('Could not copy automatically. Select and copy the invitation link above.', true);
    }
  });
  window.addEventListener('bingo:action', (event) => {
    const { action, ...body } = event.detail;
    command(action, body);
  });
  if (document.documentElement.dataset.gameReady === 'true') connect();
  else window.addEventListener('bingo:ready', connect, { once: true });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      stopped = false;
      connect();
    }
  });
})();
