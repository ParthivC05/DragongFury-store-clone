/**
 * Prize-wheel SFX: original peg ticks + rumble while spinning,
 * original lose sting, and the newer win clip.
 * Unlock from a click so Safari/Chrome allow playback.
 */

const WIN_SRC = '/sounds/spin-win.wav';
const WIN_VOLUME = 0.7;
const TICK_MIN_GAP_SEC = 0.032;
const MASTER_GAIN = 0.42;

let audioCtx = null;
let masterGain = null;
let noiseBuffer = null;
let rumbleNodes = null;
let lastTickAt = 0;
let winAudio = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = MASTER_GAIN;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  noiseBuffer = buffer;
  return noiseBuffer;
}

function safeStop(node) {
  try {
    node.stop();
  } catch {
    /* already stopped */
  }
}

function getWinAudio() {
  if (!winAudio) {
    winAudio = new Audio(WIN_SRC);
    winAudio.preload = 'auto';
    winAudio.volume = WIN_VOLUME;
    winAudio.setAttribute('playsinline', '');
  }
  return winAudio;
}

export function unlockSpinWheelSound() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  getWinAudio();
}

export function playSpinTick(rotationSpeed = 400) {
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

  const now = ctx.currentTime;
  if (now - lastTickAt < TICK_MIN_GAP_SEC) return;
  lastTickAt = now;

  const speed = Math.min(1, Math.max(0.15, Math.abs(Number(rotationSpeed) || 400) / 520));
  const clickGain = 0.18 + speed * 0.22;

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(2100 + speed * 700, now);
  osc.frequency.exponentialRampToValueAtTime(380, now + 0.028);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(clickGain, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 2400 + speed * 900;
  bandpass.Q.value = 5.5;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(clickGain * 0.7, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

  osc.connect(oscGain).connect(masterGain);
  noise.connect(bandpass).connect(noiseGain).connect(masterGain);

  osc.start(now);
  osc.stop(now + 0.05);
  noise.start(now);
  noise.stop(now + 0.05);
}

export function startSpinLoop() {
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  stopSpinLoop();

  const noise = ctx.createBufferSource();
  const loopBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = loopBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  noise.buffer = loopBuffer;
  noise.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 0.7;

  const rumbleOsc = ctx.createOscillator();
  rumbleOsc.type = 'sawtooth';
  rumbleOsc.frequency.value = 48;

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 90;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.12);

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  rumbleGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.12);

  noise.connect(filter).connect(gain).connect(masterGain);
  rumbleOsc.connect(rumbleFilter).connect(rumbleGain).connect(masterGain);

  noise.start();
  rumbleOsc.start();
  rumbleNodes = { noise, rumbleOsc, gain, rumbleGain, ctx };
}

export function stopSpinLoop() {
  if (!rumbleNodes) return;
  const { noise, rumbleOsc, gain, rumbleGain, ctx } = rumbleNodes;
  const now = ctx.currentTime;
  try {
    gain.gain.cancelScheduledValues(now);
    rumbleGain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    rumbleGain.gain.setValueAtTime(Math.max(0.0001, rumbleGain.gain.value), now);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.16);
    rumbleGain.gain.linearRampToValueAtTime(0.0001, now + 0.16);
  } catch {
    /* ignore */
  }
  rumbleNodes = null;
  window.setTimeout(() => {
    safeStop(noise);
    safeStop(rumbleOsc);
  }, 180);
}

function playTone(freq, start, duration, volume, type = 'sine') {
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(masterGain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playSpinResult(isWin) {
  stopSpinLoop();
  if (isWin) {
    const audio = getWinAudio();
    try {
      audio.currentTime = 0;
      const play = audio.play();
      if (play && typeof play.catch === 'function') play.catch(() => {});
    } catch {
      /* autoplay blocked */
    }
    return;
  }

  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;
  const now = ctx.currentTime;
  playTone(220, now, 0.22, 0.18, 'triangle');
  playTone(164.81, now + 0.14, 0.32, 0.16, 'triangle');
}

export function stopSpinSounds() {
  stopSpinLoop();
}
