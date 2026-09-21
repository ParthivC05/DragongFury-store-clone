import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../public/sounds');
const SR = 44100;

function clamp(x) {
  return Math.max(-1, Math.min(1, x));
}

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    buf.writeInt16LE((clamp(samples[i]) * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

function envExp(t, decay) {
  return Math.exp(-t * decay);
}

function fmBell(t, freq) {
  const e = envExp(t, 5.2);
  const mod = Math.sin(2 * Math.PI * freq * 2.03 * t) * (2.4 * e);
  return Math.sin(2 * Math.PI * freq * t + mod) * e;
}

function generateWin() {
  const dur = 0.85;
  const n = Math.floor(SR * dur);
  const samples = new Float32Array(n);
  const notes = [
    { freq: 987.77, at: 0 },
    { freq: 1318.51, at: 0.09 },
    { freq: 1567.98, at: 0.18 },
    { freq: 1975.53, at: 0.3 },
  ];

  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    let s = 0;
    for (const note of notes) {
      const local = t - note.at;
      if (local >= 0) s += fmBell(local, note.freq) * 0.22;
    }
    if (t < 0.04) {
      s += (Math.random() * 2 - 1) * (1 - t / 0.04) * 0.12;
    }
    samples[i] = s;
  }
  return samples;
}

fs.mkdirSync(outDir, { recursive: true });
writeWav(path.join(outDir, 'spin-win.wav'), generateWin());
console.log('wrote', path.join(outDir, 'spin-win.wav'));
