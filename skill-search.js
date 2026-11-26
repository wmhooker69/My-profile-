// Search matching for the Skills list. Pure: no DOM, no storage, so it can be unit tested.
// Works in the browser (window.SkillSearch) and in Node (require) for skill-search.test.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SkillSearch = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // True when every word in the query appears in the item's name or description, ignoring case.
  // item: { name, description } and either may be missing or null.
  // An empty, blank, missing or null query matches everything.
  function matchesQuery(item, query) {
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;

    const name = String(item?.name ?? '').toLowerCase();
    const description = String(item?.description ?? '').toLowerCase();

    return words.every((word) => name.includes(word) || description.includes(word));
  }

  return { matchesQuery };
});
