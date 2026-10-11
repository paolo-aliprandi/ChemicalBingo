'use strict';

(() => {
  const choose = document.getElementById('chooseMultiplayer');
  const form = document.getElementById('roomForm');
  const name = document.getElementById('playerName');
  const code = document.getElementById('roomCode');
  const status = document.getElementById('roomStatus');
  const create = document.getElementById('createRoom');
  const join = document.getElementById('joinRoom');
  let pending = false;

  function showMultiplayer() {
    choose.setAttribute('aria-expanded', 'true');
    form.hidden = false;
    name.focus();
  }

  choose.addEventListener('click', showMultiplayer);
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase();
  });

  const invitation = new URLSearchParams(location.search).get('room');
  if (invitation) {
    code.value = invitation.toUpperCase().slice(0, 6);
    showMultiplayer();
    status.textContent = 'You have been invited! Enter a player name, then select Join with code.';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !name.reportValidity()) return;
    const joining = event.submitter === join;
    if (joining && !/^[A-Z0-9]{6}$/.test(code.value.trim().toUpperCase())) {
      status.textContent = 'Enter the six-character room code to join.';
      status.classList.add('error');
      code.focus();
      return;
    }
    pending = true;
    create.disabled = true;
    join.disabled = true;
    status.classList.remove('error');
    status.textContent = joining ? 'Joining your room...' : 'Creating your room...';
    const path = joining ? `/api/rooms/${code.value.trim().toUpperCase()}/join` : '/api/rooms';
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.value.trim() }),
      });
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
          pending = false;
          create.disabled = false;
          join.disabled = false;
          status.classList.remove('error');
          status.textContent = 'Create a new room, or enter a code to join your friends.';
        }
      });
      if (!response.headers.get('Content-Type')?.includes('application/json')) {
        const local = ['localhost', '127.0.0.1'].includes(location.hostname);
        throw new Error(local ? 'Multiplayer needs the game server. Start it with npm run dev.' :
          `Multiplayer is temporarily unavailable (HTTP ${response.status}). Please retry later.`);
      }
      const room = await response.json();
      if (!response.ok) throw new Error(room.error || `Unable to join the room (HTTP ${response.status}).`);
      location.assign(`chemical.html?room=${room.code}`);
    } catch (error) {
      console.error('Unable to enter a multiplayer room:', error);
      status.textContent = error.message;
      status.classList.add('error');
      pending = false;
      create.disabled = false;
      join.disabled = false;
    }
  });
})();
