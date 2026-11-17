import fs from 'fs';
import path from 'path';

const outDir = path.resolve('public/audio');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function createWavHeader(dataLength, sampleRate = 44100, numChannels = 2) {
  const buffer = Buffer.alloc(44);
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

const sampleRate = 44100;

function generateTrack(generator, durationSec = 14) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  generator(left, right, numSamples, sampleRate);

  // Normalize and convert to 16-bit PCM
  let maxAmp = 0;
  for (let i = 0; i < numSamples; i++) {
    maxAmp = Math.max(maxAmp, Math.abs(left[i]), Math.abs(right[i]));
  }
  const scale = maxAmp > 0.01 ? 0.9 / maxAmp : 1.0;

  const dataLength = numSamples * 4; // 2 channels * 2 bytes
  const pcmBuffer = Buffer.alloc(dataLength);

  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, left[i] * scale));
    const r = Math.max(-1, Math.min(1, right[i] * scale));
    const lInt = l < 0 ? l * 0x8000 : l * 0x7fff;
    const rInt = r < 0 ? r * 0x8000 : r * 0x7fff;
    pcmBuffer.writeInt16LE(Math.floor(lInt), i * 4);
    pcmBuffer.writeInt16LE(Math.floor(rInt), i * 4 + 2);
  }

  const header = createWavHeader(dataLength, sampleRate, 2);
  return Buffer.concat([header, pcmBuffer]);
}

// Helpers
const mToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const sin = (phase) => Math.sin(phase * 2 * Math.PI);
const tri = (phase) => {
  const p = phase - Math.floor(phase);
  return 4 * Math.abs(p - 0.5) - 1;
};
const saw = (phase) => 2 * (phase - Math.floor(phase)) - 1;

// 1. Kesariya (Bollywood Romantic - D Major, Flute/Pluck & Tabla pulse)
const kesariyaData = generateTrack((left, right, N, sr) => {
  const bpm = 100;
  const beatSec = 60 / bpm;
  // D - F# - A - B - A - G - F# - E - D
  const melodyMidi = [62, 66, 69, 71, 69, 67, 66, 64, 62, 66, 69, 74, 73, 71, 69, 66];
  const chords = [
    [50, 57, 62, 66], // D
    [47, 54, 59, 62], // Bm
    [43, 50, 55, 59], // G
    [45, 52, 57, 61], // A
  ];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;
    const chordIdx = Math.floor(beat / 4) % chords.length;
    const currentChord = chords[chordIdx];

    // Warm chord pad
    let chordVal = 0;
    for (const m of currentChord) {
      const f = mToFreq(m);
      chordVal += sin(t * f) * 0.12 + tri(t * f * 2.003) * 0.05;
    }

    // Lead Flute / Pluck melody
    const noteIdx = Math.floor(beat * 2) % melodyMidi.length;
    const noteTime = (beat * 2) % 1;
    const env = Math.exp(-noteTime * 3.5);
    const leadFreq = mToFreq(melodyMidi[noteIdx]);
    const leadVal = (sin(t * leadFreq) * 0.4 + sin(t * leadFreq * 2) * 0.15) * env;

    // Tabla / Dholak pulse
    const subBeat = beat % 1;
    const kickEnv = Math.exp(-subBeat * 14);
    const kick = sin(subBeat * 60) * kickEnv * 0.5;
    const hat = (Math.random() * 2 - 1) * Math.exp(-((beat * 2) % 1) * 25) * 0.08;

    left[i] = chordVal * 0.7 + leadVal * 0.8 + kick + hat;
    right[i] = chordVal * 0.7 + leadVal * 0.7 + kick + hat * 0.9;
  }
});
fs.writeFileSync(path.join(outDir, 'song_kesariya.wav'), kesariyaData);

// 2. Brown Munde (Punjabi Hip-Hop Trap - 808 Bass, Punchy Beat, Dark Synth)
const brownMundeData = generateTrack((left, right, N, sr) => {
  const bpm = 140;
  const beatSec = 60 / bpm;
  const bassNotes = [32, 32, 35, 30, 32, 32, 37, 35]; // G# Minor trap
  const leadRiff = [56, 56, 59, 63, 61, 59, 56, 54];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;

    // 808 Sub-bass
    const barBeat = beat % 8;
    const bassIdx = Math.floor(barBeat);
    const bassFreq = mToFreq(bassNotes[bassIdx % bassNotes.length]);
    const bassEnv = Math.max(0, 1 - (beat % 2) * 0.4);
    const bass = (sin(t * bassFreq) + sin(t * bassFreq * 2) * 0.3) * bassEnv * 0.6;

    // Hard punch kick on beats 0, 2, 4, 6
    const kickPhase = beat % 2;
    const kick = sin(kickPhase * 55) * Math.exp(-kickPhase * 16) * 0.6;

    // Crisp Trap Snare on beats 1, 3, 5, 7
    const snarePhase = (beat + 1) % 2;
    const snare = (Math.random() * 2 - 1) * Math.exp(-snarePhase * 12) * 0.3;

    // Fast 16th Hi-hats with trap roll
    const hatPhase = (beat * 4) % 1;
    const hat = (Math.random() * 2 - 1) * Math.exp(-hatPhase * 30) * 0.12;

    // Dark synth brass lead
    const leadIdx = Math.floor(beat) % leadRiff.length;
    const leadFreq = mToFreq(leadRiff[leadIdx]);
    const leadEnv = Math.exp(-((beat % 1) * 4));
    const lead = saw(t * leadFreq) * leadEnv * 0.22;

    left[i] = bass + kick + snare * 0.9 + hat + lead * 0.8;
    right[i] = bass + kick + snare * 0.9 + hat * 0.8 + lead * 0.9;
  }
});
fs.writeFileSync(path.join(outDir, 'song_brown_munde.wav'), brownMundeData);

// 3. Apna Bana Le (Romantic Acoustic & Strings)
const apnaBanaLeData = generateTrack((left, right, N, sr) => {
  const bpm = 92;
  const beatSec = 60 / bpm;
  const chords = [
    [48, 55, 60, 64], // C
    [45, 52, 57, 60], // Am
    [41, 48, 53, 57], // F
    [43, 50, 55, 59], // G
  ];
  const melody = [64, 67, 69, 72, 71, 69, 67, 64, 65, 67, 69, 67, 65, 64, 62, 60];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;
    const chordIdx = Math.floor(beat / 4) % chords.length;
    const chord = chords[chordIdx];

    // Acoustic arpeggio (fingerstyle)
    const arpNoteIdx = Math.floor(beat * 4) % chord.length;
    const arpFreq = mToFreq(chord[arpNoteIdx] + 12);
    const arpEnv = Math.exp(-((beat * 4) % 1) * 5);
    const arp = (tri(t * arpFreq) + sin(t * arpFreq * 2) * 0.2) * arpEnv * 0.3;

    // Warm strings pad
    let pad = 0;
    for (const m of chord) {
      pad += sin(t * mToFreq(m)) * 0.08;
    }

    // Melodic lead
    const leadIdx = Math.floor(beat * 2) % melody.length;
    const leadFreq = mToFreq(melody[leadIdx]);
    const leadEnv = Math.exp(-((beat * 2) % 1) * 3);
    const lead = sin(t * leadFreq) * leadEnv * 0.35;

    // Soft heart-beat bass
    const bass = sin(beat % 1 * 50) * Math.exp(-(beat % 1) * 8) * 0.3;

    left[i] = arp * 0.9 + pad + lead * 0.8 + bass;
    right[i] = arp * 0.7 + pad + lead * 0.9 + bass;
  }
});
fs.writeFileSync(path.join(outDir, 'song_apna_bana_le.wav'), apnaBanaLeData);

// 4. Shape of You (Pop Dance - Marimba Plucks & 4-on-the-floor)
const shapeOfYouData = generateTrack((left, right, N, sr) => {
  const bpm = 126;
  const beatSec = 60 / bpm;
  // C#m - F#m - A - B
  const marimbaNotes = [
    61, 61, 64, 66, 68, 66, 64, 61,
    66, 66, 69, 71, 73, 71, 69, 66,
    69, 69, 73, 76, 73, 71, 69, 68,
    71, 71, 75, 78, 75, 73, 71, 68
  ];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;

    // Marimba wood sound
    const noteIdx = Math.floor(beat * 2) % marimbaNotes.length;
    const notePhase = (beat * 2) % 1;
    const noteEnv = Math.exp(-notePhase * 8);
    const freq = mToFreq(marimbaNotes[noteIdx]);
    const marimba = (sin(t * freq) * 0.5 + sin(t * freq * 2.76) * 0.2 + sin(t * freq * 5.4) * 0.1) * noteEnv;

    // Pop 4/4 Kick
    const kickPhase = beat % 1;
    const kick = sin(kickPhase * 60) * Math.exp(-kickPhase * 14) * 0.55;

    // Snare / Handclap on 2 & 4
    const clapPhase = (beat + 1) % 2;
    const clap = (Math.random() * 2 - 1) * Math.exp(-clapPhase * 16) * 0.28;

    left[i] = marimba * 0.8 + kick + clap;
    right[i] = marimba * 0.9 + kick + clap;
  }
});
fs.writeFileSync(path.join(outDir, 'song_shape_of_you.wav'), shapeOfYouData);

// 5. Midnight Lofi Chill (Relaxed vinyl crackle, Fender Rhodes jazz chords)
const lofiData = generateTrack((left, right, N, sr) => {
  const bpm = 80;
  const beatSec = 60 / bpm;
  // Dm9 - G13 - Cmaj7 - A7
  const chords = [
    [50, 57, 60, 64, 67],
    [43, 55, 59, 64, 69],
    [48, 55, 59, 62, 67],
    [45, 52, 57, 61, 64],
  ];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;
    const chordIdx = Math.floor(beat / 4) % chords.length;
    const chord = chords[chordIdx];

    // Vinyl subtle noise
    const crackle = (Math.random() > 0.985 ? (Math.random() * 2 - 1) * 0.05 : 0);

    // Warm Rhodes electric piano
    let rhodes = 0;
    const subPhase = (beat % 2) / 2;
    const tremolo = 1 + 0.15 * sin(t * 5);
    for (const m of chord) {
      const f = mToFreq(m);
      rhodes += (sin(t * f) + sin(t * f * 2) * 0.2) * Math.exp(-subPhase * 2.5) * 0.08 * tremolo;
    }

    // Warm boom-bap kick
    const kickPhase = beat % 2;
    const kick = sin(kickPhase * 45) * Math.exp(-kickPhase * 10) * 0.4;

    // Lofi Rimshot / Snare
    const snarePhase = (beat + 1) % 2;
    const snare = ((Math.random() * 2 - 1) * 0.4 + sin(snarePhase * 220) * 0.6) * Math.exp(-snarePhase * 18) * 0.2;

    left[i] = rhodes * 0.85 + kick + snare + crackle;
    right[i] = rhodes * 0.95 + kick + snare + crackle;
  }
});
fs.writeFileSync(path.join(outDir, 'song_lofi_midnight.wav'), lofiData);

// 6. Pasoori (Folk Fusion - Upbeat Dhol, Claps, Melodic hook)
const pasooriData = generateTrack((left, right, N, sr) => {
  const bpm = 112;
  const beatSec = 60 / bpm;
  const melody = [58, 62, 65, 67, 70, 67, 65, 62, 65, 67, 70, 72, 70, 67, 65, 62];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;

    // Folk lead
    const noteIdx = Math.floor(beat * 2) % melody.length;
    const leadFreq = mToFreq(melody[noteIdx]);
    const lead = (saw(t * leadFreq) * 0.15 + sin(t * leadFreq) * 0.3) * Math.exp(-((beat * 2) % 1) * 4);

    // Dhol bass beat
    const dholPhase = beat % 1;
    const dhol = sin(dholPhase * 65) * Math.exp(-dholPhase * 12) * 0.5;

    // Upbeat Punjabi Claps
    const clapPhase = (beat + 0.5) % 1;
    const clap = (Math.random() * 2 - 1) * Math.exp(-clapPhase * 22) * 0.18;

    left[i] = lead * 0.8 + dhol + clap;
    right[i] = lead * 0.8 + dhol + clap;
  }
});
fs.writeFileSync(path.join(outDir, 'song_pasoori.wav'), pasooriData);

// 7. Raataan Lambiyan (Bollywood Soul & Acoustic)
const raataanData = generateTrack((left, right, N, sr) => {
  const bpm = 95;
  const beatSec = 60 / bpm;
  const melody = [67, 69, 71, 74, 71, 69, 67, 64, 67, 69, 71, 76, 74, 71, 69, 67];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;
    const leadIdx = Math.floor(beat * 2) % melody.length;
    const leadFreq = mToFreq(melody[leadIdx]);
    const lead = (sin(t * leadFreq) * 0.4 + sin(t * leadFreq * 2) * 0.15) * Math.exp(-((beat * 2) % 1) * 3);

    const bassFreq = mToFreq(43); // G root
    const bass = sin(t * bassFreq) * 0.25 * Math.exp(-(beat % 1) * 6);
    const subKick = sin((beat % 1) * 50) * Math.exp(-(beat % 1) * 12) * 0.4;

    left[i] = lead * 0.85 + bass + subKick;
    right[i] = lead * 0.85 + bass + subKick;
  }
});
fs.writeFileSync(path.join(outDir, 'song_raataan_lambiyan.wav'), raataanData);

// 8. Calm Down (Afrobeat Pop - Shakers & Rema bounce)
const calmDownData = generateTrack((left, right, N, sr) => {
  const bpm = 107;
  const beatSec = 60 / bpm;
  const leadRiff = [62, 64, 66, 69, 66, 64, 62, 59, 62, 64, 66, 69, 71, 69, 66, 64];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;

    // Log drum bass bounce
    const afroBassPhase = (beat * 2) % 1;
    const afroBass = sin(afroBassPhase * 50) * Math.exp(-afroBassPhase * 10) * 0.45;

    // Shaker groove (continuous 16ths)
    const shakerPhase = (beat * 4) % 1;
    const shaker = (Math.random() * 2 - 1) * Math.exp(-shakerPhase * 25) * 0.12;

    // Afrobeat synth pluck
    const noteIdx = Math.floor(beat * 2) % leadRiff.length;
    const leadFreq = mToFreq(leadRiff[noteIdx]);
    const lead = (sin(t * leadFreq) * 0.35 + tri(t * leadFreq) * 0.15) * Math.exp(-((beat * 2) % 1) * 5);

    left[i] = afroBass + shaker + lead * 0.8;
    right[i] = afroBass + shaker * 0.8 + lead * 0.9;
  }
});
fs.writeFileSync(path.join(outDir, 'song_calm_down.wav'), calmDownData);

// 9. Starboy (The Weeknd / Daft Punk Synthwave)
const starboyData = generateTrack((left, right, N, sr) => {
  const bpm = 186 / 2;
  const beatSec = 60 / bpm;
  const bassNotes = [33, 33, 33, 36, 38, 38, 36, 33];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;

    // Rolling 80s bassline
    const bassIdx = Math.floor(beat * 2) % bassNotes.length;
    const bassFreq = mToFreq(bassNotes[bassIdx]);
    const bass = (saw(t * bassFreq) * 0.25 + sin(t * bassFreq) * 0.3) * Math.exp(-((beat * 2) % 1) * 6);

    // Punchy 80s Kick & Snare
    const kick = sin((beat % 1) * 55) * Math.exp(-(beat % 1) * 15) * 0.55;
    const snare = ((beat + 1) % 2 < 0.2 ? (Math.random() * 2 - 1) * 0.3 : 0);

    // Dark synth pad
    const pad = (saw(t * mToFreq(57)) + saw(t * mToFreq(60)) + saw(t * mToFreq(64))) * 0.05;

    left[i] = bass + kick + snare + pad;
    right[i] = bass + kick + snare + pad;
  }
});
fs.writeFileSync(path.join(outDir, 'song_starboy.wav'), starboyData);

// 10. Kahani Suno 2.0 (Kaifi Khalil Acoustic Ballad)
const kahaniSunoData = generateTrack((left, right, N, sr) => {
  const bpm = 88;
  const beatSec = 60 / bpm;
  const melody = [60, 62, 64, 67, 65, 64, 62, 60, 57, 60, 62, 65, 64, 62, 60, 59];

  for (let i = 0; i < N; i++) {
    const t = i / sr;
    const beat = t / beatSec;

    const noteIdx = Math.floor(beat * 2) % melody.length;
    const leadFreq = mToFreq(melody[noteIdx]);
    const lead = (sin(t * leadFreq) * 0.4 + tri(t * leadFreq * 2) * 0.1) * Math.exp(-((beat * 2) % 1) * 3.5);

    // Soft guitar arpeggio
    const arpFreq = mToFreq(45 + (Math.floor(beat * 4) % 4) * 4);
    const arp = tri(t * arpFreq) * 0.15 * Math.exp(-((beat * 4) % 1) * 4);

    const bass = sin((beat % 2) * 45) * Math.exp(-(beat % 2) * 8) * 0.3;

    left[i] = lead * 0.85 + arp + bass;
    right[i] = lead * 0.85 + arp * 0.8 + bass;
  }
});
fs.writeFileSync(path.join(outDir, 'song_kahani_suno.wav'), kahaniSunoData);

console.log('Successfully generated all 10 song audio files in public/audio/!');
