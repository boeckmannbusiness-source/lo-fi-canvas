/**
 * Dependency-free container inspector for the "Existing Video → TikTok" flow.
 *
 * It never decodes media: it walks the ISO-BMFF (MP4) box tree enough to report
 * the container, the video/audio codecs, dimensions, average frame rate, audio
 * sample rate / channels, the movie duration and whether the file is
 * "fast start" (`moov` before `mdat`). WebM is detected by its EBML magic but
 * not parsed further — the video element supplies the real metadata there.
 *
 * Everything here is pure and synchronous so it can be unit-tested headlessly
 * and reused by the converter without pulling in a WASM/JS demuxer.
 */

export type ContainerKind = "mp4" | "webm" | "unknown";
export type VideoCodec = "h264" | "hevc" | "vp9" | "av1" | "mpeg4" | "unknown";
export type AudioCodec = "aac" | "opus" | "mp3" | "ac3" | "eac3" | "flac" | "pcm" | "unknown";

export interface VideoTrackInfo {
  codec: VideoCodec;
  /** Raw sample-entry fourcc, e.g. `avc1`, `vp09`. */
  fourcc: string;
  width: number;
  height: number;
  /** Average frame rate derived from the sample table, or null. */
  fps: number | null;
  /** 8 or 10 for codecs where it can be derived, otherwise null. */
  bitDepth: 8 | 10 | null;
}

export interface AudioTrackInfo {
  codec: AudioCodec;
  /** Raw sample-entry fourcc, e.g. `mp4a`, `Opus`. */
  fourcc: string;
  sampleRate: number | null;
  channels: number | null;
}

export interface MediaInfo {
  container: ContainerKind;
  /** `moov` before `mdat`; false for MP4s without fast start, true otherwise. */
  fastStart: boolean;
  video: VideoTrackInfo | null;
  audio: AudioTrackInfo | null;
  durationSeconds: number | null;
  byteLength: number;
}

const VIDEO_FOURCC: Record<string, VideoCodec> = {
  avc1: "h264",
  avc3: "h264",
  hvc1: "hevc",
  hev1: "hevc",
  vp09: "vp9",
  av01: "av1",
  mp4v: "mpeg4",
};

const AUDIO_FOURCC: Record<string, AudioCodec> = {
  mp4a: "aac",
  Opus: "opus",
  opus: "opus",
  ".mp3": "mp3",
  mp3: "mp3",
  "ac-3": "ac3",
  "ec-3": "eac3",
  alac: "flac",
};

/** Fourccs that identify a video `stsd` sample entry. */
const VIDEO_ENTRIES = new Set(Object.keys(VIDEO_FOURCC));
/** Fourccs that identify an audio `stsd` sample entry. */
const AUDIO_ENTRIES = new Set(Object.keys(AUDIO_FOURCC));

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

function isWebm(bytes: Uint8Array): boolean {
  return EBML_MAGIC.every((b, i) => bytes[i] === b);
}

function readType(view: DataView, offset: number): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

interface Box {
  type: string;
  start: number;
  /** Exclusive end of the box. */
  end: number;
  /** First byte after the size + type header. */
  bodyStart: number;
}

/**
 * Iterate the boxes that are direct children of `[start, end)`. Malformed or
 * truncated boxes stop iteration instead of throwing, so a partial file never
 * takes down the caller.
 */
function* childBoxes(view: DataView, start: number, end: number): Generator<Box> {
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = readType(view, offset + 4);
    let bodyStart = offset + 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      const hi = view.getUint32(offset + 8);
      const lo = view.getUint32(offset + 12);
      size = hi * 2 ** 32 + lo;
      bodyStart = offset + 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < 8 || offset + size > end) return;
    yield { type, start: offset, end: offset + size, bodyStart };
    offset += size;
  }
}

function firstChild(view: DataView, parent: Box, type: string): Box | null {
  for (const box of childBoxes(view, parent.bodyStart, parent.end)) {
    if (box.type === type) return box;
  }
  return null;
}

/** Parse an `mvhd`/`mdhd` header into a timescale + duration pair. */
function readTimescaleDuration(
  view: DataView,
  box: Box,
): { timescale: number; duration: number } | null {
  const v = view.getUint8(box.bodyStart);
  if (v === 1) {
    if (box.bodyStart + 32 > box.end) return null;
    const timescale = view.getUint32(box.bodyStart + 20);
    const duration =
      view.getUint32(box.bodyStart + 24) * 2 ** 32 + view.getUint32(box.bodyStart + 28);
    return { timescale, duration };
  }
  if (box.bodyStart + 20 > box.end) return null;
  return {
    timescale: view.getUint32(box.bodyStart + 12),
    duration: view.getUint32(box.bodyStart + 16),
  };
}

/** Read the `stsd` sample entry that follows the version/flags + entry count. */
function readSampleEntry(view: DataView, stsd: Box): Box | null {
  const body = stsd.bodyStart + 8; // version/flags (4) + entry_count (4)
  if (body + 8 > stsd.end) return null;
  for (const entry of childBoxes(view, body, stsd.end)) return entry;
  return null;
}

/**
 * Visual sample entries embed child boxes (`avcC`, `pasp`, …) after a fixed
 * 78-byte header, but the header size can vary. Scan the entry payload for the
 * fourcc and validate the box header in front of it, which is robust either way.
 */
function scanForBox(view: DataView, parent: Box, type: string): Box | null {
  const end = parent.end;
  for (let offset = parent.bodyStart + 4; offset + 4 <= end; offset++) {
    if (readType(view, offset) !== type) continue;
    const size = view.getUint32(offset - 4);
    const start = offset - 4;
    if (size >= 8 && start + size <= end) {
      return { type, start, end: start + size, bodyStart: offset + 4 };
    }
  }
  return null;
}

function deriveAvcBitDepth(view: DataView, entry: Box): 8 | 10 | null {
  const avcC = scanForBox(view, entry, "avcC");
  if (!avcC || avcC.bodyStart + 2 > avcC.end) return null;
  const profileIdc = view.getUint8(avcC.bodyStart + 1);
  // High 10 / High 4:2:2 / High 4:4:4 profiles carry > 8-bit samples.
  if (profileIdc === 110 || profileIdc === 122 || profileIdc === 244) return 10;
  return 8;
}

function parseVideoTrack(view: DataView, stbl: Box, mediaTimescale: number): VideoTrackInfo | null {
  const stsd = firstChild(view, stbl, "stsd");
  if (!stsd) return null;
  const entry = readSampleEntry(view, stsd);
  if (!entry || !VIDEO_ENTRIES.has(entry.type)) return null;

  const width = view.getUint16(entry.bodyStart + 24);
  const height = view.getUint16(entry.bodyStart + 26);
  return {
    codec: VIDEO_FOURCC[entry.type] ?? "unknown",
    fourcc: entry.type,
    width,
    height,
    fps: averageFps(view, stbl, mediaTimescale),
    bitDepth:
      entry.type === "avc1" || entry.type === "avc3" ? deriveAvcBitDepth(view, entry) : null,
  };
}

function parseAudioTrack(view: DataView, stbl: Box): AudioTrackInfo | null {
  const stsd = firstChild(view, stbl, "stsd");
  if (!stsd) return null;
  const entry = readSampleEntry(view, stsd);
  if (!entry || !AUDIO_ENTRIES.has(entry.type)) return null;

  const channels = view.getUint16(entry.bodyStart + 16);
  const rateFixed = view.getUint32(entry.bodyStart + 24);
  const sampleRate = rateFixed >>> 16 || null;
  return {
    codec: AUDIO_FOURCC[entry.type] ?? "unknown",
    fourcc: entry.type,
    sampleRate,
    channels: channels > 0 ? channels : null,
  };
}

/** Average fps from `stts`: total samples over total presentation time. */
function averageFps(view: DataView, stbl: Box, timescale: number): number | null {
  if (timescale <= 0) return null;
  const stts = firstChild(view, stbl, "stts");
  if (!stts || stts.bodyStart + 8 > stts.end) return null;
  let samples = 0;
  let ticks = 0;
  const entryCount = view.getUint32(stts.bodyStart + 4);
  let offset = stts.bodyStart + 8;
  for (let i = 0; i < entryCount && offset + 8 <= stts.end; i++, offset += 8) {
    const count = view.getUint32(offset);
    const delta = view.getUint32(offset + 4);
    samples += count;
    ticks += count * delta;
  }
  if (samples === 0 || ticks === 0) return null;
  return (samples * timescale) / ticks;
}

function inspectMp4(bytes: Uint8Array, view: DataView): MediaInfo {
  const end = bytes.byteLength;
  let moov: Box | null = null;
  let mdat: Box | null = null;
  let sawMp4Box = false;
  for (const box of childBoxes(view, 0, end)) {
    sawMp4Box = true;
    if (box.type === "moov" && !moov) moov = box;
    if (box.type === "mdat" && !mdat) mdat = box;
  }

  const info: MediaInfo = {
    container: sawMp4Box ? "mp4" : "unknown",
    fastStart: moov !== null && (mdat === null || moov.start < mdat.start),
    video: null,
    audio: null,
    durationSeconds: null,
    byteLength: end,
  };

  if (!moov) return info;

  const mvhd = firstChild(view, moov, "mvhd");
  if (mvhd) {
    const td = readTimescaleDuration(view, mvhd);
    if (td && td.timescale > 0) info.durationSeconds = td.duration / td.timescale;
  }

  for (const trak of childBoxes(view, moov.bodyStart, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = firstChild(view, trak, "mdia");
    if (!mdia) continue;
    const hdlr = firstChild(view, mdia, "hdlr");
    const handler =
      hdlr && hdlr.bodyStart + 12 <= hdlr.end ? readType(view, hdlr.bodyStart + 8) : "";
    const mdhd = firstChild(view, mdia, "mdhd");
    const mediaTimescale = mdhd ? (readTimescaleDuration(view, mdhd)?.timescale ?? 0) : 0;
    const minf = firstChild(view, mdia, "minf");
    const stbl = minf ? firstChild(view, minf, "stbl") : null;
    if (!stbl) continue;

    if (handler === "vide" && !info.video) info.video = parseVideoTrack(view, stbl, mediaTimescale);
    else if (handler === "soun" && !info.audio) info.audio = parseAudioTrack(view, stbl);
  }

  return info;
}

/**
 * Inspect a file's container metadata. `bytes` may be a partial head/tail; the
 * parser simply reports what it can find.
 */
export function inspectMedia(bytes: Uint8Array): MediaInfo {
  const base: MediaInfo = {
    container: "unknown",
    fastStart: false,
    video: null,
    audio: null,
    durationSeconds: null,
    byteLength: bytes.byteLength,
  };
  if (bytes.byteLength < 12) return base;
  if (isWebm(bytes)) return { ...base, container: "webm", fastStart: true };
  try {
    return inspectMp4(bytes, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch {
    return base;
  }
}
