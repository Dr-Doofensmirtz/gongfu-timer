/* Gongfu Timer — a minimal steeping timer for gongfu style tea brewing. */

(() => {
  'use strict';

  // ---------- elements ----------

  const el = {
    steep: document.getElementById('steepLabel'),
    hint: document.getElementById('hintLabel'),
    dialBtn: document.getElementById('dialBtn'),
    water: document.getElementById('waterLevel'),
    waveBack: document.getElementById('waveBack'),
    waveFront: document.getElementById('waveFront'),
    ring: document.getElementById('ringProgress'),
    time: document.getElementById('timeLabel'),
    state: document.getElementById('stateLabel'),
    chooseLabel: document.getElementById('chooseLabel'),
    options: document.getElementById('options'),
    log: document.getElementById('log'),
    reset: document.getElementById('resetBtn'),
    sound: document.getElementById('soundBtn'),
    controls: document.querySelector('.controls'),
  };

  // ---------- state ----------

  const state = {
    phase: 'choosing',   // 'choosing' | 'running' | 'paused' | 'done'
    steep: 1,            // steep number being chosen or brewed
    duration: 0,         // seconds of the current steep
    remaining: 0,        // seconds left (float)
    endAt: 0,            // timestamp the current run ends at
    lastPicked: null,    // seconds of the most recent steep, drives the next options
    history: [],
  };

  const FIRST_OPTIONS = [10, 15, 20, 25, 30];
  const MINUTE = 60;

  /**
   * The next set of steeping times, in seconds.
   *  - no steep yet          -> 10s .. 30s
   *  - last steep under 1min -> +5s, +10s, +15s and 1min
   *  - last steep in minutes -> that minute and the next four
   */
  function nextOptions(last) {
    if (last == null) return FIRST_OPTIONS.slice();

    if (last >= MINUTE) {
      const m = Math.round(last / MINUTE);
      return [0, 1, 2, 3, 4].map((i) => (m + i) * MINUTE);
    }

    const stepped = [last + 5, last + 10, last + 15].filter((s) => s < MINUTE);
    return [...new Set([...stepped, MINUTE])].sort((a, b) => a - b);
  }

  function formatOption(sec) {
    if (sec < MINUTE) return `${sec}s`;
    const m = sec / MINUTE;
    return Number.isInteger(m) ? `${m} min` : formatClock(sec);
  }

  function formatClock(sec) {
    const total = Math.max(0, Math.ceil(sec));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ---------- water + ring ----------

  const RING_LENGTH = 2 * Math.PI * 92;
  el.ring.style.strokeDasharray = `${RING_LENGTH}`;

  // Two sine bands wide enough to slide a full wavelength without exposing an edge.
  function buildWave(amplitude, wavelength) {
    const start = -200;
    const end = 400;
    let d = `M ${start} 0`;
    for (let x = start; x < end; x += wavelength) {
      const q = wavelength / 4;
      d += ` q ${q} ${-amplitude} ${wavelength / 2} 0 q ${q} ${amplitude} ${wavelength / 2} 0`;
    }
    return `${d} L ${end + wavelength} 260 L ${start} 260 Z`;
  }

  el.waveBack.setAttribute('d', buildWave(7, 100));
  el.waveFront.setAttribute('d', buildWave(4.5, 100));

  // fill: 0 = empty cup, 1 = full cup
  function render(fill, secondsLeft) {
    const f = Math.min(1, Math.max(0, fill));
    el.water.style.transform = `translateY(${200 - f * 212}px)`;
    el.ring.style.strokeDashoffset = `${RING_LENGTH * (1 - f)}`;
    el.time.textContent = formatClock(secondsLeft);
  }

  function smoothWater(on) {
    el.water.classList.toggle('smooth', on);
  }

  // ---------- chime ----------

  let audioCtx = null;
  const SOUND_KEY = 'gongfu.sound';

  function readSoundPref() {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  }

  let soundOn = readSoundPref();

  function paintSound() {
    el.sound.setAttribute('aria-pressed', String(soundOn));
    el.sound.setAttribute('aria-label', soundOn ? 'Sound on' : 'Sound off');
  }

  function toggleSound() {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch { /* ignore */ }
    paintSound();
    if (soundOn) unlockAudio();
  }

  function chime() {
    if (!soundOn) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      [0, 0.18, 0.36].forEach((offset, i) => {
        const t = audioCtx.currentTime + offset;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(i === 2 ? 1046.5 : 783.99, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 1);
      });
    } catch {
      /* audio is a nicety — never let it break the timer */
    }
  }

  function unlockAudio() {
    try {
      if (!soundOn) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch { /* ignore */ }
  }

  // ---------- screen wake lock ----------

  let wakeLock = null;

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* not critical */ }
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  // ---------- ui ----------

  function renderOptions() {
    const opts = nextOptions(state.lastPicked);
    el.options.replaceChildren(...opts.map((sec, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt' + (i === 0 ? ' suggested' : '');
      b.textContent = formatOption(sec);
      b.dataset.seconds = String(sec);
      b.addEventListener('click', () => start(sec));
      return b;
    }));
  }

  function renderLog() {
    el.log.replaceChildren(...state.history.map((sec, i) => {
      const s = document.createElement('span');
      s.textContent = `${i + 1} · ${formatOption(sec)}`;
      return s;
    }));
    el.reset.hidden = state.history.length === 0;
  }

  function paint() {
    const { phase, steep } = state;

    el.steep.textContent = `Steep ${steep}`;
    el.dialBtn.classList.toggle('is-done', phase === 'done');
    el.controls.classList.toggle('hidden', phase === 'running' || phase === 'paused');

    if (phase === 'choosing') {
      el.hint.textContent = state.history.length
        ? 'Ready when you are'
        : 'Choose a steeping time';
      el.state.textContent = '';
      el.chooseLabel.textContent = state.history.length
        ? `Steep ${steep} time`
        : 'Steeping time';
      renderOptions();
      smoothWater(true);
      render(0, state.duration);
    } else if (phase === 'running') {
      el.hint.textContent = 'Tap the dial to pause';
      el.state.textContent = '';
    } else if (phase === 'paused') {
      el.hint.textContent = 'Tap the dial to resume';
      el.state.textContent = 'Paused';
    } else if (phase === 'done') {
      el.hint.textContent = 'Decant — then pick the next steep';
      el.state.textContent = 'Done';
      el.chooseLabel.textContent = `Steep ${steep} time`;
      renderOptions();
    }

    renderLog();
  }

  // ---------- timer ----------

  let rafId = 0;
  let safetyTimer = 0;

  function tick() {
    if (state.phase !== 'running') return;

    const left = (state.endAt - performance.now()) / 1000;
    state.remaining = Math.max(0, left);
    render(1 - state.remaining / state.duration, state.remaining);

    if (left <= 0) { finish(); return; }
    rafId = requestAnimationFrame(tick);
  }

  function start(seconds) {
    unlockAudio();
    state.phase = 'running';
    state.duration = seconds;
    state.remaining = seconds;
    state.endAt = performance.now() + seconds * 1000;

    smoothWater(false);
    render(0, seconds);
    paint();
    requestWakeLock();

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);

    // rAF is throttled in background tabs; this keeps the finish honest.
    clearInterval(safetyTimer);
    safetyTimer = setInterval(() => {
      if (state.phase === 'running' && performance.now() >= state.endAt) finish();
    }, 500);
  }

  function finish() {
    cancelAnimationFrame(rafId);
    clearInterval(safetyTimer);

    state.phase = 'done';
    state.remaining = 0;
    state.history.push(state.duration);
    state.lastPicked = state.duration;
    state.steep += 1;

    render(1, 0);
    paint();
    releaseWakeLock();
    chime();
    if (navigator.vibrate) navigator.vibrate([120, 90, 120]);
  }

  function togglePause() {
    if (state.phase === 'running') {
      cancelAnimationFrame(rafId);
      state.remaining = Math.max(0, (state.endAt - performance.now()) / 1000);
      state.phase = 'paused';
      releaseWakeLock();
      paint();
    } else if (state.phase === 'paused') {
      state.endAt = performance.now() + state.remaining * 1000;
      state.phase = 'running';
      requestWakeLock();
      paint();
      rafId = requestAnimationFrame(tick);
    }
  }

  function reset() {
    cancelAnimationFrame(rafId);
    clearInterval(safetyTimer);
    releaseWakeLock();
    Object.assign(state, {
      phase: 'choosing', steep: 1, duration: 0, remaining: 0,
      endAt: 0, lastPicked: null, history: [],
    });
    paint();
  }

  // ---------- events ----------

  el.dialBtn.addEventListener('click', togglePause);
  el.reset.addEventListener('click', reset);
  el.sound.addEventListener('click', toggleSound);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (state.phase === 'running') {
      if (performance.now() >= state.endAt) finish();
      else { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(tick); requestWakeLock(); }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('button') && e.key === 'Enter') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (state.phase === 'running' || state.phase === 'paused') togglePause();
      else el.options.querySelector('.opt')?.click();
    } else if (e.key.toLowerCase() === 'r') {
      reset();
    } else if (e.key.toLowerCase() === 's') {
      toggleSound();
    } else if (/^[1-9]$/.test(e.key)) {
      el.options.children[Number(e.key) - 1]?.click();
    }
  });

  paintSound();
  paint();

  // Offline support + Android's "install app" prompt. Needs https (or localhost).
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
