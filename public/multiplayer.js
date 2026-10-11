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
  const spotlight = document.getElementById('roundSpotlight');
  const spotlightTitle = document.getElementById('roundSpotlightTitle');
  const spotlightDetail = document.getElementById('roundSpotlightDetail');
  const spotlightNext = document.getElementById('roundSpotlightNext');
  const results = document.getElementById('resultsPanel');
  const podium = document.getElementById('podium');
  const ranking = document.getElementById('finalRanking');
  const resultsTitle = document.getElementById('resultsTitle');
  const replay = document.getElementById('playAgain');
  const replayHint = document.getElementById('replayHint');
  let resultsKey;
  const roomHint = 'First valid claim wins the element and scores 1 point. Only the host can start, reset, or draw early.';
  panel.hidden = false;
  codeLabel.textContent = code;
  invite.value = `${location.origin}/?room=${encodeURIComponent(code)}`;
  document.getElementById('instructions').textContent =
    'First correct claim wins the element and 1 point. Mistakes are tracked, but never cost points. Retry after a short pause; skips and lost races are not mistakes.';
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
    const ordered = [...state.players].sort((a, b) => b.matched - a.matched);
    const fragments = ordered.map((player) => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = `${player.name}${player.id === state.selfId ? ' (you)' : ''}`;
      const detail = document.createElement('span');
      const parts = [`${player.matched} ${player.matched === 1 ? 'point' : 'points'}`,
        `${player.mistakes} ${player.mistakes === 1 ? 'mistake' : 'mistakes'}`,
        `${player.roundWins} ${player.roundWins === 1 ? 'round win' : 'round wins'}`];
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
      `${last.block} round: ${last.winners.map((winner) => winner.name).join(' & ')} ${last.winners.length > 1 ? 'tie' : 'wins'} with ${last.winners[0].score} ${last.winners[0].score === 1 ? 'point' : 'points'}.` :
      `${last.block} round ended with no claims.` : '';
    spotlight.hidden = !state.intermission;
    if (state.intermission) {
      spotlightTitle.textContent = `${last.block} round complete!`;
      spotlightDetail.textContent = last.winners.length ?
        `${last.winners.map((winner) => winner.name).join(' & ')} ${last.winners.length > 1 ? 'share the win' : 'wins'} with ${last.winners[0].score} ${last.winners[0].score === 1 ? 'point' : 'points'}.` :
        'No claims this round. A fresh chance is coming up.';
      spotlightNext.textContent = state.round === 4 ? 'Next up: the final podium' :
        `Next up: ${['s', 'p', 'd', 'f'][state.round]} orbital`;
    }
    const showResults = state.phase === 'finished' && results.hidden;
    results.hidden = state.phase !== 'finished';
    replay.hidden = !host;
    replay.disabled = pending || !connected;
    replayHint.textContent = host ? 'Play again returns everyone to the lobby. Start when your players are ready.' :
      'Waiting for the host to start another game.';
    if (state.phase === 'finished') {
      const key = `${state.gameId}:${JSON.stringify(state.players)}`;
      if (key !== resultsKey) {
        resultsKey = key;
        const winners = ordered.filter((player) => state.winnerIds.includes(player.id));
        resultsTitle.textContent = winners.length > 1 ? 'A shared victory!' : winners.length ?
          `${winners[0].name} wins!` : 'Ready for another try?';
        let place = 0;
        const rows = ordered.map((player, index) => {
          if (index === 0 || player.matched !== ordered[index - 1].matched) place = index + 1;
          const item = document.createElement('li');
          item.classList.toggle('is-you', player.id === state.selfId);
          const badge = document.createElement('span');
          badge.className = 'rank-badge';
          badge.textContent = String(place);
          const name = document.createElement('strong');
          name.textContent = `${player.name}${player.id === state.selfId ? ' (you)' : ''}`;
          const stats = document.createElement('span');
          stats.textContent = `${player.matched} ${player.matched === 1 ? 'point' : 'points'} \u00b7 ` +
            `${player.mistakes} ${player.mistakes === 1 ? 'mistake' : 'mistakes'} \u00b7 ` +
            `${player.roundWins} ${player.roundWins === 1 ? 'round win' : 'round wins'}`;
          const detail = document.createElement('div');
          detail.append(name, stats);
          item.append(badge, detail);
          return item;
        });
        ranking.replaceChildren(...rows);
        const leaders = ordered.filter((player) =>
          player.matched > 0 && ordered.filter((other) => other.matched > player.matched).length < 3);
        podium.replaceChildren(...leaders.map((player) => {
          const card = document.createElement('div');
          const rank = ordered.filter((other) => other.matched > player.matched).length + 1;
          card.className = `podium-place place-${rank}`;
          const badge = document.createElement('span');
          badge.className = 'podium-rank';
          badge.textContent = `#${rank}`;
          const name = document.createElement('strong');
          name.textContent = player.name;
          const score = document.createElement('span');
          score.textContent = `${player.matched} ${player.matched === 1 ? 'point' : 'points'}`;
          card.append(badge, name, score);
          return card;
        }));
        if (showResults) resultsTitle.focus();
      }
    } else {
      resultsKey = undefined;
    }
    window.dispatchEvent(new CustomEvent('bingo:room', {
      detail: { ...state, connected, pending },
    }));
  }

  function acceptState(next) {
    if (!state || next.revision >= state.revision) {
      next.retryEndsAt = Date.now() + next.retryAfterMs;
      state = next;
    }
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
      if (result.answer) {
        window.dispatchEvent(new CustomEvent('bingo:answer', { detail: result.answer }));
      }
      notify(roomHint);
    } catch (error) {
      console.error(`Room action ${action} failed:`, error);
      notify(error.message, true);
      pending = false;
      if (action === 'mark' && error.status === 409) {
        try {
          acceptState(await api('state'));
          if (state.current?.claimedBy) {
            const feedback = state.current.claimedBy === state.selfId ?
              'You already claimed this element. No mistake counted.' :
              `${state.current.claimedName} got there first! No mistake counted.`;
            notify(feedback);
            window.dispatchEvent(new CustomEvent('bingo:feedback', {
              detail: { message: feedback, tone: 'race' },
            }));
            return;
          }
        } catch (refreshError) {
          console.error('Unable to refresh the claim result:', refreshError);
          notify(refreshError.message, true);
          render();
          window.dispatchEvent(new CustomEvent('bingo:feedback', {
            detail: { message: refreshError.message, tone: 'error' },
          }));
          return;
        }
      }
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
  replay.addEventListener('click', () => command('reset'));
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
