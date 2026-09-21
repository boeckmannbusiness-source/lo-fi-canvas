import { fftMagnitudes } from "./fft";
import type { AudioFrame } from "./types";

export const ANALYSIS_FPS = 60;
const FFT_SIZE = 2048;
const BINS = 64;
const WAVE = 256;

export interface AudioAnalysis {
  fps: number;
  frames: number;
  duration: number;
  sampleRate: number;
  rms: Float32Array;
  bass: Float32Array;
  mid: Float32Array;
  treble: Float32Array;
  /** frames * BINS */
  spectrum: Float32Array;
  /** frames * WAVE */
  waveform: Float32Array;
  /** per-frame RMS level for left channel */
  levelLeft: Float32Array;
  /** per-frame RMS level for right channel */
  levelRight: Float32Array;
  /** peak hold level for left channel (decays slowly) */
  peakLeft: Float32Array;
  /** peak hold level for right channel (decays slowly) */
  peakRight: Float32Array;
}

/**
 * Precomputes per-frame audio features from decoded PCM.
 * Deterministic: identical audio always yields identical features, so the
 * realtime preview and the offline render stay in sync.
 */
export async function analyzeBuffer(
  buffer: AudioBuffer,
  onProgress?: (p: number) => void,
): Promise<AudioAnalysis> {
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const chCount = buffer.numberOfChannels;

  // Keep separate channel data for stereo level analysis
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, chCount); c++) {
    channels.push(buffer.getChannelData(c));
  }

  const mono = new Float32Array(length);
  for (let c = 0; c < chCount; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i]! += data[i]! / chCount;
  }

  const frames = Math.max(1, Math.ceil(buffer.duration * ANALYSIS_FPS));
  const res: AudioAnalysis = {
    fps: ANALYSIS_FPS,
    frames,
    duration: buffer.duration,
    sampleRate,
    rms: new Float32Array(frames),
    bass: new Float32Array(frames),
    mid: new Float32Array(frames),
    treble: new Float32Array(frames),
    spectrum: new Float32Array(frames * BINS),
    waveform: new Float32Array(frames * WAVE),
    levelLeft: new Float32Array(frames),
    levelRight: new Float32Array(frames),
    peakLeft: new Float32Array(frames),
    peakRight: new Float32Array(frames),
  };

  const window = new Float32Array(FFT_SIZE);
  const mags = new Float32Array(FFT_SIZE / 2);
  const nyquist = sampleRate / 2;
  const binHz = nyquist / (FFT_SIZE / 2);
  const smooth = 0.55;
  let sB = 0;
  let sM = 0;
  let sT = 0;
  let sR = 0;
  const prevSpec = new Float32Array(BINS);

  // Stereo level meter: attack/release smoothing
  // Fast attack (responds quickly to transients), slow release (holds peaks)
  const attackCoeff = 0.12;  // ~8ms at 60fps — fast response
  const releaseCoeff = 0.025; // ~40ms at 60fps — smooth decay
  let sL = 0;
  let sRch = 0;
  let peakL = 0;
  let peakR = 0;
  const peakDecay = 0.997; // slow peak decay (~0.3%/frame)
  const leftWindow = new Float32Array(FFT_SIZE);
  const rightWindow = new Float32Array(FFT_SIZE);

  for (let f = 0; f < frames; f++) {
    const center = Math.floor((f / ANALYSIS_FPS) * sampleRate);
    const start = center - FFT_SIZE / 2;
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = start + i;
      window[i] = idx >= 0 && idx < length ? mono[idx]! : 0;
    }
    fftMagnitudes(window, mags);

    let rms = 0;
    for (let i = 0; i < FFT_SIZE; i++) rms += window[i]! * window[i]!;
    rms = Math.sqrt(rms / FFT_SIZE) * 2.2;

    let bass = 0;
    let bassN = 0;
    let mid = 0;
    let midN = 0;
    let treble = 0;
    let trebleN = 0;
    for (let i = 1; i < mags.length; i++) {
      const hz = i * binHz;
      const v = mags[i]!;
      if (hz < 160) {
        bass += v;
        bassN++;
      } else if (hz < 2000) {
        mid += v;
        midN++;
      } else if (hz < 12000) {
        treble += v;
        trebleN++;
      }
    }
    bass = Math.min(1, (bass / Math.max(1, bassN)) * 26);
    mid = Math.min(1, (mid / Math.max(1, midN)) * 70);
    treble = Math.min(1, (treble / Math.max(1, trebleN)) * 160);

    sB = sB * smooth + bass * (1 - smooth);
    sM = sM * smooth + mid * (1 - smooth);
    sT = sT * smooth + treble * (1 - smooth);
    sR = sR * smooth + Math.min(1, rms) * (1 - smooth);
    res.bass[f] = sB;
    res.mid[f] = sM;
    res.treble[f] = sT;
    res.rms[f] = sR;

    // Per-channel RMS for stereo level meter
    // For mono audio, both channels get the same data
    if (channels.length >= 1) {
      for (let i = 0; i < FFT_SIZE; i++) {
        const idx = start + i;
        leftWindow[i] = idx >= 0 && idx < length ? channels[0]![idx]! : 0;
      }
    }
    if (channels.length >= 2) {
      for (let i = 0; i < FFT_SIZE; i++) {
        const idx = start + i;
        rightWindow[i] = idx >= 0 && idx < length ? channels[1]![idx]! : 0;
      }
    } else {
      // Mono: copy left to right so both meters react equally
      rightWindow.set(leftWindow);
    }
    let lRms = 0;
    let rRms = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      lRms += leftWindow[i]! * leftWindow[i]!;
      rRms += rightWindow[i]! * rightWindow[i]!;
    }
    lRms = Math.sqrt(lRms / FFT_SIZE) * 2.2;
    rRms = Math.sqrt(rRms / FFT_SIZE) * 2.2;

    // Asymmetric attack/release: fast attack, slow release
    const lTarget = Math.min(1, lRms);
    const rTarget = Math.min(1, rRms);
    const lCoeff = lTarget > sL ? attackCoeff : releaseCoeff;
    const rCoeff = rTarget > sRch ? attackCoeff : releaseCoeff;
    sL = sL * (1 - lCoeff) + lTarget * lCoeff;
    sRch = sRch * (1 - rCoeff) + rTarget * rCoeff;
    res.levelLeft[f] = sL;
    res.levelRight[f] = sRch;

    // Peak hold: rise instantly, decay slowly
    peakL = Math.max(sL, peakL * peakDecay);
    peakR = Math.max(sRch, peakR * peakDecay);
    res.peakLeft[f] = peakL;
    res.peakRight[f] = peakR;

    // log-spaced spectrum bins
    for (let b = 0; b < BINS; b++) {
      const lo = Math.floor(Math.pow(b / BINS, 2.2) * (mags.length - 2)) + 1;
      const hi = Math.max(
        lo + 1,
        Math.floor(Math.pow((b + 1) / BINS, 2.2) * (mags.length - 2)) + 1,
      );
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += mags[i]!;
      const v = Math.min(1, (sum / (hi - lo)) * (30 + b * 2.2));
      prevSpec[b] = prevSpec[b]! * 0.6 + v * 0.4;
      res.spectrum[f * BINS + b] = prevSpec[b]!;
    }

    // downsampled waveform
    const step = Math.max(1, Math.floor(FFT_SIZE / WAVE));
    for (let w = 0; w < WAVE; w++) {
      const idx = start + w * step;
      res.waveform[f * WAVE + w] =
        idx >= 0 && idx < length ? Math.max(-1, Math.min(1, mono[idx]!)) : 0;
    }

    if (onProgress && f % 200 === 0) {
      onProgress(f / frames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(1);
  return res;
}

const scratch: AudioFrame = {
  rms: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  spectrum: new Float32Array(BINS),
  waveform: new Float32Array(WAVE),
  levelLeft: 0,
  levelRight: 0,
  peakLeft: 0,
  peakRight: 0,
};

export function frameAt(analysis: AudioAnalysis | null, time: number): AudioFrame {
  if (!analysis) {
    scratch.rms = scratch.bass = scratch.mid = scratch.treble = 0;
    scratch.spectrum.fill(0);
    scratch.waveform.fill(0);
    scratch.levelLeft = scratch.levelRight = 0;
    scratch.peakLeft = scratch.peakRight = 0;
    return scratch;
  }
  const i = Math.max(
    0,
    Math.min(analysis.frames - 1, Math.round(time * analysis.fps)),
  );
  scratch.rms = analysis.rms[i]!;
  scratch.bass = analysis.bass[i]!;
  scratch.mid = analysis.mid[i]!;
  scratch.treble = analysis.treble[i]!;
  scratch.spectrum.set(analysis.spectrum.subarray(i * BINS, i * BINS + BINS));
  scratch.waveform.set(analysis.waveform.subarray(i * WAVE, i * WAVE + WAVE));
  scratch.levelLeft = analysis.levelLeft[i]!;
  scratch.levelRight = analysis.levelRight[i]!;
  scratch.peakLeft = analysis.peakLeft[i]!;
  scratch.peakRight = analysis.peakRight[i]!;
  return scratch;
}
