// Contact form submit handler: validates in the browser, sends the data with fetch,
// shows a success or error message, and resets the form on success.
// The server (server.js) checks everything again, because browser checks can be bypassed.
(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const status = document.getElementById('form-status');
  const submitButton = form.querySelector('button[type="submit"]');

  function showStatus(message, type) {
    status.textContent = message;
    status.className = 'form-status ' + type;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); // stay on the page

    // Required fields, email format, and the name pattern all come from the HTML attributes.
    if (!form.checkValidity()) {
      form.reportValidity(); // shows the browser's message on the first bad field
      showStatus('Please fill in the required fields.', 'error');
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    data.subscribe = form.elements.subscribe.checked;

    submitButton.disabled = true;
    showStatus('Sending…', 'pending');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(() => {
        throw new Error('Could not reach the server. Please try again later.');
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || 'Something went wrong. Please try again.');
      }

      form.reset(); // also fires the reset event, so the character counter goes back to 0
      showStatus('Thanks! Your message was sent.', 'success');
    } catch (error) {
      showStatus(error.message, 'error'); // form is not reset, so they can try again
    } finally {
      submitButton.disabled = false;
    }
  });

  // Clear the status line when the user resets the form themselves.
  form.addEventListener('reset', (event) => {
    if (event.isTrusted) showStatus('', '');
  });
})();
