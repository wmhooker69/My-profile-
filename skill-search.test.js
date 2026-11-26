// Tests for the Skills search matching. Run: npm test
const { test } = require('node:test');
const assert = require('node:assert');

const { matchesQuery } = require('./skill-search.js');

const ride = { name: 'Motorcycle riding', description: 'Long trips on open roads' };

test('an empty, blank, null or missing query matches everything', () => {
  assert.strictEqual(matchesQuery(ride, ''), true);
  assert.strictEqual(matchesQuery(ride, '   '), true);
  assert.strictEqual(matchesQuery(ride, null), true);
  assert.strictEqual(matchesQuery(ride, undefined), true);
  assert.strictEqual(matchesQuery(ride), true);
});

test('matches a word in the name, including part of a word', () => {
  assert.strictEqual(matchesQuery(ride, 'motorcycle'), true);
  assert.strictEqual(matchesQuery(ride, 'cycl'), true);
});

test('matches a word in the description', () => {
  assert.strictEqual(matchesQuery(ride, 'roads'), true);
});

test('ignores case in both the query and the item', () => {
  assert.strictEqual(matchesQuery(ride, 'MOTORCYCLE'), true);
  assert.strictEqual(matchesQuery({ name: 'PYTHON basics' }, 'python'), true);
});

test('every word must appear, but they can come from name and description', () => {
  assert.strictEqual(matchesQuery(ride, 'riding trips'), true);
  assert.strictEqual(matchesQuery(ride, 'trips riding'), true, 'word order does not matter');
  assert.strictEqual(matchesQuery(ride, 'riding python'), false);
});

test('extra spaces between and around words are ignored', () => {
  assert.strictEqual(matchesQuery(ride, '  riding    open  '), true);
});

test('returns false when a word appears nowhere', () => {
  assert.strictEqual(matchesQuery(ride, 'logistics'), false);
});

test('words are matched on their own, not as one phrase', () => {
  // "riding long" is not a phrase in either field, but both words appear
  assert.strictEqual(matchesQuery(ride, 'riding long'), true);
  // a query word can't match across the name/description boundary
  assert.strictEqual(matchesQuery({ name: 'ab', description: 'cd' }, 'bc'), false);
});

test('a missing or null description does not break anything', () => {
  assert.strictEqual(matchesQuery({ name: 'Logistics' }, 'logistics'), true);
  assert.strictEqual(matchesQuery({ name: 'Logistics', description: null }, 'logistics'), true);
  assert.strictEqual(matchesQuery({ name: 'Logistics', description: null }, 'roads'), false);
});

test('a missing or null name, or a missing item, does not break anything', () => {
  assert.strictEqual(matchesQuery({ description: 'Long trips' }, 'trips'), true);
  assert.strictEqual(matchesQuery({ name: null, description: null }, 'x'), false);
  assert.strictEqual(matchesQuery(null, 'x'), false);
  assert.strictEqual(matchesQuery(undefined, ''), true);
});

test('regex characters in the query are treated as plain text', () => {
  assert.strictEqual(matchesQuery({ name: 'C++ (basics)' }, 'c++ (basics)'), true);
  assert.strictEqual(matchesQuery({ name: 'Logistics' }, '.*'), false);
});

test('does not change the item it is given', () => {
  const item = { name: 'Logistics', description: null };
  matchesQuery(item, 'LOG');
  assert.deepStrictEqual(item, { name: 'Logistics', description: null });
});
