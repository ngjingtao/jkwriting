let ctx = null;
let enabled = true;

function audio() {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setSound(on) {
  enabled = Boolean(on);
}

export function unlockAudio() {
  audio();
}

function beep(freq, start, duration, type = 'sine', gain = 0.05) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export const sfx = {
  tap() {
    beep(660, 0, 0.08, 'triangle', 0.03);
  },
  ok() {
    beep(880, 0, 0.12, 'sine', 0.05);
    beep(1320, 0.06, 0.16, 'sine', 0.04);
  },
  bad() {
    beep(200, 0, 0.16, 'sine', 0.05);
    beep(160, 0.1, 0.18, 'sine', 0.04);
  },
  done() {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, i * 0.09, 0.35, 'sine', 0.05));
  },
};
