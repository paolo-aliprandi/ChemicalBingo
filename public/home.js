'use strict';

(() => {
  const { t, error: translateError } = window.BingoLanguage;
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
  name.addEventListener('input', () => name.setCustomValidity(''));
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase();
  });

  const invitation = new URLSearchParams(location.search).get('room');
  if (invitation) {
    code.value = invitation.toUpperCase().slice(0, 6);
    showMultiplayer();
    status.textContent = t('You have been invited! Enter a player name, then select Join with code.',
      'Hai ricevuto un invito! Inserisci il tuo nome e scegli Entra con il codice.');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    name.setCustomValidity(name.value.trim() ? '' : t('Enter your player name.', 'Inserisci il tuo nome di gioco.'));
    if (!name.reportValidity()) return;
    const joining = event.submitter === join;
    if (joining && !/^[A-Z0-9]{6}$/.test(code.value.trim().toUpperCase())) {
      status.textContent = t('Enter the six-character room code to join.', 'Inserisci il codice stanza di sei caratteri.');
      status.classList.add('error');
      code.focus();
      return;
    }
    pending = true;
    create.disabled = true;
    join.disabled = true;
    status.classList.remove('error');
    status.textContent = joining ? t('Joining your room...', 'Ingresso nella stanza...') :
      t('Creating your room...', 'Creazione della stanza...');
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
          status.textContent = t('Create a new room, or enter a code to join your friends.',
            'Crea una stanza o inserisci un codice per raggiungere gli amici.');
        }
      });
      if (!response.headers.get('Content-Type')?.includes('application/json')) {
        const local = ['localhost', '127.0.0.1'].includes(location.hostname);
        throw new Error(local ? t('Multiplayer needs the game server. Start it with npm run dev.',
          'Il multigiocatore richiede il server del gioco. Avvialo con npm run dev.') :
          t(`Multiplayer is temporarily unavailable (HTTP ${response.status}). Please retry later.`,
            `Multigiocatore temporaneamente non disponibile (HTTP ${response.status}). Riprova pi\u00f9 tardi.`));
      }
      const room = await response.json();
      if (!response.ok) throw new Error(room.error ? translateError(room.error) :
        t(`Unable to join the room (HTTP ${response.status}).`, `Impossibile entrare nella stanza (HTTP ${response.status}).`));
      location.assign(`chemical.html?room=${room.code}&lang=${window.BingoLanguage.language}`);
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
