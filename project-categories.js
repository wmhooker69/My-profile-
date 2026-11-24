// The one place project categories are defined. Change, add, or reorder them here;
// the form, filter chips, headings, counts, and validation all read from this list.
// `value` is what gets saved, `label` is what people see.
(function (root) {
  const PROJECT_CATEGORIES = Object.freeze([
    Object.freeze({ value: 'Motorcycle', label: 'Motorcycle' }),
    Object.freeze({ value: 'Trike', label: 'Trike' }),
    Object.freeze({ value: 'Slingshot', label: 'Slingshots' }),
    Object.freeze({ value: 'Can-Am', label: 'Can-Ams' })
  ]);

  if (typeof module === 'object' && module.exports) module.exports = PROJECT_CATEGORIES;
  else root.PROJECT_CATEGORIES = PROJECT_CATEGORIES;
})(this);
