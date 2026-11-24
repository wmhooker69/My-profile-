// Projects page: add form, filter chips, grouped list, and delete with confirmation.
// Data rules live in projects-store.js; categories live in project-categories.js.
(function () {
  const { CATEGORIES, createProjectsStore, filterProjects, countByCategory } = window.ProjectsStore;

  // localStorage can be blocked (some private modes); fall back to memory for this visit.
  function getStorage() {
    try {
      const s = window.localStorage;
      s.getItem('projects');
      return s;
    } catch (e) {
      const memory = {};
      return { getItem: (k) => memory[k] ?? null, setItem: (k, v) => { memory[k] = String(v); } };
    }
  }

  const store = createProjectsStore(getStorage());

  const form = document.getElementById('project-form');
  const fields = {
    name: document.getElementById('project-name'),
    description: document.getElementById('project-description'),
    category: document.getElementById('project-category')
  };
  const status = document.getElementById('project-status');
  const filterBar = document.getElementById('project-filters');
  const groupsEl = document.getElementById('project-groups');
  const listHeading = document.getElementById('projects-heading');

  let activeFilter = 'all';
  let pendingDeleteId = null;
  let focusAfterRender = null; // { id, action } or 'heading'

  const labelFor = (value) => (CATEGORIES.find((c) => c.value === value) || { label: value }).label;

  // ---------- Build the category dropdown and filter chips from the one category list ----------

  CATEGORIES.forEach((c) => {
    const option = document.createElement('option');
    option.value = c.value;
    option.textContent = c.label;
    fields.category.appendChild(option);
  });

  [{ value: 'all', label: 'All' }, ...CATEGORIES].forEach((c) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.filter = c.value;
    chip.innerHTML = '<span class="chip-label"></span> <span class="chip-count"></span>';
    chip.querySelector('.chip-label').textContent = c.label;
    filterBar.appendChild(chip);
  });

  filterBar.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    pendingDeleteId = null;
    render();
  });

  if (typeof initCharCounter === 'function') {
    initCharCounter(fields.description, document.getElementById('project-description-count'));
  }

  // ---------- Form ----------

  function showFieldError(field, message) {
    const errorEl = document.getElementById(field.id + '-error');
    errorEl.textContent = message || '';
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }

  function clearErrors() {
    Object.values(fields).forEach((f) => showFieldError(f, ''));
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = 'form-status' + (type ? ' ' + type : '');
  }

  // Clear a field's error as soon as the user fixes it.
  Object.values(fields).forEach((field) => {
    const event = field.tagName === 'SELECT' ? 'change' : 'input';
    field.addEventListener(event, () => {
      if (field.getAttribute('aria-invalid') === 'true') showFieldError(field, '');
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearErrors();

    const result = store.add({
      name: fields.name.value,
      description: fields.description.value,
      category: fields.category.value
    });

    if (!result.ok) {
      const order = ['name', 'description', 'category'];
      order.forEach((key) => { if (result.errors[key]) showFieldError(fields[key], result.errors[key]); });
      const firstBad = order.find((key) => result.errors[key]);
      fields[firstBad].focus();
      setStatus('', '');
      return;
    }

    form.reset(); // the reset event also brings the description counter back to 0
    if (activeFilter !== 'all' && activeFilter !== result.project.category) activeFilter = 'all';
    render();

    const label = labelFor(result.project.category);
    if (store.saveFailed()) {
      setStatus('Added "' + result.project.name + '" to ' + label + ', but it could not be saved and will be lost on refresh.', 'error');
    } else {
      setStatus('Added "' + result.project.name + '" to ' + label + '.', 'success');
    }
    fields.name.focus();
  });

  // ---------- List ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function actionButton(text, action, id, className, ariaLabel) {
    const b = el('button', className, text);
    b.type = 'button';
    b.dataset.action = action;
    b.dataset.id = id;
    if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
    return b;
  }

  function renderCard(project) {
    const card = el('article', 'project-card');

    const top = el('div', 'project-card-top');
    top.appendChild(el('h4', 'project-name', project.name));
    top.appendChild(el('span', 'badge', labelFor(project.category)));
    card.appendChild(top);

    if (project.description) {
      const desc = el('p', 'project-description', project.description);
      desc.title = project.description; // full text on hover when it's cut off
      card.appendChild(desc);
    }

    const footer = el('div', 'project-card-footer');
    const time = el('time', 'project-date', new Date(project.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
    time.dateTime = project.createdAt;
    footer.appendChild(el('span', 'project-date-label', 'Added '));
    footer.lastChild.appendChild(time);

    if (pendingDeleteId === project.id) {
      const confirmBox = el('div', 'confirm-delete');
      confirmBox.setAttribute('role', 'group');
      confirmBox.setAttribute('aria-label', 'Confirm delete');
      confirmBox.appendChild(el('p', null, 'Delete "' + project.name + '"? This can\'t be undone.'));
      const buttons = el('div', 'confirm-buttons');
      buttons.appendChild(actionButton('Yes, delete', 'confirm', project.id, 'button-danger'));
      buttons.appendChild(actionButton('Cancel', 'cancel', project.id, 'button-secondary'));
      confirmBox.appendChild(buttons);
      footer.appendChild(confirmBox);
    } else {
      footer.appendChild(actionButton('Delete', 'delete', project.id, 'button-secondary', 'Delete ' + project.name));
    }
    card.appendChild(footer);
    return card;
  }

  function render() {
    const all = store.list();
    const counts = countByCategory(all);

    filterBar.querySelectorAll('.chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.filter === activeFilter));
      chip.querySelector('.chip-count').textContent = '(' + counts[chip.dataset.filter] + ')';
    });

    const shownCategories = activeFilter === 'all'
      ? CATEGORIES
      : CATEGORIES.filter((c) => c.value === activeFilter);

    groupsEl.replaceChildren();
    shownCategories.forEach((c) => {
      const group = el('section', 'project-group');
      const headingId = 'group-' + c.value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      group.setAttribute('aria-labelledby', headingId);

      const heading = el('h3', null, c.label + ' ');
      heading.id = headingId;
      heading.appendChild(el('span', 'group-count', '(' + counts[c.value] + ')'));
      group.appendChild(heading);

      const items = filterProjects(all, c.value);
      if (!items.length) {
        group.appendChild(el('p', 'empty-state', 'No ' + c.label + ' projects yet. Add one with the form above.'));
      } else {
        const ul = el('ul', 'project-list');
        items.forEach((p) => {
          const li = el('li');
          li.appendChild(renderCard(p));
          ul.appendChild(li);
        });
        group.appendChild(ul);
      }
      groupsEl.appendChild(group);
    });

    // Put keyboard focus somewhere sensible after the list is rebuilt.
    if (focusAfterRender === 'heading') {
      listHeading.focus();
    } else if (focusAfterRender) {
      const target = groupsEl.querySelector('[data-action="' + focusAfterRender.action + '"][data-id="' + focusAfterRender.id + '"]');
      if (target) target.focus();
    }
    focusAfterRender = null;
  }

  groupsEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = button.dataset.id;

    if (button.dataset.action === 'delete') {
      pendingDeleteId = id;
      focusAfterRender = { id, action: 'cancel' }; // safest default
    } else if (button.dataset.action === 'cancel') {
      pendingDeleteId = null;
      focusAfterRender = { id, action: 'delete' };
    } else if (button.dataset.action === 'confirm') {
      const project = store.list().find((p) => p.id === id);
      store.remove(id);
      pendingDeleteId = null;
      focusAfterRender = 'heading';
      if (project) setStatus('Deleted "' + project.name + '".', 'success');
    }
    render();
  });

  // Escape cancels an open "Are you sure?"
  groupsEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pendingDeleteId) {
      focusAfterRender = { id: pendingDeleteId, action: 'delete' };
      pendingDeleteId = null;
      render();
    }
  });

  render();
})();
