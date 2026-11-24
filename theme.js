// Theme toggle: switches between light and dark mode and remembers the choice.
// The initial theme is set by the inline snippet in <head> (before first paint);
// this file wires up the button and follows system changes until the user picks one.
(function () {
  const STORAGE_KEY = 'theme';
  const root = document.documentElement;
  const toggle = document.querySelector('.theme-toggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function savedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null; // storage blocked (e.g. some private modes)
    }
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  }

  applyTheme(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  // <button> is keyboard-accessible by default: Enter and Space both fire click.
  toggle.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      // Not saved, but the switch still works for this visit.
    }
  });

  // Follow the OS setting live, but only until the user makes a choice.
  systemDark.addEventListener('change', (event) => {
    if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light');
  });
})();
