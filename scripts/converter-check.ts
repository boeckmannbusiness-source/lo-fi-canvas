/**
 * Focused checks for the "existing video → TikTok-compatible MP4" converter.
 *
 * The pipeline itself is browser-only, so this harness covers the parts that
 * are pure and easy to regress:
 *   - MP4 box inspection (codecs, dimensions, fps, audio params, fast start)
 *   - the compatibility decision / planned actions for every target case
 *   - H.264 level selection for the real output resolution
 *   - the deterministic A/V timeline (frame + audio sample planning)
 *   - output filename derivation
 *
 * Run with Bun:
 *   bun scripts/converter-check.ts
 */
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import {
  assessCompatibility,
  avcCodecStrings,
  avcLevelFor,
  deriveOutputName,
  plannedAudioSampleCount,
  plannedFrameCount,
  plannedFrameTimestamp,
} from "../src/lib/viz/compat.ts";
import { inspectMedia } from "../src/lib/viz/mp4-inspect.ts";

/* ── Minimal but structurally valid MP4 fixture builder ──────────────────── */

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

function zeros(n: number): Uint8Array {
  return new Uint8Array(n);
}

function setU32(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer).setUint32(offset, value >>> 0);
}

function setU16(target: Uint8Array, offset: number, value: number): void {
  new DataView(target.buffer).setUint16(offset, value);
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const payload = concat(parts);
  const out = new Uint8Array(8 + payload.length);
  setU32(out, 0, out.length);
  out.set(ascii(type), 4);
  out.set(payload, 8);
  return out;
}

/** `mvhd` / `mdhd` share the Version-0 layout used by the inspector. */
function timingBox(type: "mvhd" | "mdhd", timescale: number, duration: number): Uint8Array {
  const payload = zeros(20);
  setU32(payload, 12, timescale);
  setU32(payload, 16, duration);
  return box(type, payload);
}

function hdlr(handler: string): Uint8Array {
  const payload = zeros(12);
  payload.set(ascii(handler), 8);
  return box("hdlr", payload);
}

function stts(count: number, delta: number): Uint8Array {
  const payload = zeros(16);
  setU32(payload, 4, 1);
  setU32(payload, 8, count);
  setU32(payload, 12, delta);
  return box("stts", payload);
}

function stsd(entry: Uint8Array): Uint8Array {
  const payload = zeros(8);
  setU32(payload, 4, 1);
  return box("stsd", payload, entry);
}

function visualEntry(
  fourcc: string,
  width: number,
  height: number,
  avcProfile?: number,
): Uint8Array {
  const payload = zeros(78);
  setU16(payload, 24, width);
  setU16(payload, 26, height);
  const children =
    avcProfile === undefined
      ? []
      : [box("avcC", concat([Uint8Array.of(1, avcProfile, 0, 40), zeros(4)]))];
  return box(fourcc, payload, ...children);
}

function audioEntry(fourcc: string, channels: number, sampleRate: number): Uint8Array {
  const payload = zeros(28);
  setU16(payload, 16, channels);
  setU16(payload, 18, 16);
  setU32(payload, 24, Math.round(sampleRate * 65_536));
  return box(fourcc, payload);
}

interface TrackSpec {
  kind: "video" | "audio";
  fourcc: string;
  width?: number;
  height?: number;
  avcProfile?: number;
  channels?: number;
  sampleRate?: number;
  timescale: number;
  count: number;
  delta: number;
}

function track(spec: TrackSpec): Uint8Array {
  const entry =
    spec.kind === "video"
      ? visualEntry(spec.fourcc, spec.width ?? 0, spec.height ?? 0, spec.avcProfile)
      : audioEntry(spec.fourcc, spec.channels ?? 0, spec.sampleRate ?? 0);
  const stbl = box("stbl", stsd(entry), stts(spec.count, spec.delta));
  const mdia = box(
    "mdia",
    timingBox("mdhd", spec.timescale, spec.count * spec.delta),
    hdlr(spec.kind === "video" ? "vide" : "soun"),
    box("minf", stbl),
  );
  return box("trak", mdia);
}

interface Mp4Spec {
  fastStart: boolean;
  movieTimescale?: number;
  movieDuration?: number;
  tracks: TrackSpec[];
}

function buildMp4(spec: Mp4Spec): Uint8Array {
  const ftyp = box("ftyp", ascii("isom"), zeros(4), ascii("isomiso2avc1mp41"));
  const moov = box(
    "moov",
    timingBox("mvhd", spec.movieTimescale ?? 1000, spec.movieDuration ?? 30_000),
    ...spec.tracks.map(track),
  );
  const mdat = box("mdat", zeros(64));
  return spec.fastStart ? concat([ftyp, moov, mdat]) : concat([ftyp, mdat, moov]);
}

const VIDEO_1080x1920: TrackSpec = {
  kind: "video",
  fourcc: "avc1",
  width: 1080,
  height: 1920,
  avcProfile: 0x64,
  timescale: 30_000,
  count: 900,
  delta: 1000, // 900 frames over 30s => 30 fps
};

function audioAac(channels = 2, sampleRate = 48_000): TrackSpec {
  return {
    kind: "audio",
    fourcc: "mp4a",
    channels,
    sampleRate,
    timescale: sampleRate,
    count: sampleRate * 30,
    delta: 1,
  };
}

function audioOpus(): TrackSpec {
  return {
    kind: "audio",
    fourcc: "Opus",
    channels: 2,
    sampleRate: 48_000,
    timescale: 48_000,
    count: 48_000 * 30,
    delta: 1,
  };
}

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}\n       ${(error as Error).message}`);
  }
}

console.log("\ninspector");

check("reads H.264 video, Opus audio, dimensions, fps and fast start", () => {
  const info = inspectMedia(buildMp4({ fastStart: true, tracks: [VIDEO_1080x1920, audioOpus()] }));
  strictEqual(info.container, "mp4");
  strictEqual(info.fastStart, true);
  strictEqual(info.video?.codec, "h264");
  strictEqual(info.video?.fourcc, "avc1");
  strictEqual(info.video?.width, 1080);
  strictEqual(info.video?.height, 1920);
  strictEqual(info.video?.fps, 30);
  strictEqual(info.video?.bitDepth, 8);
  strictEqual(info.audio?.codec, "opus");
  strictEqual(info.audio?.sampleRate, 48_000);
  strictEqual(info.audio?.channels, 2);
  strictEqual(info.durationSeconds, 30);
});

check("detects a missing fast start (moov after mdat)", () => {
  const info = inspectMedia(
    buildMp4({
      fastStart: false,
      tracks: [VIDEO_1080x1920, audioAac()],
    }),
  );
  strictEqual(info.container, "mp4");
  strictEqual(info.fastStart, false);
  strictEqual(info.video?.codec, "h264");
});

check("detects 10-bit H.264 from the avcC profile", () => {
  const info = inspectMedia(
    buildMp4({
      fastStart: true,
      tracks: [{ ...VIDEO_1080x1920, avcProfile: 110 }, audioAac()],
    }),
  );
  strictEqual(info.video?.bitDepth, 10);
});

check("detects WebM by its EBML magic without throwing", () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
  const info = inspectMedia(webm);
  strictEqual(info.container, "webm");
  strictEqual(info.video, null);
});

check("malformed / truncated input never throws", () => {
  strictEqual(inspectMedia(new Uint8Array(0)).container, "unknown");
  strictEqual(inspectMedia(new Uint8Array([1, 2, 3])).container, "unknown");
  const bad = new Uint8Array(16);
  setU32(bad, 0, 999_999);
  bad.set(ascii("moov"), 4);
  strictEqual(inspectMedia(bad).container, "unknown");
});

console.log("\ncompatibility decisions");

check("Case 1: H.264 + Opus MP4 is converted, audio to AAC", () => {
  const report = assessCompatibility(
    inspectMedia(buildMp4({ fastStart: true, tracks: [VIDEO_1080x1920, audioOpus()] })),
  );
  strictEqual(report.compatible, false);
  strictEqual(report.actions.video, "encode");
  strictEqual(report.actions.audio, "encode");
  ok(
    report.reasons.some((r) => /Opus/.test(r)),
    `expected an Opus reason, got: ${report.reasons.join("; ")}`,
  );
  ok(report.videoNote !== null, "explains why an H.264 source is re-encoded");
  ok(/H\.264/.test(report.summary));
});

check("Case 2: VP9 + Opus re-encodes both tracks", () => {
  const vp9: TrackSpec = { ...VIDEO_1080x1920, fourcc: "vp09" };
  const report = assessCompatibility(
    inspectMedia(buildMp4({ fastStart: true, tracks: [vp9, audioOpus()] })),
  );
  strictEqual(report.compatible, false);
  strictEqual(report.actions.video, "encode");
  strictEqual(report.actions.audio, "encode");
  ok(report.reasons.some((r) => /VP9/.test(r)));
});

check("Case 3: H.264 + AAC 48 kHz stereo is already compatible", () => {
  const info = inspectMedia(buildMp4({ fastStart: true, tracks: [VIDEO_1080x1920, audioAac()] }));
  const report = assessCompatibility(info);
  strictEqual(info.audio?.codec, "aac");
  strictEqual(report.compatible, true);
  strictEqual(report.actions.video, "keep");
  strictEqual(report.actions.audio, "keep");
  strictEqual(report.reasons.length, 0);
});

check("an already-compatible codec without fast start still converts", () => {
  const info = inspectMedia(buildMp4({ fastStart: false, tracks: [VIDEO_1080x1920, audioAac()] }));
  const report = assessCompatibility(info);
  strictEqual(report.compatible, false);
  ok(report.reasons.some((r) => /fast start/i.test(r)));
});

check("AAC at 44.1 kHz is resampled even though the codec is right", () => {
  const report = assessCompatibility(
    inspectMedia(buildMp4({ fastStart: true, tracks: [VIDEO_1080x1920, audioAac(2, 44_100)] })),
  );
  strictEqual(report.compatible, false);
  strictEqual(report.actions.audio, "encode");
  ok(report.reasons.some((r) => /44100/.test(r)));
});

check("6-channel audio is downmixed to stereo", () => {
  const report = assessCompatibility(
    inspectMedia(buildMp4({ fastStart: true, tracks: [VIDEO_1080x1920, audioAac(6, 48_000)] })),
  );
  strictEqual(report.compatible, false);
  ok(report.reasons.some((r) => /6 channels/.test(r)));
});

check("10-bit H.264 is re-encoded to 8-bit 4:2:0", () => {
  const report = assessCompatibility(
    inspectMedia(
      buildMp4({
        fastStart: true,
        tracks: [{ ...VIDEO_1080x1920, avcProfile: 110 }, audioAac()],
      }),
    ),
  );
  strictEqual(report.compatible, false);
  strictEqual(report.actions.video, "encode");
  ok(report.reasons.some((r) => /10-bit/.test(r)));
});

check("WebM always converts", () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
  const report = assessCompatibility(inspectMedia(webm));
  strictEqual(report.compatible, false);
  ok(report.reasons.some((r) => /WebM/.test(r)));
});

check("WebM decodes-audio hints replace the parser's missing audio track", () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
  const report = assessCompatibility(inspectMedia(webm), {
    hasAudio: true,
    audioSampleRate: 48_000,
    audioChannels: 2,
  });
  strictEqual(report.compatible, false);
  strictEqual(report.actions.video, "encode");
  strictEqual(report.actions.audio, "encode");
  ok(report.reasons.some((r) => /WebM video/.test(r)));
  ok(report.reasons.some((r) => /not AAC/.test(r)));
  ok(!/No audio/.test(report.summary), report.summary);
});

console.log("\nH.264 level / codec strings");

check("Case 4: 1080x1920 @ 30 fps targets Level 4.0 High", () => {
  strictEqual(avcLevelFor(1080, 1920, 30), 0x28);
  deepStrictEqual(avcCodecStrings(1080, 1920, 30), ["avc1.640028", "avc1.4D4028", "avc1.42E028"]);
});

check("levels match the real frame size and rate", () => {
  strictEqual(avcLevelFor(640, 360, 30), 0x1e); // 3.0
  strictEqual(avcLevelFor(1920, 1080, 30), 0x28); // 4.0
  strictEqual(avcLevelFor(1920, 1080, 60), 0x2a); // 4.2
  strictEqual(avcLevelFor(3840, 2160, 30), 0x33); // 5.1
  strictEqual(avcLevelFor(3840, 2160, 60), 0x34); // 5.2
});

check("codec strings keep High first then more compatible profiles", () => {
  const strings = avcCodecStrings(3840, 2160, 30);
  strictEqual(strings[0], "avc1.640033");
  strictEqual(strings[1], "avc1.4D4033");
  strictEqual(strings[2], "avc1.42E033");
});

console.log("\nA/V timeline (Case 5)");

check("30s @ 30 fps plans 900 frames starting at t=0", () => {
  strictEqual(plannedFrameCount(30, 30), 900);
  strictEqual(plannedFrameTimestamp(0, 30), 0);
  strictEqual(plannedFrameTimestamp(1, 30), 33_333);
  const last = plannedFrameTimestamp(899, 30);
  strictEqual(last, Math.round((899 * 1_000_000) / 30));
  ok(last < 30 * 1_000_000, "last frame starts before the end of the video");
});

check("timestamps are strictly increasing", () => {
  let previous = -1;
  for (let i = 0; i < 300; i++) {
    const ts = plannedFrameTimestamp(i, 30);
    ok(ts > previous, `frame ${i} timestamp went backwards`);
    previous = ts;
  }
});

check("audio length matches the video duration at 48 kHz", () => {
  strictEqual(plannedAudioSampleCount(30, 48_000), 1_440_000);
  strictEqual(plannedAudioSampleCount(2.5, 48_000), 120_000);
  strictEqual(plannedAudioSampleCount(0, 48_000), 0);
});

check("degenerate inputs never plan zero frames or negative samples", () => {
  strictEqual(plannedFrameCount(0, 30), 1);
  strictEqual(plannedFrameCount(30, 0), 1);
  strictEqual(plannedAudioSampleCount(-1, 48_000), 0);
});

console.log("\noutput naming");

check("derives a unique -tiktok.mp4 filename", () => {
  strictEqual(deriveOutputName("my-video.mp4"), "my-video-tiktok.mp4");
  strictEqual(deriveOutputName("my video.mov"), "my video-tiktok.mp4");
  strictEqual(deriveOutputName("clip.MP4"), "clip-tiktok.mp4");
  strictEqual(deriveOutputName("noext"), "noext-tiktok.mp4");
  strictEqual(deriveOutputName(""), "video-tiktok.mp4");
  strictEqual(deriveOutputName("   "), "video-tiktok.mp4");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
