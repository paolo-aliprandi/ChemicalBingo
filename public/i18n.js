'use strict';

(() => {
  let saved;
  try {
    saved = localStorage.getItem('chemical-bingo-language');
  } catch (error) {
    console.warn('Unable to read the language preference:', error);
  }
  const requested = new URLSearchParams(location.search).get('lang');
  let language = ['en', 'it'].includes(requested) ? requested :
    ['en', 'it'].includes(saved) ? saved : navigator.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const names = {
    H: 'Idrogeno', He: 'Elio', Li: 'Litio', Be: 'Berillio', Na: 'Sodio', Mg: 'Magnesio',
    K: 'Potassio', Ca: 'Calcio', Rb: 'Rubidio', Sr: 'Stronzio', Cs: 'Cesio', Ba: 'Bario',
    Fr: 'Francio', Ra: 'Radio', B: 'Boro', C: 'Carbonio', N: 'Azoto', O: 'Ossigeno',
    F: 'Fluoro', Ne: 'Neon', Al: 'Alluminio', Si: 'Silicio', P: 'Fosforo', S: 'Zolfo',
    Cl: 'Cloro', Ar: 'Argon', Ga: 'Gallio', Ge: 'Germanio', As: 'Arsenico', Se: 'Selenio',
    Br: 'Bromo', Kr: 'Kripton', In: 'Indio', Sn: 'Stagno', Sb: 'Antimonio', Te: 'Tellurio',
    I: 'Iodio', Xe: 'Xenon', Tl: 'Tallio', Pb: 'Piombo', Bi: 'Bismuto', Po: 'Polonio',
    At: 'Astato', Rn: 'Radon', Nh: 'Nihonio', Fl: 'Flerovio', Mc: 'Moscovio',
    Lv: 'Livermorio', Ts: 'Tennesso', Og: 'Oganesson', Sc: 'Scandio', Ti: 'Titanio',
    V: 'Vanadio', Cr: 'Cromo', Mn: 'Manganese', Fe: 'Ferro', Co: 'Cobalto', Ni: 'Nichel',
    Cu: 'Rame', Zn: 'Zinco', Y: 'Ittrio', Zr: 'Zirconio', Nb: 'Niobio', Mo: 'Molibdeno',
    Tc: 'Tecnezio', Ru: 'Rutenio', Rh: 'Rodio', Pd: 'Palladio', Ag: 'Argento', Cd: 'Cadmio',
    Lu: 'Lutezio', Hf: 'Afnio', Ta: 'Tantalio', W: 'Tungsteno', Re: 'Renio', Os: 'Osmio',
    Ir: 'Iridio', Pt: 'Platino', Au: 'Oro', Hg: 'Mercurio', Lr: 'Laurenzio',
    Rf: 'Rutherfordio', Db: 'Dubnio', Sg: 'Seaborgio', Bh: 'Bohrio', Hs: 'Hassio',
    Mt: 'Meitnerio', Ds: 'Darmstadtio', Rg: 'Roentgenio', Cn: 'Copernicio',
    La: 'Lantanio', Ce: 'Cerio', Pr: 'Praseodimio', Nd: 'Neodimio', Pm: 'Promezio',
    Sm: 'Samario', Eu: 'Europio', Gd: 'Gadolinio', Tb: 'Terbio', Dy: 'Disprosio',
    Ho: 'Olmio', Er: 'Erbio', Tm: 'Tulio', Yb: 'Itterbio', Ac: 'Attinio', Th: 'Torio',
    Pa: 'Protoattinio', U: 'Uranio', Np: 'Nettunio', Pu: 'Plutonio', Am: 'Americio',
    Cm: 'Curio', Bk: 'Berkelio', Cf: 'Californio', Es: 'Einsteinio', Fm: 'Fermio',
    Md: 'Mendelevio', No: 'Nobelio',
  };
  const translate = (english, italian) => language === 'it' ? italian : english;
  const staticText = {
    '.subtitle': 'Un po\' di chimica. Tante scoperte.',
    '.intro .eyebrow': 'Impara e gioca',
    '.intro h2': 'Una cartella. Un mondo di elementi.',
    '.intro > .hint': 'Estrai da tutti i 118 elementi, abbina i nomi ai simboli e festeggia ogni riga completata. Gioca al tuo ritmo o invita gli amici.',
    '.mode h3': 'Giocatore singolo',
    'a.mode .hint': 'La tua cartella, il tuo ritmo. Scopri tutti gli elementi e completa la cartella.',
    'a.mode .mode-action': 'Inizia a giocare \u2192',
    '#chooseMultiplayer .mode-title': 'Multigiocatore',
    '#chooseMultiplayer .hint': 'Cartelle diverse, indizi condivisi. Sfida gli amici a raccogliere pi\u00f9 punti in 10 minuti. Non serve completare la cartella per vincere.',
    '#chooseMultiplayer .mode-action': 'Gioca con gli amici \u2192',
    '.room-form h3': 'Tutti nella stessa stanza',
    '.room-form > .hint': 'Crea una stanza e condividi il codice, oppure inserisci un codice per partecipare. Fino a 20 giocatori.',
    'label[for="playerName"]': 'Il tuo nome di gioco',
    'label[for="roomCode"]': 'Codice stanza',
    '#codeHint': 'Serve solo per entrare in una stanza.',
    '#createRoom': 'Crea stanza',
    '#joinRoom': 'Entra con il codice',
    '#roomStatus': 'Ognuno ha la propria cartella. L\'organizzatore avvia la partita quando tutti sono pronti.',
    'main > .footer': 'Non serve un account. Scegli un nome e divertiti con la chimica.',
    '.home-link': 'Pagina iniziale',
    '.room-heading .eyebrow': 'Multigiocatore in diretta',
    '#leaveRoom': 'Esci dalla stanza',
    '#copyInvite': 'Copia invito',
    '#startRoom': 'Avvia partita',
    '#instructions': 'Tutti i 118 elementi possono essere estratti, in qualsiasi ordine. Abbina il simbolo in qualunque riga o passa se non lo hai. Ogni abbinamento corretto fa guadagnare punti.',
    '#resultsPanel .eyebrow': 'Il podio finale',
    '#resultsPanel > .hint': 'Allo scadere vince il punteggio pi\u00f9 alto; non serve completare la cartella. Completarla fa vincere subito. Gli errori non tolgono punti.',
    '#timerLabel': 'Tempo rimasto',
    '#resultsHome': 'Pagina iniziale',
    '#playAgain': 'Gioca ancora',
    '#clueLabel': 'Trova questo elemento',
    '#activeBlock': 'Preparazione della cartella...',
    '#status': 'Caricamento degli elementi...',
    '#boardTitle': 'La tua cartella',
    '#blockProgress': '0 / 4 righe complete',
    '#progressLabel': 'Elementi abbinati',
    '#mistakeProgress': '0 errori',
    '#resetGame': 'Nuova partita',
    '#nextElement': 'Prossimo elemento \u2192',
    '.keyboard-hint': 'Gioca come preferisci: seleziona un simbolo oppure usa Tab e Invio.',
    'body > .footer': 'Tombola Chimica ispirata al lavoro del Prof. Marco Lambruschi. Tutti i diritti riservati \u00ae',
  };
  const errors = {
    'Something went wrong. Please retry.': 'Si \u00e8 verificato un problema. Riprova.',
    'Multiplayer requires HTTPS. Open the secure game URL.': 'Il multigiocatore richiede HTTPS. Apri l\'indirizzo sicuro del gioco.',
    'Use the game on its own website.': 'Usa il gioco sul suo sito.',
    'This game endpoint does not exist.': 'Questo indirizzo del gioco non esiste.',
    'Join the room before playing.': 'Entra nella stanza prima di giocare.',
    'Please join the room again.': 'Entra nuovamente nella stanza.',
    'Send a JSON request.': 'Invia una richiesta JSON.',
    'The request body is missing.': 'Manca il contenuto della richiesta.',
    'The request is too large.': 'La richiesta \u00e8 troppo grande.',
    'The request contains invalid JSON.': 'La richiesta contiene JSON non valido.',
    'The request must be a JSON object.': 'La richiesta deve essere un oggetto JSON.',
    'Choose a player name between 1 and 24 characters.': 'Scegli un nome da 1 a 24 caratteri.',
    'That room code is already in use.': 'Questo codice stanza \u00e8 gi\u00e0 in uso.',
    'Room not found. Check the code or create a new room.': 'Stanza non trovata. Controlla il codice o crea una nuova stanza.',
    'The game has started. Ask the host to reset the room before joining.': 'La partita \u00e8 iniziata. Chiedi all\'organizzatore di reimpostare la stanza prima di entrare.',
    'This room already has 20 players.': 'Questa stanza ha gi\u00e0 20 giocatori.',
    'That player name is already in use in this room.': 'Questo nome \u00e8 gi\u00e0 in uso nella stanza.',
    'You are no longer in this room. Please join again.': 'Non sei pi\u00f9 in questa stanza. Entra di nuovo.',
    'Use a WebSocket connection.': 'Usa una connessione WebSocket.',
    'This player already has three open game tabs.': 'Questo giocatore ha gi\u00e0 tre schede del gioco aperte.',
    'Please wait a moment before the next action.': 'Attendi un momento prima della prossima azione.',
    'Only the host can do that.': 'Solo l\'organizzatore pu\u00f2 farlo.',
    'This game has already started.': 'Questa partita \u00e8 gi\u00e0 iniziata.',
    'Wait for the host to start the game.': 'Attendi che l\'organizzatore avvii la partita.',
    'This game has ended. Check the scoreboard.': 'La partita \u00e8 terminata. Guarda la classifica.',
    'No claimable elements remain. Wait for the final scoreboard.': 'Non restano elementi da conquistare. Attendi la classifica finale.',
    'The clue changed. Please use the current element.': 'L\'indizio \u00e8 cambiato. Usa l\'elemento attuale.',
    'Choose an available symbol on your board.': 'Scegli un simbolo disponibile nella cartella.',
    'Take a moment, then try again.': 'Attendi un momento, poi riprova.',
    'You skipped this clue. Wait for the next element.': 'Hai passato questo indizio. Attendi il prossimo elemento.',
    'The next clue is already on its way.': 'Il prossimo indizio sta gi\u00e0 arrivando.',
    'Unknown room action.': 'Azione della stanza non riconosciuta.',
    'The room expired.': 'La stanza \u00e8 scaduta.',
    'The room is empty.': 'La stanza \u00e8 vuota.',
    'Room expired after two hours without activity.': 'La stanza \u00e8 scaduta dopo due ore di inattivit\u00e0.',
    'All players have left the room.': 'Tutti i giocatori hanno lasciato la stanza.',
  };
  window.BingoLanguage = {
    get language() { return language; },
    t: translate,
    element(symbol, english) {
      if (language === 'en') return english;
      if (!names[symbol]) throw new Error(`Missing Italian element name: ${symbol}`);
      return names[symbol];
    },
    points: (count) => `${count} ${translate(count === 1 ? 'point' : 'points', count === 1 ? 'punto' : 'punti')}`,
    mistakes: (count) => `${count} ${translate(count === 1 ? 'mistake' : 'mistakes', count === 1 ? 'errore' : 'errori')}`,
    error(message) {
      if (language === 'en') return message;
      if (errors[message]) return errors[message];
      const claimed = message.match(/^Already claimed by (.+)\. Wait for the next element\.$/s);
      if (claimed) return `Elemento conquistato da ${claimed[1]}. Attendi il prossimo.`;
      console.warn('Untranslated server message:', message);
      return `Richiesta non riuscita. Riprova. (${message})`;
    },
  };
  const originalText = new Map();
  for (const selector of Object.keys(staticText)) {
    const element = document.querySelector(selector);
    if (element) originalText.set(element, element.textContent);
  }
  const originalAttributes = new Map();
  function applyLanguage() {
    document.documentElement.lang = language;
    for (const [selector, text] of Object.entries(staticText)) {
      const element = document.querySelector(selector);
      if (element) element.textContent = translate(originalText.get(element), text);
    }
    const attributes = [
      ['a.mode', 'aria-label', 'Avvia una partita singola'],
      ['#playerName', 'placeholder', 'es. Giocatore 1'],
      ['#roomPanel', 'aria-label', 'Stanza multigiocatore'],
      ['#inviteLink', 'aria-label', 'Link di invito alla stanza'],
      ['#playerList', 'aria-label', 'Punteggi dei giocatori'],
      ['#timerPanel', 'aria-label', 'Timer della partita'],
      ['#gameTime', 'aria-label', 'Tempo rimasto'],
      ['#clueCountdown', 'aria-label', 'Tempo rimasto per l\'indizio'],
      ['#finalRanking', 'aria-label', 'Classifica finale'],
      ['.clue-card', 'aria-label', 'Indizio attuale'],
      ['#bingoGrid', 'aria-label', 'Cartella della Tombola Chimica'],
      ['meta[name="description"]', 'content', 'Impara gli elementi con Chemical Bingo. Gioca da solo o invita gli amici in una stanza multigiocatore.'],
    ];
    for (const [selector, attribute, text] of attributes) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const key = `${selector}:${attribute}`;
      if (!originalAttributes.has(key)) originalAttributes.set(key, element.getAttribute(attribute));
      element.setAttribute(attribute, translate(originalAttributes.get(key), text));
    }
    document.title = document.getElementById('roomForm') ?
      translate('Chemical Bingo - Play your way', 'Chemical Bingo - Gioca come preferisci') : 'Chemical Bingo';
    const heading = document.querySelector('.room-heading h2');
    if (heading) heading.firstChild.textContent = translate('Room ', 'Stanza ');
    for (const link of document.querySelectorAll('a[href]')) {
      const url = new URL(link.href);
      if (url.origin === location.origin) {
        url.searchParams.set('lang', language);
        link.href = url.href;
      }
    }
  }
  applyLanguage();
  const selector = document.getElementById('languageSelect');
  selector.value = language;
  selector.setAttribute('aria-label', translate('Language', 'Lingua'));
  selector.addEventListener('change', () => {
    language = selector.value;
    try {
      localStorage.setItem('chemical-bingo-language', selector.value);
    } catch (error) {
      console.warn('Unable to save the language preference:', error);
    }
    const url = new URL(location.href);
    url.searchParams.set('lang', selector.value);
    history.replaceState(null, '', url);
    applyLanguage();
    selector.setAttribute('aria-label', translate('Language', 'Lingua'));
    window.dispatchEvent(new Event('bingo:language'));
  });
})();
