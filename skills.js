// Skills list, built from data instead of hand-written HTML.
// The array is the single source of truth: change the array, save it, then call renderSkills().
// Saved in localStorage, so changes survive a reload (in this browser only).

const STORAGE_KEY = 'skills';

const DEFAULT_SKILLS = [
  'Logistics',
  'Motorcycle riding',
  'Budding AI creator',
  'Planning and problem-solving'
];

const skills = loadSkills();

const skillsList = document.getElementById('skills-list');
const skillsCount = document.getElementById('skills-count');
const skillForm = document.getElementById('skill-form');
const skillInput = document.getElementById('skill-name');
const searchInput = document.getElementById('skill-search');
const searchClear = document.getElementById('skill-search-clear');
const skillsEmpty = document.getElementById('skills-empty');

const { matchesQuery } = window.SkillSearch;

// Use the saved list if there is a valid one, otherwise start from the defaults.
// localStorage can throw (private browsing, storage turned off), so guard it.
function loadSkills() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.every((s) => typeof s === 'string')) {
      return saved;
    }
  } catch (e) {}
  return DEFAULT_SKILLS.slice();
}

function saveSkills() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(skills));
  } catch (e) {}
}

// Clear the list, then build one <li> per item in the array that matches the search box.
function renderSkills() {
  skillsList.replaceChildren();

  const query = searchInput.value;
  let shown = 0;

  skills.forEach((skill, index) => {
    // Skip non-matches instead of filtering into a new array, so `index` stays
    // the skill's real position in `skills` and remove/edit hit the right one.
    // Skills are plain strings with no description, so only the name is searched.
    if (!matchesQuery({ name: skill }, query)) return;
    shown++;

    const item = document.createElement('li');
    item.className = 'skill-item';
    item.dataset.index = index;

    // The name is a button so it can be clicked or reached with the keyboard to edit.
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'skill-name';
    name.textContent = skill; // textContent, not innerHTML, so typed text can't inject markup
    name.title = 'Click to edit';
    name.addEventListener('click', () => startEditing(item, index));

    // Each remove button remembers its own index through this closure.
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button-secondary';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove ' + skill);
    remove.addEventListener('click', () => removeSkill(index));

    item.append(name, remove);
    skillsList.appendChild(item);
  });

  const total = skills.length;
  const noun = total === 1 ? ' skill' : ' skills';
  const filtering = query.trim() !== '';
  skillsCount.textContent = filtering
    ? 'Showing ' + shown + ' of ' + total + noun
    : 'Showing ' + total + noun;

  skillsEmpty.hidden = !(filtering && shown === 0);
  searchClear.hidden = searchInput.value === '';
}

function clearSearch() {
  searchInput.value = '';
  renderSkills();
  searchInput.focus();
}

searchInput.addEventListener('input', renderSkills);

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && searchInput.value !== '') {
    event.preventDefault();
    clearSearch();
  }
});

searchClear.addEventListener('click', clearSearch);

function removeSkill(index) {
  skills.splice(index, 1);
  saveSkills();
  renderSkills();
  skillInput.focus(); // the button that had focus is gone, so put focus somewhere useful
}

// Swap the name for a text box. Enter or clicking away saves, Escape cancels.
function startEditing(item, index) {
  const field = document.createElement('input');
  field.type = 'text';
  field.className = 'skill-edit';
  field.value = skills[index];
  field.maxLength = 60;
  field.setAttribute('aria-label', 'Edit skill');

  let done = false; // Enter also triggers blur when the list re-renders; only finish once

  function finish(save) {
    if (done) return;
    done = true;
    const value = field.value.trim();
    if (save && value) {
      skills[index] = value;
      saveSkills();
    }
    renderSkills();
    // Return focus to the name we just edited. If the new name no longer
    // matches the search, it's hidden now, so go back to the search box.
    const edited = skillsList.querySelector('[data-index="' + index + '"] .skill-name');
    (edited || searchInput).focus();
  }

  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  });
  field.addEventListener('blur', () => finish(true));

  item.querySelector('.skill-name').replaceWith(field);
  field.focus();
  field.select();
}

skillForm.addEventListener('submit', (event) => {
  event.preventDefault(); // stay on the page instead of submitting the form

  const name = skillInput.value.trim();
  if (!name) return;

  skills.push(name);
  saveSkills();
  renderSkills();

  skillForm.reset();
  skillInput.focus();
});

renderSkills();
