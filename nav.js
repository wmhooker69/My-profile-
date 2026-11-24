// Burger menu for small screens. Shared by every page.
const menuToggle = document.querySelector('.menu-toggle');
const navMenu = document.getElementById('nav-menu');

function setMenuOpen(open) {
  menuToggle.setAttribute('aria-expanded', String(open));
}

menuToggle.addEventListener('click', () => {
  setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
});

// Close the menu after choosing a link
navMenu.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenuOpen(false);
});

// Close with Escape and return focus to the button
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    setMenuOpen(false);
    menuToggle.focus();
  }
});
