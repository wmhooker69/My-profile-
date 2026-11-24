// Tests for the Projects data logic. Run: npm test
const { test } = require('node:test');
const assert = require('node:assert');

const CATEGORIES = require('./project-categories.js');
const {
  validateProject,
  createProjectsStore,
  filterProjects,
  countByCategory,
  STORAGE_KEY
} = require('./projects-store.js');

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); }
  };
}

test('categories are defined once with the right values and labels', () => {
  assert.deepStrictEqual(CATEGORIES.map((c) => c.value), ['Motorcycle', 'Trike', 'Slingshot', 'Can-Am']);
  assert.deepStrictEqual(CATEGORIES.map((c) => c.label), ['Motorcycle', 'Trike', 'Slingshots', 'Can-Ams']);
  assert.ok(Object.isFrozen(CATEGORIES));
});

test('validation: name and category are required', () => {
  const { errors } = validateProject({ name: '', description: '', category: '' });
  assert.ok(errors.name);
  assert.ok(errors.category);
  assert.strictEqual(errors.description, undefined, 'description is optional');
});

test('validation: whitespace-only name counts as empty, values are trimmed', () => {
  assert.ok(validateProject({ name: '   ', category: 'Trike' }).errors.name);
  const { errors, data } = validateProject({ name: '  Bobber build  ', description: '  new seat \n', category: ' Trike ' });
  assert.deepStrictEqual(errors, {});
  assert.deepStrictEqual(data, { name: 'Bobber build', description: 'new seat', category: 'Trike' });
});

test('validation: length limits and unknown categories', () => {
  assert.deepStrictEqual(validateProject({ name: 'x'.repeat(100), description: 'y'.repeat(500), category: 'Can-Am' }).errors, {});
  assert.match(validateProject({ name: 'x'.repeat(101), category: 'Can-Am' }).errors.name, /100/);
  assert.match(validateProject({ name: 'ok', description: 'y'.repeat(501), category: 'Can-Am' }).errors.description, /500/);
  assert.ok(validateProject({ name: 'ok', category: 'Slingshots' }).errors.category, 'label is not a valid value');
  assert.ok(validateProject({ name: 'ok', category: 'Car' }).errors.category);
});

test('add: creates a project with id and timestamp, and saves it', () => {
  const storage = fakeStorage();
  const store = createProjectsStore(storage);
  const result = store.add({ name: ' Chain swap ', description: '', category: 'Motorcycle' });

  assert.strictEqual(result.ok, true);
  const p = result.project;
  assert.strictEqual(typeof p.id, 'string');
  assert.ok(p.id.length > 0);
  assert.strictEqual(p.name, 'Chain swap');
  assert.strictEqual(p.category, 'Motorcycle');
  assert.ok(!Number.isNaN(Date.parse(p.createdAt)));
  assert.deepStrictEqual(JSON.parse(storage.data[STORAGE_KEY]), [p]);
});

test('add: invalid input is rejected and nothing is saved', () => {
  const storage = fakeStorage();
  const store = createProjectsStore(storage);
  const result = store.add({ name: '', category: '' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.name && result.errors.category);
  assert.strictEqual(store.list().length, 0);
  assert.strictEqual(storage.data[STORAGE_KEY], undefined);
});

test('add: ids are unique', () => {
  const store = createProjectsStore(fakeStorage());
  const ids = new Set();
  for (let i = 0; i < 50; i++) ids.add(store.add({ name: 'P' + i, category: 'Trike' }).project.id);
  assert.strictEqual(ids.size, 50);
});

test('remove: deletes only the matching project and saves', () => {
  const storage = fakeStorage();
  const store = createProjectsStore(storage);
  const a = store.add({ name: 'A', category: 'Trike' }).project;
  const b = store.add({ name: 'B', category: 'Slingshot' }).project;

  assert.strictEqual(store.remove(a.id), true);
  assert.deepStrictEqual(store.list().map((p) => p.id), [b.id]);
  assert.deepStrictEqual(JSON.parse(storage.data[STORAGE_KEY]).map((p) => p.id), [b.id]);
  assert.strictEqual(store.remove('no-such-id'), false);
});

test('persistence: a new store reads what an earlier one saved', () => {
  const storage = fakeStorage();
  createProjectsStore(storage).add({ name: 'Survives refresh', category: 'Can-Am' });
  const reloaded = createProjectsStore(storage);
  assert.deepStrictEqual(reloaded.list().map((p) => p.name), ['Survives refresh']);
});

test('persistence: corrupt or bad saved data does not break the page', () => {
  assert.deepStrictEqual(createProjectsStore(fakeStorage({ [STORAGE_KEY]: '{not json' })).list(), []);
  assert.deepStrictEqual(createProjectsStore(fakeStorage({ [STORAGE_KEY]: '{"a":1}' })).list(), []);
  const mixed = JSON.stringify([
    { id: '1', name: 'Good', description: '', category: 'Trike', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: '2', name: 'Bad category', category: 'Car', createdAt: '2026-01-01T00:00:00.000Z' },
    null
  ]);
  assert.deepStrictEqual(createProjectsStore(fakeStorage({ [STORAGE_KEY]: mixed })).list().map((p) => p.id), ['1']);
});

test('persistence: if saving fails, the store still works and reports it', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const store = createProjectsStore(storage);
  assert.strictEqual(store.add({ name: 'A', category: 'Trike' }).ok, true);
  assert.strictEqual(store.saveFailed(), true);
  assert.strictEqual(store.list().length, 1);
});

test('filtering and counts by category', () => {
  const store = createProjectsStore(fakeStorage());
  store.add({ name: 'M1', category: 'Motorcycle' });
  store.add({ name: 'M2', category: 'Motorcycle' });
  store.add({ name: 'S1', category: 'Slingshot' });
  const list = store.list();

  assert.strictEqual(filterProjects(list, 'all').length, 3);
  assert.deepStrictEqual(filterProjects(list, 'Motorcycle').map((p) => p.name).sort(), ['M1', 'M2']);
  assert.deepStrictEqual(filterProjects(list, 'Trike'), []);
  assert.deepStrictEqual(countByCategory(list), { all: 3, Motorcycle: 2, Trike: 0, Slingshot: 1, 'Can-Am': 0 });
});

test('list is newest first', () => {
  const storage = fakeStorage({
    [STORAGE_KEY]: JSON.stringify([
      { id: 'old', name: 'Old', description: '', category: 'Trike', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', name: 'New', description: '', category: 'Trike', createdAt: '2026-06-01T00:00:00.000Z' }
    ])
  });
  assert.deepStrictEqual(createProjectsStore(storage).list().map((p) => p.id), ['new', 'old']);
});
