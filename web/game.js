(function() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || 'practice';
    const attempt = params.get('attempt') || 'practice';

    // DOM
    const gameContainer = document.getElementById('game-container');
    const circle = document.getElementById('circle');
    const startOverlay = document.getElementById('start-overlay');
    const countdownEl = document.getElementById('countdown');
    const flashOverlay = document.getElementById('flash-overlay');
    const resultOverlay = document.getElementById('result-overlay');
    const resultText = document.getElementById('result-text');
    const retryBtn = document.getElementById('retry-btn');
    const audioHit = document.getElementById('audio-hit');
    const audioMiss = document.getElementById('audio-miss');

    // Pause UI
    const pauseOverlay = document.getElementById('pause-overlay');
    const pauseResumeBtn = document.getElementById('pause-resume');
    const pauseRestartBtn = document.getElementById('pause-restart');
    const pauseExitMenu = document.getElementById('pause-exit-menu');
    const pauseStatus = document.getElementById('pause-status');

    // Constants
    const TRIAL_MS = 60000;
    const RADIUS = 30;

    // RNG setup
    const seedMap = { '1': 12345, '2': 67890 };
    const seedVal = seedMap[String(attempt)] || 1;

    let randomFn = (mode !== 'practice') ? makeLCG(seedVal) : Math.random;

    function makeLCG(seed) {
        const m = 0x100000000; // 2^32
        const a = 1664525;
        const c = 1013904223;
        let state = seed >>> 0;
        return function() {
            state = (a * state + c) % m;
            return state / m;
        };
    }

    function resetRNG() {
        randomFn = (mode !== 'practice') ? makeLCG(seedVal) : Math.random;
    }

    // ---- State ----
    let gameStarted = false;
    let trialEnded = false;
    let isPaused = false;

    // Phase: allows pause during countdown
    // "start" -> before click
    // "countdown" -> 5..1
    // "running" -> 60s trial active
    // "ended" -> results
    let phase = "start";

    let countdownTimer = null;
    let endTimer = null;

    // Pausable countdown value
    let countdownValue = 5;

    // Pausable trial timing
    let remainingMs = TRIAL_MS;
    let resumePerf = 0;
    let activeElapsedMs = 0;

    // Score/data
    let hits = 0;
    let misses = 0;
    let totalShots = 0;

    let targetPos = { x: 0, y: 0 };
    const events = [];

    // ---- Prevent pause menu clicks from bubbling into the game click handler ----
    pauseOverlay.addEventListener('click', (e) => e.stopPropagation());

    // Start overlay click
    startOverlay.addEventListener('click', startGame);

    function startGame() {
        if (gameStarted) return;
        gameStarted = true;
        startOverlay.style.display = 'none';
        trialEnded = false;
        phase = "countdown";
        countdownValue = 5;
        runCountdownThenBegin();
    }

    function runCountdownThenBegin() {
        clearInterval(countdownTimer);

        phase = "countdown";
        countdownEl.style.display = 'block';
        countdownEl.textContent = countdownValue;

        countdownTimer = setInterval(() => {
            if (isPaused) return; // safety

            countdownValue -= 1;
            if (countdownValue > 0) {
                countdownEl.textContent = countdownValue;
            } else {
                clearInterval(countdownTimer);
                countdownEl.style.display = 'none';
                countdownValue = 5; // reset for next restart
                beginTrialFresh();
            }
        }, 1000);
    }

    function beginTrialFresh() {
        phase = "running";
        trialEnded = false;
        isPaused = false;

        remainingMs = TRIAL_MS;
        activeElapsedMs = 0;
        resumePerf = performance.now();

        hits = 0;
        misses = 0;
        totalShots = 0;
        events.length = 0;

        // hide overlays
        resultOverlay.style.display = 'none';
        hidePauseOverlay();

        // spawn first target and start timer
        spawnTarget();
        scheduleEndTimer();
    }

    function scheduleEndTimer() {
        clearTimeout(endTimer);
        endTimer = setTimeout(endGame, remainingMs);
    }

    function spawnTarget() {
        const containerW = gameContainer.clientWidth;
        const containerH = gameContainer.clientHeight;

        const rx = randomFn();
        const ry = randomFn();

        const px = rx * (containerW - 2 * RADIUS) + RADIUS;
        const py = ry * (containerH - 2 * RADIUS) + RADIUS;

        circle.style.left = (px - RADIUS) + 'px';
        circle.style.top = (py - RADIUS) + 'px';
        circle.style.display = 'block';

        targetPos.x = px;
        targetPos.y = py;
    }

    // Pause/resume that works during countdown AND running
    function pauseGame() {
        if (trialEnded || isPaused) return;
        if (phase !== "countdown" && phase !== "running") return;

        isPaused = true;

        if (phase === "running") {
            const now = performance.now();
            const delta = now - resumePerf;
            activeElapsedMs += delta;
            remainingMs = Math.max(0, remainingMs - delta);
            clearTimeout(endTimer);
        } else if (phase === "countdown") {
            clearInterval(countdownTimer);
        }

        showPauseOverlay();
    }

    function resumeGame() {
        if (trialEnded || !isPaused) return;
        if (phase !== "countdown" && phase !== "running") return;

        isPaused = false;
        hidePauseOverlay();

        if (phase === "running") {
            resumePerf = performance.now();
            scheduleEndTimer();
        } else if (phase === "countdown") {
            // continue countdown from the current countdownValue
            runCountdownThenBegin();
        }
    }

    function togglePause() {
        if (phase !== "countdown" && phase !== "running") return;
        if (isPaused) resumeGame();
        else pauseGame();
    }

    function restartGame() {
        // Restart should always return to the countdown, not instantly start the trial.
        clearTimeout(endTimer);
        clearInterval(countdownTimer);

        isPaused = false;
        hidePauseOverlay();

        // Reset RNG so attempt pattern repeats
        resetRNG();

        // Discard current run data
        hits = 0; misses = 0; totalShots = 0;
        events.length = 0;

        // Reset timing
        remainingMs = TRIAL_MS;
        activeElapsedMs = 0;
        resumePerf = 0;

        // Hide target and results
        circle.style.display = 'none';
        resultOverlay.style.display = 'none';

        // Restart countdown fresh
        phase = "countdown";
        trialEnded = false;
        countdownValue = 5;
        countdownEl.style.display = 'block';
        countdownEl.textContent = countdownValue;

        runCountdownThenBegin();
    }

    function exitToMenuDiscard() {
        clearTimeout(endTimer);
        clearInterval(countdownTimer);

        // Discard events in memory; do NOT submit.
        events.length = 0;

        phase = "ended";
        trialEnded = true;
        isPaused = false;

        window.location.href = "index.html";
    }


    // ESC key pause
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            togglePause();
        }
    });

    // Pause menu buttons
    pauseResumeBtn.addEventListener('click', (e) => { e.stopPropagation(); resumeGame(); });
    pauseRestartBtn.addEventListener('click', (e) => { e.stopPropagation(); restartGame(); });

    pauseExitMenu.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        exitToMenuDiscard();
    });

    function showPauseOverlay() {
        pauseStatus.textContent = "";
        pauseOverlay.style.display = 'flex';
    }

    function hidePauseOverlay() {
        pauseOverlay.style.display = 'none';
    }

    // Click handling
    gameContainer.addEventListener('click', handleClick);

    function handleClick(event) {
        // Ignore clicks on UI overlays/buttons so they don't count as shots
        if (event.target.closest('#pause-overlay, #result-overlay, #start-overlay')) return;

        // Only count clicks during the running trial (not during countdown)
        if (trialEnded || isPaused || phase !== "running") return;

        const clickX = event.clientX;
        const clickY = event.clientY;

        // Elapsed active time excluding pauses
        const now = performance.now();
        const elapsedActiveMs = activeElapsedMs + (now - resumePerf);
        const elapsed = (elapsedActiveMs / 1000);

        const dx = clickX - targetPos.x;
        const dy = clickY - targetPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let status;
        if (distance <= RADIUS) {
            status = 'hit';
            hits++;

            if (mode === 'auditory') {
                audioHit.currentTime = 0;
                try { audioHit.play(); } catch (e) {}
            } else if (mode === 'visual') {
                flash('success');
            }

            spawnTarget();
        } else {
            status = 'miss';
            misses++;

            if (mode === 'auditory') {
                audioMiss.currentTime = 0;
                try { audioMiss.play(); } catch (e) {}
            } else if (mode === 'visual') {
                flash('error');
            }
            // keep same target on miss
        }

        totalShots++;

        events.push({
            time: elapsed.toFixed(3),
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

    function endGame() {
        if (trialEnded) return;

        trialEnded = true;
        phase = "ended";

        // if ending while running (not paused), add the last active segment
        if (!isPaused && phase !== "countdown") {
            const now = performance.now();
            const delta = now - resumePerf;
            activeElapsedMs += delta;
            remainingMs = Math.max(0, remainingMs - delta);
        }

        isPaused = false;
        hidePauseOverlay();

        clearTimeout(endTimer);
        clearInterval(countdownTimer);

        circle.style.display = 'none';

        const accuracy = totalShots > 0 ? (hits / totalShots * 100).toFixed(1) : '0.0';
        resultText.innerHTML = `Hits: ${hits}<br>Misses: ${misses}<br>Accuracy: ${accuracy}%`;
        resultOverlay.style.display = 'flex';

        sendResults();
    }

    function sendResults() {
        const payload = { mode: mode, attempt: attempt, events: events };
        fetch('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch((err) => {
            console.error('Failed to submit results', err);
        });
    }

    retryBtn.addEventListener('click', function(ev) {
        ev.preventDefault();
        window.location.reload();
    });

})();