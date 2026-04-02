// survey.js
// Handles the pre‑experiment questionnaire.

document.addEventListener('DOMContentLoaded', function() {
  // Ensure participant info is present; otherwise redirect to start
  const firstName = sessionStorage.getItem('first_name');
  const lastName = sessionStorage.getItem('last_name');
  if (!firstName || !lastName) {
    window.location.href = 'index.html';
    return;
  }
  const form = document.getElementById('survey-form');
  form.addEventListener('submit', async function(ev) {
    ev.preventDefault();
    // Collect responses into an object
    const formData = new FormData(form);
    const responses = {};
    formData.forEach((value, key) => {
      // convert Radio values to string; optional number conversion
      responses[key] = value;
    });
    // Send to server
    const payload = {
      first_name: firstName,
      last_name: lastName,
      mode: 'pre_survey',
      attempt: 'pre',
      responses: responses
    };
    try {
      await fetch('/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error('Failed to submit survey', err);
    }
    // Randomly assign participant to auditory or visual feedback; hide assignment from user
    const modes = ['auditory', 'visual'];
    const assigned = modes[Math.floor(Math.random() * modes.length)];
    sessionStorage.setItem('assigned_mode', assigned);
    // Navigate to practice stage
    window.location.href = 'practice.html';
  });
});