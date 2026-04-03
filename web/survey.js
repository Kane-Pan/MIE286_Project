// survey.js
// Handles the pre-experiment questionnaire.

document.addEventListener('DOMContentLoaded', function () {
  const firstName = sessionStorage.getItem('first_name');
  const lastName = sessionStorage.getItem('last_name');
  const language = sessionStorage.getItem('language') || 'en';

  const TEXT = {
    en: {
      missingParticipantInfo: 'Missing participant information. Returning to the start page.',
      submitFailed: 'Failed to submit your responses. Please try again.'
    },
    zh: {
      missingParticipantInfo: '缺少参与者信息。正在返回开始页面。',
      submitFailed: '提交回答失败，请重试。'
    }
  };

  function t(key) {
    const langPack = TEXT[language] || TEXT.en;
    return langPack[key] || TEXT.en[key] || '';
  }

  if (!firstName || !lastName) {
    alert(t('missingParticipantInfo'));
    window.location.href = 'index.html';
    return;
  }

  const form = document.getElementById('survey-form');

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();

    const formData = new FormData(form);
    const responses = {};

    formData.forEach((value, key) => {
      responses[key] = value;
    });

    // Save selected interface language with responses
    responses.interface_language = language;

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
      alert(t('submitFailed'));
      return;
    }

    const modes = ['auditory', 'visual'];
    const assigned = modes[Math.floor(Math.random() * modes.length)];
    sessionStorage.setItem('assigned_mode', assigned);

    window.location.href = 'practice.html';
  });
});