// game.js
// Unified script to drive both the practice stage and the timed trials.

// This script handles two distinct pages:
//  1. practice.html — unlimited practice with assigned feedback; provides a
//     button to proceed to the timed trials.
//  2. game.html — conducts three timed trials of 60 seconds each using
//     predetermined target sequences (via a linear congruential generator).

document.addEventListener('DOMContentLoaded', function() {
  // Verify that participant info and assigned mode exist
  const firstName = sessionStorage.getItem('first_name');
  const lastName = sessionStorage.getItem('last_name');
  const assignedMode = sessionStorage.getItem('assigned_mode');
  if (!firstName || !lastName || !assignedMode) {
    // If missing information, return to start
    window.location.href = 'index.html';
    return;
  }

  // Determine if this is the practice page or the trial page by checking for
  // special elements in the DOM
  const practiceOverlay = document.getElementById('practice-overlay');
  if (practiceOverlay) {
    setupPracticePage();
  } else {
    setupTrialPage();
  }

  // ---------------------- Practice Page Logic -----------------------
  function setupPracticePage() {
    const beginBtn = document.getElementById('begin-practice-btn');
    const resultOverlay = document.getElementById('result-overlay');
    const startTrialsBtn = document.getElementById('start-trials-btn');
    const gameContainer = document.getElementById('game-container');
    const circle = document.getElementById('circle');
    const flashOverlay = document.getElementById('flash-overlay');
    const audioHit = document.getElementById('audio-hit');
    const audioMiss = document.getElementById('audio-miss');

    // Game state
    let targetPos = { x: 0, y: 0 };
    const RADIUS = 20; // radius in px (40px diameter)
    const MARGIN = 100; // margin from edges (approx 1 inch)

    // RNG: simple built‑in Math.random for practice
    function randomPos() {
      const containerW = gameContainer.clientWidth;
      const containerH = gameContainer.clientHeight;
      const rx = Math.random();
      const ry = Math.random();
      const px = rx * (containerW - 2 * (RADIUS + MARGIN)) + (RADIUS + MARGIN);
      const py = ry * (containerH - 2 * (RADIUS + MARGIN)) + (RADIUS + MARGIN);
      return { x: px, y: py };
    }

    // Spawn a new target
    function spawnTarget() {
      const pos = randomPos();
      targetPos = pos;
      circle.style.left = (pos.x - RADIUS) + 'px';
      circle.style.top = (pos.y - RADIUS) + 'px';
      circle.style.display = 'block';
    }

    // Click handler for practice
    function handleClick(event) {
      // If click is outside the practice area, ignore
      if (event.target.closest('#practice-overlay')) return;
      if (!circle.style.display || circle.style.display === 'none') return;
      const clickX = event.clientX;
      const clickY = event.clientY;
      const dx = clickX - targetPos.x;
      const dy = clickY - targetPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= RADIUS) {
        // hit
        if (assignedMode === 'auditory') {
          audioHit.currentTime = 0;
          try { audioHit.play(); } catch (e) {}
        } else if (assignedMode === 'visual') {
          flash('success');
        }
        spawnTarget();
      } else {
        if (assignedMode === 'auditory') {
          audioMiss.currentTime = 0;
          try { audioMiss.play(); } catch (e) {}
        } else if (assignedMode === 'visual') {
          flash('error');
        }
        // miss: keep same target
      }
    }

    function flash(type) {
      flashOverlay.classList.remove('success', 'error');
      flashOverlay.style.display = 'block';
      if (type === 'success') flashOverlay.classList.add('success');
      else flashOverlay.classList.add('error');
      setTimeout(() => {
        flashOverlay.style.display = 'none';
        flashOverlay.classList.remove('success', 'error');
      }, 100);
    }

    // Begin practice when user clicks button
    beginBtn.addEventListener('click', function() {
      practiceOverlay.style.display = 'none';
      resultOverlay.classList.remove('hidden');
      resultOverlay.style.display = 'flex';
      // spawn first target
      spawnTarget();
    });

    // Start trials button navigates to first timed trial
    startTrialsBtn.addEventListener('click', function() {
      window.location.href = 'game.html?trial=1';
    });

    // Listen for clicks on the practice game container
    gameContainer.addEventListener('click', handleClick);
  }

  // ---------------------- Trial Page Logic -------------------------
  function setupTrialPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const trialNumber = parseInt(urlParams.get('trial')) || 1;
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
    if (trialDisplay) trialDisplay.textContent = trialNumber;

    const RADIUS = 20;
    const MARGIN = 100;
    const TRIAL_MS = 60000; // 60 seconds

    // Seeds for each trial to generate deterministic sequences
    const seedMap = { 1: 12345, 2: 67890, 3: 24680 };
    const seedVal = seedMap[trialNumber] || 1;

    // Linear congruential generator
    function makeLCG(seed) {
      const m = 0x100000000;
      const a = 1664525;
      const c = 1013904223;
      let state = seed >>> 0;
      return function() {
        state = (a * state + c) % m;
        return state / m;
      };
    }
    const randomFn = makeLCG(seedVal);

    // State
    let trialStarted = false;
    let trialEnded = false;
    let countdownTimer = null;
    let endTimer = null;
    let targetPos = { x: 0, y: 0 };
    let hits = 0;
    let misses = 0;
    let totalShots = 0;
    let events = [];
    let startTime = 0;

    // Show start overlay click to begin
    gameContainer.addEventListener('click', function handleStartClick() {
      if (trialStarted) return;
      trialStarted = true;
      startOverlay.style.display = 'none';
      // Start 3 second countdown
      let count = 3;
      countdownEl.textContent = count;
      countdownEl.classList.remove('hidden');
      countdownTimer = setInterval(() => {
        count--;
        if (count > 0) {
          countdownEl.textContent = count;
        } else {
          clearInterval(countdownTimer);
          countdownEl.classList.add('hidden');
          beginTrial();
        }
      }, 1000);
      // Remove this listener so additional clicks don't restart
      gameContainer.removeEventListener('click', handleStartClick);
    });

    function beginTrial() {
      hits = 0;
      misses = 0;
      totalShots = 0;
      events = [];
      startTime = performance.now();
      spawnTarget();
      endTimer = setTimeout(endTrial, TRIAL_MS);
    }

    function spawnTarget() {
      const containerW = gameContainer.clientWidth;
      const containerH = gameContainer.clientHeight;
      const rx = randomFn();
      const ry = randomFn();
      const px = rx * (containerW - 2 * (RADIUS + MARGIN)) + (RADIUS + MARGIN);
      const py = ry * (containerH - 2 * (RADIUS + MARGIN)) + (RADIUS + MARGIN);
      targetPos = { x: px, y: py };
      circle.style.left = (px - RADIUS) + 'px';
      circle.style.top = (py - RADIUS) + 'px';
      circle.style.display = 'block';
    }

    function handleClick(event) {
      if (!trialStarted || trialEnded) return;
      // ignore clicks on overlay elements
      if (event.target.closest('#result-overlay') || event.target.closest('#start-overlay')) return;
      const clickX = event.clientX;
      const clickY = event.clientY;
      const dx = clickX - targetPos.x;
      const dy = clickY - targetPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      // compute time relative to trial start
      const clickTime = ((performance.now() - startTime) / 1000).toFixed(3);
      let status;
      if (distance <= RADIUS) {
        status = 'hit';
        hits++;
        if (assignedMode === 'auditory') {
          audioHit.currentTime = 0;
          try { audioHit.play(); } catch (e) {}
        } else if (assignedMode === 'visual') {
          flash('success');
        }
        spawnTarget();
      } else {
        status = 'miss';
        misses++;
        if (assignedMode === 'auditory') {
          audioMiss.currentTime = 0;
          try { audioMiss.play(); } catch (e) {}
        } else if (assignedMode === 'visual') {
          flash('error');
        }
        // keep same target on miss
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

    function flash(type) {
      flashOverlay.classList.remove('success', 'error');
      flashOverlay.style.display = 'block';
      if (type === 'success') flashOverlay.classList.add('success');
      else flashOverlay.classList.add('error');
      setTimeout(() => {
        flashOverlay.style.display = 'none';
        flashOverlay.classList.remove('success', 'error');
      }, 100);
    }

    function endTrial() {
      if (trialEnded) return;
      trialEnded = true;
      clearTimeout(endTimer);
      circle.style.display = 'none';
      const accuracy = totalShots > 0 ? (hits / totalShots * 100).toFixed(1) : '0.0';
      if (resultOverlay) {
        resultText.innerHTML = `Hits: ${hits}<br>Misses: ${misses}<br>Accuracy: ${accuracy}%`;
        resultOverlay.classList.remove('hidden');
        resultOverlay.style.display = 'flex';
      }
      sendResults().then(() => {
        // Wait a few seconds, then proceed to next trial or survey
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

    // Event listeners
    gameContainer.addEventListener('click', handleClick);
  }
});