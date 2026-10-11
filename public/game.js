'use strict';

(() => {
  const { t, element: elementName, points, mistakes: mistakeCount } = window.BingoLanguage;
  const blocks = ['s', 'p', 'd', 'f'];
  const grid = document.getElementById('bingoGrid');
  const prompt = document.getElementById('currentElement');
  const status = document.getElementById('status');
  const resetButton = document.getElementById('resetGame');
  const nextButton = document.getElementById('nextElement');
  const activeBlock = document.getElementById('activeBlock');
  const clueLabel = document.getElementById('clueLabel');
  const matchProgress = document.getElementById('matchProgress');
  const blockProgress = document.getElementById('blockProgress');
  const progress = document.getElementById('gameProgress');
  const progressLabel = document.getElementById('progressLabel');
  const celebration = document.getElementById('celebration');
  const celebrationMessage = document.getElementById('celebrationMessage');
  const mistakeProgress = document.getElementById('mistakeProgress');
  const answerReveal = document.getElementById('answerReveal');
  const timerPanel = document.getElementById('timerPanel');
  const gameTime = document.getElementById('gameTime');
  const clueTime = document.getElementById('clueTime');
  const clueCountdown = document.getElementById('clueCountdown');
  const roomMode = new URLSearchParams(location.search).has('room');
  let elements;
  let rows = [];
  let current;
  let feedbackTimer;
  let loading = false;
  let busy = false;
  let roomState;
  let boardKey;
  let mistakes = 0;
  let cooldownTimer;
  let draws = [];
  const blockPoints = { s: 1, p: 2, d: 3, f: 4 };

  function timeRemaining() {
    return roomState ? Math.max(0, roomState.remainingMs - (performance.now() - roomState.receivedAt)) : 0;
  }

  function updateTimer() {
    timerPanel.hidden = !roomMode;
    if (!roomMode) return;
    const milliseconds = roomState?.phase === 'lobby' || !roomState ? 600000 : timeRemaining();
    const seconds = Math.ceil(milliseconds / 1000);
    gameTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    timerPanel.classList.toggle('time-low', roomState?.phase === 'playing' && seconds <= 60);
    const clueMs = roomState?.phase === 'playing' && current ?
      Math.min(milliseconds, Math.max(0, roomState.clueRemainingMs - (performance.now() - roomState.receivedAt))) : 0;
    clueTime.textContent = roomState?.phase === 'finished' ? t('Game finished', 'Partita terminata') :
      !current ? t('Waiting for a clue', 'In attesa di un indizio') :
      roomState.advancing ? t(`Next clue in ${Math.ceil(clueMs / 1000)}s`, `Prossimo indizio tra ${Math.ceil(clueMs / 1000)}s`) :
      t(`${Math.ceil(clueMs / 1000)}s to claim`, `${Math.ceil(clueMs / 1000)}s per conquistarlo`);
    clueCountdown.value = clueMs;
    updateControls();
  }

  function setStatus(message, tone = 'info') {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function updateControls() {
    const self = roomState?.players.find((player) => player.id === roomState.selfId);
    const coolingDown = roomMode && roomState?.retryEndsAt > Date.now();
    const unavailable = roomMode && (!roomState?.connected || roomState.pending ||
      roomState.phase !== 'playing' || self?.ready || roomState.advancing || coolingDown || timeRemaining() === 0);
    resetButton.disabled = loading || (roomMode && elements && (!roomState?.connected ||
      roomState.pending || roomState.hostId !== roomState.selfId));
    resetButton.textContent = roomMode ? t('Reset room', 'Reimposta stanza') : t('New game', 'Nuova partita');
    nextButton.disabled = loading || busy || !current || unavailable;
    if (!roomMode) nextButton.textContent = t('Next element \u2192', 'Prossimo elemento \u2192');
    else if (roomState?.phase === 'finished') nextButton.textContent = t('Competition finished', 'Sfida terminata');
    else if (roomState?.advancing) nextButton.textContent = t('Next clue coming...', 'Prossimo indizio in arrivo...');
    else nextButton.textContent = self?.ready ? t('Waiting for players...', 'In attesa dei giocatori...') :
      t('Skip / Ready \u2192', 'Passa / Pronto \u2192');
    let matched = 0;
    let completed = 0;
    for (const row of rows) {
      const count = row.cells.filter((cell) => cell.marked).length;
      matched += count;
      if (count === row.cells.length) completed += 1;
      const complete = count === row.cells.length;
      row.element.classList.toggle('completed', complete);
      row.count.textContent = complete ? t('Complete \u2713', 'Completa \u2713') : `${count}/5`;
      row.element.setAttribute('aria-label', t(`${row.block} row${complete ? ', completed' : ''}`,
        `Riga ${row.block}${complete ? ', completata' : ''}`));
      row.element.classList.toggle('active', row.block === current?.block);
      for (const cell of row.cells) {
        cell.button.disabled = loading || busy || cell.marked || cell.taken || !current || unavailable;
      }
    }
    progressLabel.textContent = roomMode ? t('Your score', 'Il tuo punteggio') : t('Elements matched', 'Elementi abbinati');
    const score = roomMode ? self?.score || 0 : rows.reduce((sum, row) =>
      sum + row.cells.filter((cell) => cell.marked).length * blockPoints[row.block], 0);
    matchProgress.textContent = roomMode ? points(score) : `${matched} / 20 \u00b7 ${points(score)}`;
    blockProgress.textContent = roomMode && roomState ?
      t(`Draw ${roomState.drawn} \u00b7 ${roomState.totalElements} possible elements`,
        `Estrazione ${roomState.drawn} \u00b7 ${roomState.totalElements} elementi possibili`) :
      t(`${completed} / 4 rows complete`, `${completed} / 4 righe complete`);
    progress.value = matched;
    const count = roomMode ? self?.mistakes || 0 : mistakes;
    mistakeProgress.textContent = mistakeCount(count);
  }

  function celebrateRow(row) {
    row.element.classList.add('completed', 'celebrating');
    celebrationMessage.textContent = t(`${row.block} row complete`, `Riga ${row.block} completata`);
    celebration.hidden = false;
    setStatus(t(`Bingo! The ${row.block} row is complete. Keep going for the full board!`,
      `Bingo! La riga ${row.block} \u00e8 completa. Continua per completare la cartella!`), 'success');
  }

  function roomStatus() {
    if (!roomState || busy) return;
    if (!roomState.connected) {
      setStatus(t('Connection lost. Reconnecting to your room...', 'Connessione persa. Riconnessione alla stanza...'), 'error');
    } else if (roomState.phase === 'lobby') {
      setStatus(roomState.hostId === roomState.selfId ?
        t('Share the room code, then start the game when everyone has joined.',
          'Condividi il codice e avvia la partita quando tutti sono entrati.') :
        t('You are in! Waiting for the host to start the game.', 'Sei dentro! Attendi che l\'organizzatore avvii la partita.'));
    } else if (roomState.phase === 'finished') {
      const winners = roomState.players.filter((player) => roomState.winnerIds.includes(player.id));
      setStatus(winners.length ? t(
        `${winners.map((player) => player.name).join(' & ')} ${winners.length > 1 ? 'tie for the win' : 'wins'} with ${points(winners[0].score)}!`,
        `${winners.map((player) => player.name).join(' & ')} ${winners.length > 1 ? 'vincono a pari merito' : 'vince'} con ${points(winners[0].score)}!`) :
        t('No elements were claimed. Start a new game to compete.', 'Nessun elemento conquistato. Avvia una nuova sfida.'), 'success');
    } else if (timeRemaining() === 0) {
      setStatus(t('Time is up! Waiting for the final scoreboard...', 'Tempo scaduto! In attesa della classifica finale...'));
    } else if (!current) {
      setStatus(t('No claimable elements remain. The scoreboard will appear when the timer ends.',
        'Non restano elementi da conquistare. La classifica apparir\u00e0 allo scadere del timer.'));
    } else if (current?.claimedBy) {
      const yours = current.claimedBy === roomState.selfId;
      setStatus(yours ? t(`You claimed ${current.name}! +${points(roomState.blockPoints[current.block])}. The next clue is on its way.`,
        `Hai conquistato ${current.name}! +${points(roomState.blockPoints[current.block])}. Il prossimo indizio sta arrivando.`) :
        t(`${current.claimedName} got there first! No mistake counted. Next clue coming soon.`,
          `${current.claimedName} ha fatto prima! Nessun errore conteggiato. Prossimo indizio in arrivo.`), yours ? 'success' : 'race');
    } else if (roomState.retryEndsAt > Date.now()) {
      setStatus(t('Not quite! Take a moment, then try again. Your points are safe.',
        'Non proprio! Attendi un momento e riprova. Non perdi punti.'), 'wrong');
    } else if (roomState.advancing) {
      setStatus(t('Everyone is ready. The next clue is on its way...', 'Tutti pronti. Il prossimo indizio sta arrivando...'), 'success');
    } else {
      const self = roomState.players.find((player) => player.id === roomState.selfId);
      const ready = roomState.players.filter((player) => player.ready).length;
      setStatus(self?.ready ? t(`Skipped! ${ready}/${roomState.players.length} ready. The clue advances automatically.`,
        `Passato! ${ready}/${roomState.players.length} pronti. L'indizio avanza automaticamente.`) :
        t('Be first to claim the matching symbol! If you do not have it, choose Skip / Ready.',
          'Conquista per primo il simbolo corretto! Se non lo hai, scegli Passa / Pronto.'));
    }
  }

  function applyRoom(state) {
    const key = `${state.code}:${state.gameId}`;
    const changed = current?.id !== state.current?.id;
    const opponentClaim = state.current?.claimedBy && state.current.claimedBy !== state.selfId &&
      state.current.claimedBy !== current?.claimedBy;
    roomState = state;
    clearTimeout(cooldownTimer);
    if (state.retryEndsAt > Date.now()) {
      cooldownTimer = setTimeout(() => {
        roomStatus();
        updateControls();
      }, state.retryEndsAt - Date.now() + 10);
    }
    if (key !== boardKey) {
      clearFeedback();
      initializeGrid(state.board);
      boardKey = key;
    } else if (opponentClaim || (changed && !rows.some((row) => row.element.classList.contains('celebrating')))) {
      clearFeedback();
    }
    if (state.current) {
      const symbol = state.current.symbol || Object.keys(elements[state.current.block]).find((candidate) =>
        elements[state.current.block][candidate] === state.current.name);
      current = { ...state.current, symbol, name: elementName(symbol, state.current.name) };
    } else current = undefined;
    const lost = Boolean(current?.claimedBy && current.claimedBy !== state.selfId);
    prompt.parentElement.classList.toggle('lost-clue', lost);
    prompt.parentElement.hidden = state.phase === 'finished';
    answerReveal.hidden = !state.previousAnswer;
    answerReveal.textContent = state.previousAnswer ?
      t(`Answer revealed: ${elementName(state.previousAnswer.symbol, state.previousAnswer.name)} = ${state.previousAnswer.symbol}`,
        `Risposta: ${elementName(state.previousAnswer.symbol, state.previousAnswer.name)} = ${state.previousAnswer.symbol}`) : '';
    let completedRow;
    for (const row of rows) {
      const wasComplete = row.cells.every((cell) => cell.marked);
      for (const cell of row.cells) {
        cell.marked = state.marked.includes(cell.symbol);
        const owner = state.claims[cell.symbol];
        cell.taken = Boolean(owner && owner.playerId !== state.selfId);
        cell.button.classList.toggle('clicked', cell.marked);
        cell.button.classList.toggle('taken', cell.taken);
        cell.button.setAttribute('aria-pressed', String(cell.marked));
        cell.button.setAttribute('aria-label', cell.taken ?
          t(`${cell.symbol}, claimed by ${owner.name}`, `${cell.symbol}, conquistato da ${owner.name}`) : cell.symbol);
        cell.owner.hidden = !cell.taken;
        cell.ownerName.textContent = cell.taken ? owner.name : '';
        cell.button.title = cell.taken ? t(`${cell.symbol} was claimed by ${owner.name}`, `${cell.symbol} conquistato da ${owner.name}`) : '';
      }
      const complete = row.cells.every((cell) => cell.marked);
      row.element.classList.toggle('completed', complete);
      if (complete && !wasComplete) completedRow = row;
    }
    if (state.phase === 'lobby') {
      clueLabel.textContent = t('Your room is ready', 'La tua stanza \u00e8 pronta');
      prompt.textContent = t('Gather your players', 'Invita i giocatori');
      activeBlock.textContent = t('Different boards. Shared clues. First valid claim wins each element.',
        'Cartelle diverse. Indizi condivisi. Il primo abbinamento valido conquista l\'elemento.');
    } else if (state.phase === 'finished') {
      const winners = state.players.filter((player) => state.winnerIds.includes(player.id));
      clueLabel.textContent = t('Competition complete', 'Sfida completata');
      prompt.textContent = winners.some((player) => player.id === state.selfId) ? t('You win!', 'Hai vinto!') : t('Game over', 'Partita terminata');
      activeBlock.textContent = winners.length ? t(`Winner${winners.length > 1 ? 's' : ''}: ${winners.map((player) => player.name).join(' & ')}`,
        `${winners.length > 1 ? 'Vincitori' : 'Vincitore'}: ${winners.map((player) => player.name).join(' & ')}`) :
        t('No claims this game. Try a new game!', 'Nessun elemento conquistato. Prova una nuova partita!');
    } else if (!current) {
      clueLabel.textContent = t('Draw pool complete', 'Estrazioni completate');
      prompt.textContent = t('No elements remaining', 'Nessun elemento rimasto');
      activeBlock.textContent = t('Final results when the timer ends.', 'Risultati finali allo scadere del timer.');
    } else {
      clueLabel.textContent = current.claimedBy ? lost ? t(`Claimed by ${current.claimedName}`, `Conquistato da ${current.claimedName}`) :
        t('You claimed it!', 'Lo hai conquistato!') : t('Race to claim this element', 'Conquista questo elemento');
      prompt.textContent = current.name;
      activeBlock.textContent = current.claimedBy ? lost ?
        t(`${current.claimedName} took this element. Next clue coming soon.`, `${current.claimedName} ha conquistato l'elemento. Prossimo indizio in arrivo.`) :
        t(`+${points(state.blockPoints[current.block])}! Next clue coming soon.`, `+${points(state.blockPoints[current.block])}! Prossimo indizio in arrivo.`) :
        t(`All 118 elements \u00b7 This claim is worth ${points(state.blockPoints[current.block])}.`,
          `Tutti i 118 elementi \u00b7 Questo elemento vale ${points(state.blockPoints[current.block])}.`);
    }
    if (state.phase === 'finished') {
      clearFeedback();
      roomStatus();
    } else if (completedRow) {
      clearFeedback();
      busy = true;
      celebrateRow(completedRow);
      feedbackTimer = setTimeout(() => {
        clearFeedback();
        roomStatus();
        updateControls();
      }, 1600);
    } else {
      roomStatus();
    }
    updateControls();
    updateTimer();
  }

  function clearFeedback() {
    clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
    busy = false;
    celebration.hidden = true;
    for (const row of rows) {
      row.element.classList.remove('celebrating');
      for (const cell of row.cells) {
        cell.button.classList.remove('wrong');
      }
    }
  }

  function drawElement() {
    if (rows.every((row) => row.cells.every((cell) => cell.marked))) {
      current = undefined;
      prompt.textContent = 'Bingo!';
      clueLabel.textContent = t('Board complete', 'Cartella completata');
      activeBlock.textContent = t('20 elements discovered. Nicely done!', '20 elementi scoperti. Complimenti!');
      setStatus(t('Congratulations! You completed your board. Start a new game to play again.',
        'Complimenti! Hai completato la cartella. Avvia una nuova partita per giocare ancora.'), 'success');
      updateControls();
      return;
    }

    if (draws.length === 0) {
      draws = blocks.flatMap((block) => Object.entries(elements[block]).map(([symbol, name]) => ({ symbol, name, block })))
        .filter(({ symbol }) => !rows.some((row) => row.cells.some((cell) => cell.marked && cell.symbol === symbol)));
    }
    const available = draws.filter(({ symbol }) => draws.length === 1 || symbol !== current?.symbol);
    const chosen = available[Math.floor(Math.random() * available.length)];
    draws.splice(draws.indexOf(chosen), 1);
    current = { ...chosen, name: elementName(chosen.symbol, chosen.name) };
    clueLabel.textContent = t('Find this element', 'Trova questo elemento');
    activeBlock.textContent = t('All 118 elements \u00b7 Not on your board? Skip to the next element.',
      'Tutti i 118 elementi \u00b7 Non lo hai? Passa al prossimo elemento.');
    prompt.textContent = current.name;
    updateControls();
  }

  function checkCell(cell, row, keyboard) {
    if (loading || busy || !current || cell.marked || cell.taken) return;

    const correct = cell.symbol === current.symbol && row.block === current.block;
    if (roomMode) {
      if (cell.button.disabled) return;
      window.dispatchEvent(new CustomEvent('bingo:action', {
        detail: { action: 'mark', symbol: cell.symbol, drawId: current.id },
      }));
      return;
    }
    busy = true;
    let rowComplete = false;
    if (correct) {
      cell.marked = true;
      cell.button.classList.add('clicked');
      cell.button.setAttribute('aria-pressed', 'true');
      if (row.cells.every((candidate) => candidate.marked)) {
        rowComplete = true;
        celebrateRow(row);
      } else {
        setStatus(t(`Correct! ${cell.symbol} is ${elementName(cell.symbol, cell.name)}.`,
          `Corretto! ${cell.symbol} \u00e8 ${elementName(cell.symbol, cell.name)}.`), 'success');
      }
    } else {
      mistakes += 1;
      cell.button.classList.add('wrong');
      setStatus(t(`Not quite. Find the symbol for ${current.name} and try again.`,
        `Non proprio. Trova il simbolo di ${current.name} e riprova.`), 'wrong');
    }
    updateControls();

    feedbackTimer = setTimeout(() => {
      clearFeedback();
      if (correct) drawElement();
      else {
        if (roomMode) roomStatus();
        updateControls();
      }
      if (keyboard && (document.activeElement === document.body ||
          document.activeElement === cell.button)) {
        let target = cell.button;
        if (correct) target = current ? nextButton : resetButton;
        target.focus({ preventScroll: true });
      }
    }, rowComplete ? 1600 : 1000);
  }

  function initializeGrid(presetBoard) {
    grid.replaceChildren();
    rows = blocks.map((block) => {
      const element = grid.insertRow();
      element.dataset.block = block;
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.setAttribute('aria-label', t(`${block} block`, `Orbitale ${block}`));
      const label = document.createElement('span');
      label.classList.add('block-symbol');
      label.textContent = block;
      const count = document.createElement('span');
      count.classList.add('block-count');
      count.setAttribute('aria-hidden', 'true');
      heading.appendChild(label);
      heading.appendChild(count);
      const weight = document.createElement('span');
      weight.className = 'block-value';
      weight.textContent = `+${blockPoints[block]}`;
      heading.appendChild(weight);
      element.appendChild(heading);
      const row = { block, element, count, cells: [] };
      const available = presetBoard ? presetBoard[block].map((symbol) => [symbol, elements[block][symbol]]) :
        Object.entries(elements[block]);

      for (let index = 0; index < 5; index += 1) {
        const choice = presetBoard ? 0 : Math.floor(Math.random() * available.length);
        const [symbol, name] = available.splice(choice, 1)[0];
        const button = document.createElement('button');
        button.type = 'button';
        button.classList.add('element');
        button.style.setProperty('--celebration-delay', `${index * 90}ms`);
        button.dataset.symbol = symbol;
        const symbolLabel = document.createElement('span');
        symbolLabel.classList.add('element-symbol');
        symbolLabel.textContent = symbol;
        const owner = document.createElement('span');
        owner.classList.add('claim-owner');
        owner.hidden = true;
        owner.setAttribute('aria-hidden', 'true');
        const ownerLabel = document.createElement('span');
        ownerLabel.textContent = t('Claimed by', 'Preso da');
        const ownerName = document.createElement('strong');
        owner.append(ownerLabel, ownerName);
        button.append(symbolLabel, owner);
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', symbol);
        const cell = { symbol, name, button, owner, ownerName, marked: false, taken: false };
        button.addEventListener('click', (event) => checkCell(cell, row, event.detail === 0));
        element.insertCell().appendChild(button);
        row.cells.push(cell);
      }
      return row;
    });
  }

  function validateElements(data) {
    const seen = new Set();
    for (const block of blocks) {
      const entries = data && data[block];
      if (!entries || typeof entries !== 'object' || Array.isArray(entries) ||
          Object.keys(entries).length < 5) {
        throw new Error(`The ${block} block must contain at least five elements.`);
      }
      for (const [symbol, name] of Object.entries(entries)) {
        if (!/^[A-Z][a-z]?$/.test(symbol) || typeof name !== 'string' ||
            !name.trim() || seen.has(symbol)) {
          throw new Error(`Invalid or duplicate element: ${symbol}.`);
        }
        seen.add(symbol);
      }
    }
    return data;
  }

  async function resetGame() {
    if (loading) return;
    clearFeedback();
    draws = [];
    mistakes = 0;
    answerReveal.hidden = true;
    current = undefined;
    prompt.textContent = '';
    clueLabel.textContent = t('Find this element', 'Trova questo elemento');
    activeBlock.textContent = t('Preparing your board...', 'Preparazione della cartella...');
    loading = true;
    setStatus(t('Loading elements...', 'Caricamento degli elementi...'));
    updateControls();

    try {
      if (!elements) {
        const response = await fetch('elements.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        elements = validateElements(await response.json());
      }
      loading = false;
      if (roomMode) {
        setStatus(t('Connecting to your multiplayer room...', 'Connessione alla stanza multigiocatore...'));
        updateControls();
      } else {
        initializeGrid();
        setStatus(t('Match the symbol if you have it. Otherwise, use Next element to skip.',
          'Abbina il simbolo se lo hai. Altrimenti scegli Prossimo elemento.'));
        drawElement();
      }
      document.documentElement.dataset.gameReady = 'true';
      window.dispatchEvent(new Event('bingo:ready'));
    } catch (error) {
      loading = false;
      current = undefined;
      grid.replaceChildren();
      rows = [];
      activeBlock.textContent = t('Your board could not be loaded.', 'Impossibile caricare la cartella.');
      console.error('Unable to load Chemical Bingo:', error);
      setStatus(t('Unable to load elements. Serve this folder over HTTP, then select New game to retry.',
        'Impossibile caricare gli elementi. Avvia un server HTTP e seleziona Nuova partita per riprovare.'), 'error');
      updateControls();
    }
  }

  window.addEventListener('bingo:room', (event) => applyRoom(event.detail));
  if (roomMode) setInterval(updateTimer, 250);
  window.addEventListener('bingo:language', () => {
    for (const row of rows) {
      row.element.querySelector('th').setAttribute('aria-label', t(`${row.block} block`, `Orbitale ${row.block}`));
      for (const cell of row.cells) cell.owner.firstChild.textContent = t('Claimed by', 'Preso da');
    }
    if (roomMode) {
      if (roomState) applyRoom(roomState);
      return;
    }
    if (current) {
      current.name = elementName(current.symbol, elements[current.block][current.symbol]);
      prompt.textContent = current.name;
      activeBlock.textContent = t('All 118 elements \u00b7 Not on your board? Skip to the next element.',
        'Tutti i 118 elementi \u00b7 Non lo hai? Passa al prossimo elemento.');
    } else if (rows.length && !loading) {
      prompt.textContent = 'Bingo!';
      clueLabel.textContent = t('Board complete', 'Cartella completata');
      activeBlock.textContent = t('20 elements discovered. Nicely done!', '20 elementi scoperti. Complimenti!');
    }
    const celebrating = rows.find((row) => row.element.classList.contains('celebrating'));
    if (celebrating) celebrateRow(celebrating);
    else setStatus(t('Match the symbol if you have it. Otherwise, skip to the next element.',
      'Abbina il simbolo se lo hai. Altrimenti passa al prossimo elemento.'));
    updateControls();
  });
  window.addEventListener('bingo:feedback', (event) => {
    setStatus(event.detail.message, event.detail.tone);
  });
  window.addEventListener('bingo:answer', (event) => {
    const answer = event.detail;
    if (answer.gameId !== roomState?.gameId || answer.drawId !== current?.id ||
        current.claimedBy) return;
    const cell = rows.flatMap((row) => row.cells).find((candidate) => candidate.symbol === answer.symbol);
    if (!cell) return;
    clearFeedback();
    busy = true;
    cell.button.classList.add('wrong');
    setStatus(t('Not quite! Take a moment, then try again. Your points are safe.',
      'Non proprio! Attendi un momento e riprova. Non perdi punti.'), 'wrong');
    updateControls();
    feedbackTimer = setTimeout(() => {
      clearFeedback();
      roomStatus();
      updateControls();
      if (document.activeElement === document.body) cell.button.focus({ preventScroll: true });
    }, Math.max(0, roomState.retryEndsAt - Date.now()));
  });
  resetButton.addEventListener('click', () => {
    if (roomMode && elements) {
      window.dispatchEvent(new CustomEvent('bingo:action', { detail: { action: 'reset' } }));
    } else {
      resetGame();
    }
  });
  nextButton.addEventListener('click', () => {
    if (loading || busy || !current) return;
    if (roomMode) {
      window.dispatchEvent(new CustomEvent('bingo:action', {
        detail: { action: 'ready', drawId: current.id },
      }));
      return;
    }
    setStatus(t('Match the symbol if you have it. Otherwise, skip to the next element.',
      'Abbina il simbolo se lo hai. Altrimenti passa al prossimo elemento.'));
    drawElement();
  });
  resetGame();
})();
