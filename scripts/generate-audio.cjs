// Programmatic upbeat modern tech soundtrack generator (87s WAV)
const fs = require('fs');
const path = require('path');

const sampleRate = 44100;
const duration = 104; // seconds
const numSamples = sampleRate * duration;
const buffer = Buffer.alloc(44 + numSamples * 2);

// WAV Header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + numSamples * 2, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // SubChunk1Size (16 for PCM)
buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
buffer.writeUInt16LE(1, 22); // NumChannels (1 = Mono)
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
buffer.writeUInt16LE(2, 32); // BlockAlign
buffer.writeUInt16LE(16, 34); // BitsPerSample
buffer.write('data', 36);
buffer.writeUInt32LE(numSamples * 2, 40);

const bpm = 120;
const beatDuration = 60 / bpm; // 0.5s per beat
const chordRoots = [220, 261.63, 293.66, 196]; // A3, C4, D4, G3

for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  const beat = (t / beatDuration);
  const bar = Math.floor(beat / 4);

  const chordIndex = bar % chordRoots.length;
  const root = chordRoots[chordIndex];

  // 1. Kick drum (every beat)
  const kickTime = t % beatDuration;
  let kick = 0;
  if (kickTime < 0.18) {
    const freq = 120 * Math.exp(-kickTime * 25) + 45;
    kick = Math.sin(2 * Math.PI * freq * kickTime) * Math.exp(-kickTime * 18) * 0.4;
  }

  // 2. Hi-hat (every half beat / 8th notes)
  const hatTime = t % (beatDuration / 2);
  let hat = 0;
  if (hatTime < 0.05) {
    hat = (Math.random() * 2 - 1) * Math.exp(-hatTime * 60) * 0.07;
  }

  // 3. Upbeat Synth Arpeggio (16th notes)
  const arpStep = Math.floor(beat * 4) % 8;
  const arpIntervals = [0, 7, 12, 16, 19, 16, 12, 7];
  const arpFreq = root * Math.pow(2, arpIntervals[arpStep] / 12);
  const arpTime = t % (beatDuration / 4);
  const synth = (Math.sin(2 * Math.PI * arpFreq * t) + 0.3 * Math.sin(2 * Math.PI * arpFreq * 2 * t)) * Math.exp(-arpTime * 12) * 0.16;

  // 4. Warm Sub Bass
  const bass = Math.sin(2 * Math.PI * (root / 2) * t) * 0.2;

  // Master fade in (first 1.5s) and fade out (last 2s)
  let masterGain = 1.0;
  if (t < 1.5) masterGain = t / 1.5;
  if (t > duration - 2.5) masterGain = Math.max(0, (duration - t) / 2.5);

  const sample = Math.max(-1, Math.min(1, (kick + hat + synth + bass) * masterGain));
  buffer.writeInt16LE(Math.floor(sample * 32767), 44 + i * 2);
}

const outputPath = path.resolve(__dirname, '../video/public/background-track.wav');
fs.writeFileSync(outputPath, buffer);
console.log(`🎵 Programmatic tech soundtrack generated at: ${outputPath}`);
