// Projects data: validation, add, remove, filter, and counts, saved to localStorage.
// No page code in here, so it can be tested in Node (see projects.test.js).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./project-categories.js'));
  } else {
    root.ProjectsStore = factory(root.PROJECT_CATEGORIES);
  }
})(this, function (CATEGORIES) {
  const STORAGE_KEY = 'projects';
  const NAME_MAX = 100;
  const DESCRIPTION_MAX = 500;
  const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

  function clean(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  // Returns { errors: { field: message }, data } with trimmed values.
  function validateProject(input) {
    const data = {
      name: clean(input && input.name),
      description: clean(input && input.description),
      category: clean(input && input.category)
    };
    const errors = {};

    if (!data.name) errors.name = 'Please enter a project name.';
    else if (data.name.length > NAME_MAX) errors.name = 'Name must be ' + NAME_MAX + ' characters or fewer.';

    if (data.description.length > DESCRIPTION_MAX) {
      errors.description = 'Description must be ' + DESCRIPTION_MAX + ' characters or fewer.';
    }

    if (!data.category) errors.category = 'Please choose a category.';
    else if (!CATEGORY_VALUES.includes(data.category)) errors.category = 'Please choose a category from the list.';

    return { errors, data };
  }

  function newId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function isStoredProject(p) {
    return p && typeof p.id === 'string' && typeof p.name === 'string' &&
      CATEGORY_VALUES.includes(p.category) && typeof p.createdAt === 'string';
  }

  // storage: anything with getItem/setItem (window.localStorage in the browser).
  function createProjectsStore(storage) {
    let projects = load();
    let saveFailed = false;

    function load() {
      try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(isStoredProject) : [];
      } catch (e) {
        return []; // missing, corrupt, or storage blocked: start empty
      }
    }

    function save() {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(projects));
        saveFailed = false;
      } catch (e) {
        saveFailed = true; // still works for this visit, just won't survive a refresh
      }
    }

    return {
      // Newest first.
      list() {
        return projects.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },

      add(input) {
        const { errors, data } = validateProject(input);
        if (Object.keys(errors).length) return { ok: false, errors };
        const project = { id: newId(), ...data, createdAt: new Date().toISOString() };
        projects.push(project);
        save();
        return { ok: true, project };
      },

      remove(id) {
        const before = projects.length;
        projects = projects.filter((p) => p.id !== id);
        if (projects.length === before) return false;
        save();
        return true;
      },

      saveFailed() {
        return saveFailed;
      }
    };
  }

  // category: a category value, or 'all'.
  function filterProjects(list, category) {
    return category === 'all' ? list.slice() : list.filter((p) => p.category === category);
  }

  // { all: n, Motorcycle: n, Trike: n, ... }
  function countByCategory(list) {
    const counts = { all: list.length };
    CATEGORY_VALUES.forEach((value) => { counts[value] = 0; });
    list.forEach((p) => { if (p.category in counts) counts[p.category] += 1; });
    return counts;
  }

  return {
    CATEGORIES,
    NAME_MAX,
    DESCRIPTION_MAX,
    STORAGE_KEY,
    validateProject,
    createProjectsStore,
    filterProjects,
    countByCategory
  };
});
