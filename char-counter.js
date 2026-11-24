// Character counter: shows "count / max" under a text field and turns red at the limit.
// Self-contained on purpose. It knows nothing about how the form is submitted.
// Usage: initCharCounter(textarea, counterElement)
function initCharCounter(field, counter) {
  if (!field || !counter) return;

  const max = Number(field.getAttribute('maxlength')) || 500;

  function update() {
    const count = field.value.length;
    counter.textContent = count + ' / ' + max;
    counter.classList.toggle('at-limit', count >= max);
  }

  field.addEventListener('input', update);

  // The reset event fires *before* the browser clears the fields,
  // so wait one tick and then recount (which brings it back to 0).
  if (field.form) {
    field.form.addEventListener('reset', () => setTimeout(update, 0));
  }

  update();
}

initCharCounter(
  document.getElementById('message'),
  document.getElementById('message-count')
);
