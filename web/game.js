document.addEventListener('DOMContentLoaded', function () {
  const firstName = sessionStorage.getItem('first_name');
  const lastName = sessionStorage.getItem('last_name');
  const assignedMode = sessionStorage.getItem('assigned_mode');

  if (!firstName || !lastName || !assignedMode) {
    window.location.href = 'index.html';
    return;
  }

  const practiceOverlay = document.getElementById('practice-overlay');
  if (practiceOverlay) {
    setupPracticePage();
  } else {
    setupTrialPage();
  }

  function setupPracticePage() {
    const beginBtn = document.getElementById('begin-practice-btn');
    const startTrialsBtn = document.getElementById('start-trials-btn');
    const gameContainer = document.getElementById('game-container');
    const circle = document.getElementById('circle');
    const flashOverlay = document.getElementById('flash-overlay');
    const audioHit = document.getElementById('audio-hit');
    const audioMiss = document.getElementById('audio-miss');
    const practiceOverlayEl = document.getElementById('practice-overlay');

    let practiceStarted = false;
    let targetPos = { x: 0, y: 0 };

    const SCALE = 1.25;
    const BASE_RADIUS = 20;
    const BASE_MARGIN = 100;
    const RADIUS = Math.round(BASE_RADIUS * SCALE);   // 25
    const MARGIN = Math.round(BASE_MARGIN * SCALE);   // 125
    const MIN_PLAY_PADDING = Math.round(20 * SCALE);  // 25

    circle.style.width = `${RADIUS * 2}px`;
    circle.style.height = `${RADIUS * 2}px`;

    function getUsableBounds() {
      const rect = gameContainer.getBoundingClientRect();
      const containerW = rect.width;
      const containerH = rect.height;

      const usableW = Math.max(2 * RADIUS + MIN_PLAY_PADDING, containerW - 2 * (RADIUS + MARGIN));
      const usableH = Math.max(2 * RADIUS + MIN_PLAY_PADDING, containerH - 2 * (RADIUS + MARGIN));

      const leftPad = (containerW - usableW) / 2;
      const topPad = (containerH - usableH) / 2;

      return {
        usableW,
        usableH,
        leftPad,
        topPad
      };
    }

    function randomPos() {
      const bounds = getUsableBounds();
      const px = Math.random() * bounds.usableW + bounds.leftPad;
      const py = Math.random() * bounds.usableH + bounds.topPad;
      return { x: px, y: py };
    }

    function spawnTarget() {
      const pos = randomPos();
      targetPos = pos;
      circle.style.left = `${pos.x - RADIUS}px`;
      circle.style.top = `${pos.y - RADIUS}px`;
      circle.style.display = 'block';
    }

    function flash(type) {
      flashOverlay.classList.remove('success', 'error');
      flashOverlay.style.display = 'block';

      if (type === 'success') {
        flashOverlay.classList.add('success');
      } else {
        flashOverlay.classList.add('error');
      }

      setTimeout(() => {
        flashOverlay.style.display = 'none';
        flashOverlay.classList.remove('success', 'error');
      }, 100);
    }

    function handleClick(event) {
      if (!practiceStarted) return;
      if (event.target.closest('#practice-overlay')) return;
      if (circle.style.display === 'none') return;

      const rect = gameContainer.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      const dx = clickX - targetPos.x;
      const dy = clickY - targetPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= RADIUS) {
        if (assignedMode === 'auditory') {
          audioHit.currentTime = 0;
          try { audioHit.play(); } catch (e) {}
        } else {
          flash('success');
        }
        spawnTarget();
      } else {
        if (assignedMode === 'auditory') {
          audioMiss.currentTime = 0;
          try { audioMiss.play(); } catch (e) {}
        } else {
          flash('error');
        }
      }
    }

    beginBtn.addEventListener('click', function () {
      practiceStarted = true;
      if (practiceOverlayEl) {
        practiceOverlayEl.classList.add('hidden');
      }
      spawnTarget();
    });

    startTrialsBtn.addEventListener('click', function () {
      window.location.href = 'game.html?trial=1';
    });

    gameContainer.addEventListener('click', handleClick);
  }

  function setupTrialPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const trialNumber = parseInt(urlParams.get('trial'), 10) || 1;

    const gameContainer = document.getElementById('game-container');
    const circle = document.getElementById('circle');
    const flashOverlay = document.getElementById('flash-overlay');
    const startOverlay = document.getElementById('start-overlay');
    const countdownEl = document.getElementById('countdown');
    const resultOverlay = document.getElementById('result-overlay');
    const resultText = document.getElementById('result-text');
    const audioHit = document.getElementById('audio-hit');
    const audioMiss = document.getElementById('audio-miss');
    const trialDisplay = document.getElementById('trial-number-display');

    if (trialDisplay) {
      trialDisplay.textContent = trialNumber;
    }

    const SCALE = 1.25;
    const BASE_RADIUS = 20;
    const BASE_MARGIN = 100;
    const RADIUS = Math.round(BASE_RADIUS * SCALE);   // 25
    const MARGIN = Math.round(BASE_MARGIN * SCALE);   // 125
    const MIN_PLAY_PADDING = Math.round(20 * SCALE);  // 25
    const TRIAL_MS = 30000;

    circle.style.width = `${RADIUS * 2}px`;
    circle.style.height = `${RADIUS * 2}px`;

    const seedMap = { 1: 12345, 2: 67890, 3: 24680 };
    const seedVal = seedMap[trialNumber] || 1;

    function makeLCG(seed) {
      const m = 0x100000000;
      const a = 1664525;
      const c = 1013904223;
      let state = seed >>> 0;
      return function () {
        state = (a * state + c) % m;
        return state / m;
      };
    }

    const randomFn = makeLCG(seedVal);

    let phase = 'start'; // start, countdown, running, ended
    let countdownTimer = null;
    let endTimer = null;
    let targetPos = { x: 0, y: 0 };
    let hits = 0;
    let misses = 0;
    let totalShots = 0;
    let events = [];
    let startTime = 0;

    if (resultOverlay) {
      resultOverlay.classList.add('hidden');
    }
    if (countdownEl) {
      countdownEl.classList.add('hidden');
      countdownEl.textContent = '';
    }
    circle.style.display = 'none';

    function getUsableBounds() {
      const rect = gameContainer.getBoundingClientRect();
      const containerW = rect.width;
      const containerH = rect.height;

      const usableW = Math.max(2 * RADIUS + MIN_PLAY_PADDING, containerW - 2 * (RADIUS + MARGIN));
      const usableH = Math.max(2 * RADIUS + MIN_PLAY_PADDING, containerH - 2 * (RADIUS + MARGIN));

      const leftPad = (containerW - usableW) / 2;
      const topPad = (containerH - usableH) / 2;

      return {
        usableW,
        usableH,
        leftPad,
        topPad
      };
    }

    function randomPos() {
      const bounds = getUsableBounds();
      const px = randomFn() * bounds.usableW + bounds.leftPad;
      const py = randomFn() * bounds.usableH + bounds.topPad;
      return { x: px, y: py };
    }

    function spawnTarget() {
      const pos = randomPos();
      targetPos = pos;
      circle.style.left = `${pos.x - RADIUS}px`;
      circle.style.top = `${pos.y - RADIUS}px`;
      circle.style.display = 'block';
    }

    function flash(type) {
      flashOverlay.classList.remove('success', 'error');
      flashOverlay.style.display = 'block';

      if (type === 'success') {
        flashOverlay.classList.add('success');
      } else {
        flashOverlay.classList.add('error');
      }

      setTimeout(() => {
        flashOverlay.style.display = 'none';
        flashOverlay.classList.remove('success', 'error');
      }, 100);
    }

    function beginTrial() {
      phase = 'running';
      hits = 0;
      misses = 0;
      totalShots = 0;
      events = [];
      startTime = performance.now();
      spawnTarget();
      endTimer = setTimeout(endTrial, TRIAL_MS);
    }

    function handleTrialStart(event) {
      if (phase !== 'start') return;
      if (event.target.closest('#result-overlay')) return;

      phase = 'countdown';
      if (startOverlay) {
        startOverlay.classList.add('hidden');
      }

      let count = 5;
      countdownEl.textContent = count;
      countdownEl.classList.remove('hidden');

      countdownTimer = setInterval(() => {
        count -= 1;
        if (count > 0) {
          countdownEl.textContent = count;
        } else {
          clearInterval(countdownTimer);
          countdownTimer = null;
          countdownEl.classList.add('hidden');
          countdownEl.textContent = '';
          beginTrial();
        }
      }, 1000);
    }

    function handleClick(event) {
      if (phase !== 'running') return;
      if (event.target.closest('#result-overlay')) return;
      if (event.target.closest('#start-overlay')) return;
      if (circle.style.display === 'none') return;

      const rect = gameContainer.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;

      const dx = clickX - targetPos.x;
      const dy = clickY - targetPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const clickTime = ((performance.now() - startTime) / 1000).toFixed(3);

      let status;
      if (distance <= RADIUS) {
        status = 'hit';
        hits++;

        if (assignedMode === 'auditory') {
          audioHit.currentTime = 0;
          try { audioHit.play(); } catch (e) {}
        } else {
          flash('success');
        }

        spawnTarget();
      } else {
        status = 'miss';
        misses++;

        if (assignedMode === 'auditory') {
          audioMiss.currentTime = 0;
          try { audioMiss.play(); } catch (e) {}
        } else {
          flash('error');
        }
      }

      totalShots++;
      events.push({
        time: clickTime,
        status: status,
        target_x: targetPos.x.toFixed(1),
        target_y: targetPos.y.toFixed(1),
        click_x: clickX.toFixed(1),
        click_y: clickY.toFixed(1)
      });
    }

    function endTrial() {
      if (phase === 'ended') return;

      phase = 'ended';
      clearTimeout(endTimer);
      clearInterval(countdownTimer);
      circle.style.display = 'none';

      const accuracy = totalShots > 0 ? (hits / totalShots * 100).toFixed(1) : '0.0';

      if (resultOverlay) {
        resultText.innerHTML = `Hits: ${hits}<br>Misses: ${misses}<br>Accuracy: ${accuracy}%`;
        resultOverlay.classList.remove('hidden');
      }

      sendResults().then(() => {
        setTimeout(() => {
          if (trialNumber < 3) {
            window.location.href = `game.html?trial=${trialNumber + 1}`;
          } else {
            window.location.href = 'post_survey.html';
          }
        }, 3000);
      });
    }

    async function sendResults() {
      const payload = {
        first_name: firstName,
        last_name: lastName,
        mode: assignedMode,
        attempt: String(trialNumber),
        events: events
      };

      try {
        await fetch('/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error('Failed to submit trial results', err);
      }
    }

    gameContainer.addEventListener('click', handleTrialStart, { once: true });
    gameContainer.addEventListener('click', handleClick);
  }
});