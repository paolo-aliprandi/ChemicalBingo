'use strict';

(() => {
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

  function setStatus(message, tone = 'info') {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function updateControls() {
    const self = roomState?.players.find((player) => player.id === roomState.selfId);
    const coolingDown = roomMode && roomState?.retryEndsAt > Date.now();
    const unavailable = roomMode && (!roomState?.connected || roomState.pending ||
      roomState.phase !== 'playing' || self?.ready || roomState.advancing || coolingDown);
    resetButton.disabled = loading || (roomMode && elements && (!roomState?.connected ||
      roomState.pending || roomState.hostId !== roomState.selfId));
    resetButton.textContent = roomMode ? 'Reset room' : 'New game';
    nextButton.disabled = loading || busy || !current || unavailable;
    if (!roomMode) nextButton.textContent = 'Next element \u2192';
    else if (roomState?.phase === 'finished') nextButton.textContent = 'Competition finished';
    else if (roomState?.advancing) nextButton.textContent = 'Next clue coming...';
    else nextButton.textContent = self?.ready ? 'Waiting for players...' : 'Skip / Ready \u2192';
    let matched = 0;
    let completed = 0;
    for (const row of rows) {
      const count = row.cells.filter((cell) => cell.marked).length;
      matched += count;
      if (count === row.cells.length) completed += 1;
      row.count.textContent = `${count}/5`;
      row.element.classList.toggle('active', row.block === current?.block);
      for (const cell of row.cells) {
        cell.button.disabled = loading || busy || cell.marked || cell.taken || !current || unavailable ||
          (roomMode && row.block !== current.block);
      }
    }
    progressLabel.textContent = roomMode ? 'Your score' : 'Elements matched';
    matchProgress.textContent = roomMode ? `${matched} ${matched === 1 ? 'point' : 'points'}` : `${matched} / 20`;
    blockProgress.textContent = roomMode ? roomState?.phase === 'finished' ? '4 / 4 rounds' :
      roomState?.phase === 'playing' ? `Round ${roomState.round} / 4` : '4 competitive rounds' :
      `${completed} / 4 blocks`;
    progress.value = matched;
    const count = roomMode ? self?.mistakes || 0 : mistakes;
    mistakeProgress.textContent = `${count} ${count === 1 ? 'mistake' : 'mistakes'}`;
  }

  function celebrateRow(row) {
    row.element.classList.add('completed', 'celebrating');
    celebrationMessage.textContent = `${row.block} block complete`;
    celebration.hidden = false;
    setStatus(`Bingo! The ${row.block} block is complete.`, 'success');
  }

  function roomStatus() {
    if (!roomState || busy) return;
    if (!roomState.connected) {
      setStatus('Connection lost. Reconnecting to your room...', 'error');
    } else if (roomState.phase === 'lobby') {
      setStatus(roomState.hostId === roomState.selfId ?
        'Share the room code, then start the game when everyone has joined.' :
        'You are in! Waiting for the host to start the game.');
    } else if (roomState.phase === 'finished') {
      const winners = roomState.players.filter((player) => roomState.winnerIds.includes(player.id));
      setStatus(winners.length ? `${winners.map((player) => player.name).join(' & ')} ${winners.length > 1 ? 'tie for the win' : 'wins'} with ${winners[0].matched} ${winners[0].matched === 1 ? 'point' : 'points'}!` :
        'No elements were claimed. Start a new game to compete.', 'success');
    } else if (roomState.intermission) {
      setStatus(roomState.round === 4 ? 'All four rounds complete. Your final ranking is coming up!' :
        'Round complete! Take a breath before the next orbital.', 'success');
    } else if (current?.claimedBy) {
      const yours = current.claimedBy === roomState.selfId;
      setStatus(yours ? `You claimed ${current.name}! +1 point. The next clue is on its way.` :
        `${current.claimedName} got there first! No mistake counted. Next clue coming soon.`, yours ? 'success' : 'race');
    } else if (roomState.retryEndsAt > Date.now()) {
      setStatus('Not quite! Take a moment, then try again. Your points are safe.', 'wrong');
    } else if (roomState.advancing) {
      setStatus('Everyone is ready. The next clue is on its way...', 'success');
    } else {
      const self = roomState.players.find((player) => player.id === roomState.selfId);
      const ready = roomState.players.filter((player) => player.ready).length;
      setStatus(self?.ready ? `Ready! Waiting for the other players (${ready}/${roomState.players.length} ready).` :
        'Be first to claim the matching symbol! If you do not have it, choose Skip / Ready.');
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
    current = state.current ? {
      ...state.current,
      symbol: Object.keys(elements[state.current.block]).find((symbol) =>
        elements[state.current.block][symbol] === state.current.name),
    } : undefined;
    const lost = Boolean(current?.claimedBy && current.claimedBy !== state.selfId);
    prompt.parentElement.classList.toggle('lost-clue', lost);
    prompt.parentElement.hidden = state.intermission || state.phase === 'finished';
    answerReveal.hidden = !state.previousAnswer;
    answerReveal.textContent = state.previousAnswer ?
      `Answer revealed: ${state.previousAnswer.name} = ${state.previousAnswer.symbol}` : '';
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
        cell.button.setAttribute('aria-label', cell.taken ? `${cell.symbol}, claimed by ${owner.name}` : cell.symbol);
        cell.owner.hidden = !cell.taken;
        cell.ownerName.textContent = cell.taken ? owner.name : '';
        cell.button.title = cell.taken ? `${cell.symbol} was claimed by ${owner.name}` : '';
      }
      const complete = row.cells.every((cell) => cell.marked);
      row.element.classList.toggle('completed', complete);
      if (complete && !wasComplete) completedRow = row;
    }
    if (state.phase === 'lobby') {
      clueLabel.textContent = 'Your room is ready';
      prompt.textContent = 'Gather your players';
      activeBlock.textContent = 'Different boards. Shared clues. First valid claim wins each element.';
    } else if (state.phase === 'finished') {
      const winners = state.players.filter((player) => state.winnerIds.includes(player.id));
      clueLabel.textContent = 'Competition complete';
      prompt.textContent = winners.some((player) => player.id === state.selfId) ? 'You win!' : 'Game over';
      activeBlock.textContent = winners.length ? `Winner${winners.length > 1 ? 's' : ''}: ${winners.map((player) => player.name).join(' & ')}` :
        'No claims this game. Try a new round!';
    } else {
      clueLabel.textContent = current.claimedBy ? lost ? `Claimed by ${current.claimedName}` : 'You claimed it!' : 'Race to claim this element';
      prompt.textContent = current.name;
      activeBlock.textContent = current.claimedBy ? lost ? `${current.claimedName} took this element. Next clue coming soon.` :
        '+1 point! Next clue coming soon.' : `${current.block} round \u00b7 First correct claim wins.`;
    }
    if (completedRow) {
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
    const row = rows.find((candidate) => candidate.cells.some((cell) => !cell.marked));
    if (!row) {
      current = undefined;
      prompt.textContent = 'Bingo!';
      clueLabel.textContent = 'Board complete';
      activeBlock.textContent = '20 elements discovered. Nicely done!';
      setStatus('Congratulations! You completed all four blocks. Start a new game to play again.', 'success');
      updateControls();
      return;
    }

    if (row.draws.length === 0) {
      row.draws = Object.entries(elements[row.block]).filter(([symbol]) =>
        !row.cells.some((cell) => cell.marked && cell.symbol === symbol));
    }
    const available = row.draws.filter(([symbol]) =>
      row.draws.length === 1 || symbol !== current?.symbol);
    const chosen = available[Math.floor(Math.random() * available.length)];
    row.draws.splice(row.draws.indexOf(chosen), 1);
    const [symbol, name] = chosen;
    current = { symbol, name, block: row.block };
    clueLabel.textContent = 'Find this element';
    activeBlock.textContent = `${row.block} block \u00b7 Not on your board? Skip to the next element.`;
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
        setStatus(`Correct! ${cell.symbol} is ${cell.name}.`, 'success');
      }
    } else {
      mistakes += 1;
      cell.button.classList.add('wrong');
      setStatus(`Not quite. Find the symbol for ${current.name} and try again.`, 'wrong');
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
      const heading = document.createElement('th');
      heading.scope = 'row';
      heading.setAttribute('aria-label', `${block} block`);
      const label = document.createElement('span');
      label.classList.add('block-symbol');
      label.textContent = block;
      const count = document.createElement('span');
      count.classList.add('block-count');
      count.setAttribute('aria-hidden', 'true');
      heading.appendChild(label);
      heading.appendChild(count);
      element.appendChild(heading);
      const row = { block, element, count, cells: [], draws: Object.entries(elements[block]) };
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
        ownerLabel.textContent = 'Claimed by';
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
    mistakes = 0;
    answerReveal.hidden = true;
    current = undefined;
    prompt.textContent = '';
    clueLabel.textContent = 'Find this element';
    activeBlock.textContent = 'Preparing your board...';
    loading = true;
    setStatus('Loading elements...');
    updateControls();

    try {
      if (!elements) {
        const response = await fetch('elements.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        elements = validateElements(await response.json());
      }
      loading = false;
      if (roomMode) {
        setStatus('Connecting to your multiplayer room...');
        updateControls();
      } else {
        initializeGrid();
        setStatus('Match the symbol if you have it. Otherwise, use Next element to skip.');
        drawElement();
      }
      document.documentElement.dataset.gameReady = 'true';
      window.dispatchEvent(new Event('bingo:ready'));
    } catch (error) {
      loading = false;
      current = undefined;
      grid.replaceChildren();
      rows = [];
      activeBlock.textContent = 'Your board could not be loaded.';
      console.error('Unable to load Chemical Bingo:', error);
      setStatus('Unable to load elements. Serve this folder over HTTP, then select New game to retry.', 'error');
      updateControls();
    }
  }

  window.addEventListener('bingo:room', (event) => applyRoom(event.detail));
  window.addEventListener('bingo:feedback', (event) => {
    setStatus(event.detail.message, event.detail.tone);
  });
  window.addEventListener('bingo:answer', (event) => {
    const answer = event.detail;
    if (answer.gameId !== roomState?.gameId || answer.drawId !== current?.id ||
        current.claimedBy || roomState.intermission) return;
    const cell = rows.flatMap((row) => row.cells).find((candidate) => candidate.symbol === answer.symbol);
    if (!cell) return;
    clearFeedback();
    busy = true;
    cell.button.classList.add('wrong');
    setStatus('Not quite! Take a moment, then try again. Your points are safe.', 'wrong');
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
    setStatus('Match the symbol if you have it. Otherwise, skip to the next element.');
    drawElement();
  });
  resetGame();
})();
