'use strict';

(() => {
  const key = 'chemical-bingo-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch (error) {
    console.warn('Unable to read the theme preference:', error);
  }

  function applyTheme() {
    const dark = preference ? preference === 'dark' : system.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.textContent = window.BingoLanguage?.t('Dark mode', 'Modalit\u00e0 scura') || 'Dark mode';
    }
  }

  applyTheme();
  system.addEventListener('change', applyTheme);
  window.addEventListener('bingo:language', applyTheme);
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : undefined;
    applyTheme();
  });
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    document.getElementById('themeToggle').addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(key, preference);
      } catch (error) {
        console.warn('Unable to save the theme preference:', error);
      }
      applyTheme();
    });
  });
})();
