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
    initialField: document.getElementById('initialField'),
    incrementField: document.getElementById('incrementField'),
    nextField: document.getElementById('nextField'),
    initial: document.getElementById('initialSelect'),
    incMinus: document.getElementById('incMinus'),
    incPlus: document.getElementById('incPlus'),
    incValue: document.getElementById('incValue'),
    nextValue: document.getElementById('nextValue'),
    nextMinus: document.getElementById('nextMinus'),
    nextPlus: document.getElementById('nextPlus'),
    log: document.getElementById('log'),
    reset: document.getElementById('resetBtn'),
    sound: document.getElementById('soundBtn'),
    controls: document.querySelector('.controls'),
  };

  // ---------- constants ----------

  const STEP = 5;             // every adjustment moves in 5s steps
  const INITIAL_MIN = 5;      // dropdown runs 5s .. 1min
  const INITIAL_MAX = 60;
  const INCREMENT_MAX = 60;
  const NEXT_MIN = 5;         // a started infusion can be stretched well past a minute
  const NEXT_MAX = 600;
  const DONE_HOLD_MS = 900;   // how long the full cup lingers before resetting

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------- state ----------

  const state = {
    phase: 'setup',    // 'setup' | 'running' | 'paused' | 'done'
    steep: 1,          // the infusion that is running, or the one about to
    increment: 5,      // added to each finished steep to seed the next
    next: 20,          // seconds the upcoming infusion will run for
    duration: 0,       // seconds of the infusion currently running
    remaining: 0,
    endAt: 0,
    holding: false,    // showing the full cup right after a steep finishes
    history: [],
  };

  // ---------- formatting ----------

  function formatClock(sec) {
    const total = Math.max(0, Math.ceil(sec));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  // How much longer the pending infusion is than the steep just finished —
  // the chosen increment until the time is nudged, then whatever it works out to.
  function formatDelta(sec) {
    if (sec === 0) return '0s';
    return `${sec > 0 ? '+' : '\u2212'}${Math.abs(sec)}s`;
  }

  function formatShort(sec) {
    if (sec < 60) return `${sec}s`;
    return sec % 60 === 0 ? `${sec / 60} min` : formatClock(sec);
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
    const f = clamp(fill, 0, 1);
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

  function buildInitialOptions() {
    const frag = document.createDocumentFragment();
    for (let s = INITIAL_MIN; s <= INITIAL_MAX; s += STEP) {
      const o = document.createElement('option');
      o.value = String(s);
      o.textContent = formatShort(s);
      frag.append(o);
    }
    el.initial.replaceChildren(frag);
    el.initial.value = String(state.next);
  }

  function renderLog() {
    el.log.replaceChildren(...state.history.map((sec, i) => {
      const s = document.createElement('span');
      s.textContent = `${i + 1} · ${formatShort(sec)}`;
      return s;
    }));
    el.reset.hidden = state.history.length === 0 && state.phase === 'setup';
  }

  function paint() {
    const { phase } = state;
    const setup = phase === 'setup';
    const done = phase === 'done';
    const idle = setup || done;

    // Which pair of fields the stack shows. While a steep runs the controls are
    // only made invisible, so this keeps holding their space and the dial still.
    const layout = state.history.length === 0 ? 'setup' : 'done';

    el.steep.textContent = `Steep ${state.steep}`;
    el.dialBtn.classList.toggle('is-done', done && state.holding);
    el.controls.classList.toggle('hidden', !idle);
    el.initialField.hidden = layout !== 'setup';
    el.nextField.hidden = layout === 'setup';
    // increment is a first-steep setting; afterwards its value moves into the
    // Next infusion stepper and this field just holds the dial in place
    el.incrementField.classList.toggle('spacer', layout !== 'setup');

    if (state.history.length) {
      const last = state.history[state.history.length - 1];
      el.nextValue.textContent = formatDelta(state.next - last);
    }

    el.incValue.textContent = `+${state.increment}s`;
    el.incMinus.disabled = state.increment <= 0;
    el.incPlus.disabled = state.increment >= INCREMENT_MAX;
    el.nextMinus.disabled = state.next <= NEXT_MIN;
    el.nextPlus.disabled = state.next >= NEXT_MAX;

    if (setup) {
      el.hint.textContent = 'Tap the dial to start';
      el.state.textContent = 'Tap to start';
    } else if (phase === 'running') {
      el.hint.textContent = 'Tap the dial to pause';
      el.state.textContent = '';
    } else if (phase === 'paused') {
      el.hint.textContent = 'Tap the dial to resume';
      el.state.textContent = 'Paused';
    } else {
      el.hint.textContent = state.holding
        ? 'Decant the infusion'
        : 'Tap the dial for the next infusion';
      el.state.textContent = state.holding ? 'Done' : 'Tap to start';
    }

    renderLog();
  }

  // ---------- timer ----------

  let rafId = 0;
  let safetyTimer = 0;
  let holdTimer = 0;

  function tick() {
    if (state.phase !== 'running') return;

    const left = (state.endAt - performance.now()) / 1000;
    state.remaining = Math.max(0, left);
    render(1 - state.remaining / state.duration, state.remaining);

    if (left <= 0) { finish(); return; }
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    unlockAudio();
    clearTimeout(holdTimer);

    state.phase = 'running';
    state.holding = false;
    state.duration = state.next;
    state.remaining = state.next;
    state.endAt = performance.now() + state.next * 1000;

    smoothWater(false);
    render(0, state.next);
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

    state.history.push(state.duration);
    state.next = clamp(state.duration + state.increment, NEXT_MIN, NEXT_MAX);
    state.steep += 1;
    state.phase = 'done';
    state.holding = true;
    state.remaining = 0;

    smoothWater(false);
    render(1, 0);
    paint();
    releaseWakeLock();
    chime();
    if (navigator.vibrate) navigator.vibrate([120, 90, 120]);

    // Let the full cup sit for a beat, then drain it and show what is next.
    holdTimer = setTimeout(releaseHold, DONE_HOLD_MS);
  }

  function releaseHold() {
    clearTimeout(holdTimer);
    if (state.phase !== 'done' || !state.holding) return;
    state.holding = false;
    smoothWater(true);
    render(0, state.next);
    paint();
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

  // The dial is the single start control: it begins the first steep and every
  // infusion after it, and pauses whatever is already running.
  function dialPressed() {
    if (state.phase === 'setup' || state.phase === 'done') start();
    else togglePause();
  }

  function adjustNext(delta) {
    if (state.phase !== 'setup' && state.phase !== 'done') return;
    releaseHold();

    const lo = state.phase === 'setup' ? INITIAL_MIN : NEXT_MIN;
    const hi = state.phase === 'setup' ? INITIAL_MAX : NEXT_MAX;
    state.next = clamp(state.next + delta, lo, hi);

    if (state.phase === 'setup') el.initial.value = String(state.next);
    smoothWater(true);
    render(0, state.next);
    paint();
  }

  function adjustIncrement(delta) {
    state.increment = clamp(state.increment + delta, 0, INCREMENT_MAX);
    paint();
  }

  function reset() {
    cancelAnimationFrame(rafId);
    clearInterval(safetyTimer);
    clearTimeout(holdTimer);
    releaseWakeLock();

    state.phase = 'setup';
    state.steep = 1;
    state.duration = 0;
    state.remaining = 0;
    state.endAt = 0;
    state.holding = false;
    state.history = [];
    state.next = Number(el.initial.value);

    smoothWater(true);
    render(0, state.next);
    paint();
  }

  // ---------- events ----------

  el.dialBtn.addEventListener('click', dialPressed);
  el.reset.addEventListener('click', reset);
  el.sound.addEventListener('click', toggleSound);

  el.incMinus.addEventListener('click', () => adjustIncrement(-STEP));
  el.incPlus.addEventListener('click', () => adjustIncrement(STEP));
  el.nextMinus.addEventListener('click', () => adjustNext(-STEP));
  el.nextPlus.addEventListener('click', () => adjustNext(STEP));

  el.initial.addEventListener('change', () => {
    state.next = clamp(Number(el.initial.value), INITIAL_MIN, INITIAL_MAX);
    smoothWater(true);
    render(0, state.next);
    paint();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (state.phase === 'running') {
      if (performance.now() >= state.endAt) finish();
      else { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(tick); requestWakeLock(); }
    }
  });

  document.addEventListener('keydown', (e) => {
    const onControl = e.target.closest('button, select');
    if (onControl && (e.key === 'Enter' || e.code === 'Space')) return;

    if (e.code === 'Space') {
      e.preventDefault();
      dialPressed();
    } else if (e.key === 'ArrowUp' || e.key === '+' || e.key === '=') {
      e.preventDefault();
      adjustNext(STEP);
    } else if (e.key === 'ArrowDown' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      adjustNext(-STEP);
    } else if (e.key.toLowerCase() === 'r') {
      reset();
    } else if (e.key.toLowerCase() === 's') {
      toggleSound();
    }
  });

  // ---------- boot ----------

  buildInitialOptions();
  paintSound();
  smoothWater(true);
  render(0, state.next);
  paint();

  // Offline support + Android's "install app" prompt. Needs https (or localhost).
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
