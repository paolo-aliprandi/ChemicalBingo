'use strict';

(() => {
  const { t, points, mistakes, rounds, error: translateError } = window.BingoLanguage;
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
  const roomHint = () => t('First valid claim wins the element and scores 1 point. Only the host can start, reset, or draw early.',
    'Il primo abbinamento valido conquista l\'elemento e 1 punto. Solo l\'organizzatore pu\u00f2 avviare, reimpostare o estrarre in anticipo.');
  panel.hidden = false;
  codeLabel.textContent = code;
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
    invite.value = `${location.origin}/?room=${encodeURIComponent(code)}&lang=${window.BingoLanguage.language}`;
    document.getElementById('instructions').textContent = t(
      'First correct claim wins the element and 1 point. Mistakes are tracked, but never cost points. Retry after a short pause; skips and lost races are not mistakes.',
      'Il primo abbinamento corretto conquista l\'elemento e 1 punto. Gli errori sono conteggiati, ma non tolgono punti. Riprova dopo una breve pausa; passare o perdere la corsa non \u00e8 un errore.');
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
      name.textContent = `${player.name}${player.id === state.selfId ? t(' (you)', ' (tu)') : ''}`;
      const detail = document.createElement('span');
      const parts = [points(player.matched), mistakes(player.mistakes), rounds(player.roundWins)];
      if (player.host) parts.push(t('Host', 'Organizzatore'));
      if (!player.online) parts.push(t('Reconnecting', 'Riconnessione'));
      else if (player.ready && state.phase === 'playing') parts.push(t('Ready', 'Pronto'));
      if (state.winnerIds.includes(player.id)) parts.push(t('Winner!', 'Vincitore!'));
      detail.textContent = parts.join(' \u00b7 ');
      item.append(name, detail);
      return item;
    });
    players.replaceChildren(...fragments);
    const last = state.roundResults.at(-1);
    roundResult.hidden = !last;
    roundResult.textContent = last ? last.winners.length ?
      t(`${last.block} round: ${last.winners.map((winner) => winner.name).join(' & ')} ${last.winners.length > 1 ? 'tie' : 'wins'} with ${points(last.winners[0].score)}.`,
        `Turno ${last.block}: ${last.winners.map((winner) => winner.name).join(' & ')} ${last.winners.length > 1 ? 'vincono a pari merito' : 'vince'} con ${points(last.winners[0].score)}.`) :
      t(`${last.block} round ended with no claims.`, `Turno ${last.block} concluso senza elementi conquistati.`) : '';
    spotlight.hidden = !state.intermission;
    if (state.intermission) {
      spotlightTitle.textContent = t(`${last.block} round complete!`, `Turno ${last.block} completato!`);
      spotlightDetail.textContent = last.winners.length ?
        t(`${last.winners.map((winner) => winner.name).join(' & ')} ${last.winners.length > 1 ? 'share the win' : 'wins'} with ${points(last.winners[0].score)}.`,
          `${last.winners.map((winner) => winner.name).join(' & ')} ${last.winners.length > 1 ? 'vincono a pari merito' : 'vince'} con ${points(last.winners[0].score)}.`) :
        t('No claims this round. A fresh chance is coming up.', 'Nessun elemento conquistato. Arriva una nuova occasione.');
      spotlightNext.textContent = state.round === 4 ? t('Next up: the final podium', 'A seguire: il podio finale') :
        t(`Next up: ${['s', 'p', 'd', 'f'][state.round]} orbital`, `A seguire: orbitale ${['s', 'p', 'd', 'f'][state.round]}`);
    }
    const showResults = state.phase === 'finished' && results.hidden;
    results.hidden = state.phase !== 'finished';
    replay.hidden = !host;
    replay.disabled = pending || !connected;
    replayHint.textContent = host ? t('Play again returns everyone to the lobby. Start when your players are ready.',
      'Gioca ancora riporta tutti nella sala d\'attesa. Avvia quando i giocatori sono pronti.') :
      t('Waiting for the host to start another game.', 'In attesa che l\'organizzatore avvii un\'altra partita.');
    if (state.phase === 'finished') {
      const key = `${state.gameId}:${JSON.stringify(state.players)}`;
      if (key !== resultsKey) {
        resultsKey = key;
        const winners = ordered.filter((player) => state.winnerIds.includes(player.id));
        resultsTitle.textContent = winners.length > 1 ? t('A shared victory!', 'Vittoria a pari merito!') : winners.length ?
          t(`${winners[0].name} wins!`, `${winners[0].name} vince!`) : t('Ready for another try?', 'Pronti a riprovare?');
        let place = 0;
        const rows = ordered.map((player, index) => {
          if (index === 0 || player.matched !== ordered[index - 1].matched) place = index + 1;
          const item = document.createElement('li');
          item.classList.toggle('is-you', player.id === state.selfId);
          const badge = document.createElement('span');
          badge.className = 'rank-badge';
          badge.textContent = String(place);
          const name = document.createElement('strong');
          name.textContent = `${player.name}${player.id === state.selfId ? t(' (you)', ' (tu)') : ''}`;
          const stats = document.createElement('span');
          stats.textContent = [points(player.matched), mistakes(player.mistakes), rounds(player.roundWins)].join(' \u00b7 ');
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
          score.textContent = points(player.matched);
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
      throw new Error(local ? t('Multiplayer needs the game server. Start it with npm run dev.',
        'Il multigiocatore richiede il server del gioco. Avvialo con npm run dev.') :
        t(`Multiplayer is temporarily unavailable (HTTP ${response.status}). Please retry later.`,
          `Multigiocatore temporaneamente non disponibile (HTTP ${response.status}). Riprova pi\u00f9 tardi.`));
    }
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error ? translateError(result.error) :
        t(`Room request failed (HTTP ${response.status}).`, `Richiesta alla stanza non riuscita (HTTP ${response.status}).`));
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
      notify(roomHint());
      render();
    });
    socket.addEventListener('message', (event) => {
      if (event.data === 'pong') return;
      const update = JSON.parse(event.data);
      if (update.type === 'closed') {
        stop();
        notify(translateError(update.message), true);
        render();
        window.dispatchEvent(new CustomEvent('bingo:feedback', {
          detail: { message: translateError(update.message), tone: 'error' },
        }));
      } else if (update.type === 'state') {
        acceptState(update.state);
      }
    });
    socket.addEventListener('error', () => {
      notify(t('Connection interrupted. Reconnecting to your room...', 'Connessione interrotta. Riconnessione alla stanza...'), true);
    });
    socket.addEventListener('close', () => {
      connected = false;
      clearInterval(heartbeatTimer);
      render();
      if (!stopped) {
        notify(t('Connection interrupted. Reconnecting to your room...', 'Connessione interrotta. Riconnessione alla stanza...'), true);
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
        location.assign(`./?lang=${window.BingoLanguage.language}`);
        return;
      }
      acceptState(result);
      if (result.answer) {
        window.dispatchEvent(new CustomEvent('bingo:answer', { detail: result.answer }));
      }
      notify(roomHint());
    } catch (error) {
      console.error(`Room action ${action} failed:`, error);
      notify(error.message, true);
      pending = false;
      if (action === 'mark' && error.status === 409) {
        try {
          acceptState(await api('state'));
          if (state.current?.claimedBy) {
            const feedback = state.current.claimedBy === state.selfId ?
              t('You already claimed this element. No mistake counted.', 'Hai gi\u00e0 conquistato questo elemento. Nessun errore conteggiato.') :
              t(`${state.current.claimedName} got there first! No mistake counted.`,
                `${state.current.claimedName} ha fatto prima! Nessun errore conteggiato.`);
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
    if (stopped) location.assign(`./?lang=${window.BingoLanguage.language}`);
    else command('leave');
  });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(invite.value);
      notify(t('Invitation copied. Send it to your friends!', 'Invito copiato. Invialo agli amici!'));
    } catch (error) {
      console.error('Unable to copy the invitation:', error);
      invite.focus();
      invite.select();
      notify(t('Could not copy automatically. Select and copy the invitation link above.',
        'Copia automatica non riuscita. Seleziona e copia il link di invito qui sopra.'), true);
    }
  });
  window.addEventListener('bingo:action', (event) => {
    const { action, ...body } = event.detail;
    command(action, body);
  });
  window.addEventListener('bingo:language', () => {
    resultsKey = undefined;
    render();
    notify(connected ? roomHint() : t('Connecting to your room...', 'Connessione alla stanza...'));
  });
  render();
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
