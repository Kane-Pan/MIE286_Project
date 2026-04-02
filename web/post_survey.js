// post_survey.js
// Handles the post‑experiment questionnaire.

document.addEventListener('DOMContentLoaded', function() {
  const firstName = sessionStorage.getItem('first_name');
  const lastName = sessionStorage.getItem('last_name');
  if (!firstName || !lastName) {
    window.location.href = 'index.html';
    return;
  }
  const form = document.getElementById('post-survey-form');
  form.addEventListener('submit', async function(ev) {
    ev.preventDefault();
    const formData = new FormData(form);
    const responses = {};
    formData.forEach((value, key) => {
      responses[key] = value;
    });
    const payload = {
      first_name: firstName,
      last_name: lastName,
      mode: 'post_survey',
      attempt: 'post',
      responses: responses
    };
    try {
      await fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error('Failed to submit post survey', err);
    }
    // Navigate to thank you page
    window.location.href = 'thank_you.html';
  });
});