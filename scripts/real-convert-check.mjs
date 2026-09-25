/**
 * Headless end-to-end check for the existing-video → TikTok converter.
 *
 * Boots a minimal Vite dev server, opens the harness page in headless Chrome,
 * lets it build real source fixtures (H.264+Opus MP4, H.264+AAC MP4, VP9+Opus
 * WebM), convert the incompatible ones, and write every file to disk. The
 * runner then validates the outputs with ffprobe + a full ffmpeg decode and
 * scans the MP4 box order for fast start.
 *
 * Run with Node:
 *   node scripts/real-convert-check.mjs
 */
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer as createViteServer } from "vite";

const root = process.cwd();
const outDir = process.env.OUT_DIR || mkdtempSync(path.join(tmpdir(), "btt-convert-"));
mkdirSync(outDir, { recursive: true });

const ffmpegDir = path.join(
  process.env.LOCALAPPDATA || path.join(tmpdir()),
  "Temp",
  "opencode",
  "ffmpeg",
  "ffmpeg-9.0.2-essentials_build",
  "bin",
);
const ffprobePath = process.env.FFPROBE || path.join(ffmpegDir, "ffprobe.exe");
const ffmpegPath = process.env.FFMPEG || path.join(ffmpegDir, "ffmpeg.exe");

const chromeCandidates = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);
const chromePath = chromeCandidates.find((p) => p && existsSync(p));
if (!chromePath) throw new Error("No Chrome/Edge binary found");

let resolveDone;
let rejectDone;
const done = new Promise((resolve, reject) => {
  resolveDone = resolve;
  rejectDone = reject;
});

let meta = null;
const uploaded = [];

const vite = await createViteServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "spa",
});

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/boot" && req.method === "POST") {
      console.log("BOOT " + body.toString("utf8"));
      res.writeHead(200);
      res.end("ok");
    } else if (url.pathname === "/log" && req.method === "POST") {
      console.log("LOG  " + body.toString("utf8"));
      res.writeHead(200);
      res.end("ok");
    } else if (url.pathname === "/upload" && req.method === "POST") {
      const name = url.searchParams.get("name") || `upload-${uploaded.length}.bin`;
      const file = path.join(outDir, path.basename(name));
      writeFileSync(file, body);
      uploaded.push(file);
      console.log("SAVED " + file + " (" + body.length + " bytes)");
      res.writeHead(200);
      res.end("ok");
    } else if (url.pathname === "/done" && req.method === "POST") {
      meta = JSON.parse(body.toString("utf8") || "{}");
      res.writeHead(200);
      res.end("ok");
      resolveDone();
    } else if (url.pathname === "/error" && req.method === "POST") {
      res.writeHead(200);
      res.end("ok");
      rejectDone(new Error(body.toString("utf8")));
    } else {
      vite.middlewares(req, res);
    }
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/scripts/real-convert/index.html`;

const userDataDir = mkdtempSync(path.join(tmpdir(), "btt-chrome-"));
const headless = process.env.HEADLESS !== "0";
const chrome = spawn(
  chromePath,
  [
    ...(headless ? ["--headless=new"] : []),
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${userDataDir}`,
    url,
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let chromeErr = "";
chrome.stderr?.on("data", (d) => {
  chromeErr += d.toString();
});

const timeout = setTimeout(
  () => rejectDone(new Error("timed out waiting for conversion")),
  Number(process.env.CONVERT_TIMEOUT ?? 240_000),
);

/* ── ffprobe / ffmpeg helpers ────────────────────────────────────────────── */

function ffprobe(file) {
  const result = spawnSync(
    ffprobePath,
    ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffprobe failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function ffmpegDecode(file) {
  const result = spawnSync(ffmpegPath, ["-v", "error", "-i", file, "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return { status: result.status, stderr: (result.stderr || "").trim() };
}

/** Top-level MP4 box order, to prove moov precedes mdat. */
function boxOrder(file) {
  const buffer = readFileSync(file);
  const order = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (size === 1) {
      if (offset + 16 > buffer.length) break;
      size = buffer.readUInt32BE(offset + 8) * 2 ** 32 + buffer.readUInt32BE(offset + 12);
    } else if (size === 0) {
      size = buffer.length - offset;
    }
    if (size < 8 || offset + size > buffer.length) break;
    order.push(type);
    offset += size;
  }
  return order;
}

function streamInfo(probe, kind) {
  return probe.streams.find((s) => s.codec_type === kind) || null;
}

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}

function approx(value, target, tolerance) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n - target) <= tolerance;
}

/* ── Report ──────────────────────────────────────────────────────────────── */

function reportOutput(label, file) {
  console.log(`\n${label}`);
  if (!existsSync(file)) {
    check(`${label}: output exists`, false, `missing ${file}`);
    return;
  }
  const probe = ffprobe(file);
  const video = streamInfo(probe, "video");
  const audio = streamInfo(probe, "audio");
  const order = boxOrder(file);

  console.log(
    "  ffprobe: " +
      JSON.stringify({
        format: probe.format?.format_name,
        video: video && {
          codec: video.codec_name,
          profile: video.profile,
          width: video.width,
          height: video.height,
          pix_fmt: video.pix_fmt,
          color_range: video.color_range,
          avg_frame_rate: video.avg_frame_rate,
          codec_tag: video.codec_tag_string,
          start_time: video.start_time,
          duration: video.duration,
        },
        audio: audio && {
          codec: audio.codec_name,
          profile: audio.profile,
          sample_rate: audio.sample_rate,
          channels: audio.channels,
          codec_tag: audio.codec_tag_string,
          start_time: audio.start_time,
          duration: audio.duration,
        },
      }),
  );
  console.log(`  box order: ${order.join(" → ")}`);

  check(`${label}: MP4 container`, /mp4/.test(probe.format?.format_name ?? ""), probe.format?.format_name);
  check(`${label}: H.264 video`, video?.codec_name === "h264", video?.codec_name);
  check(
    `${label}: 1080×1920`,
    video?.width === 1080 && video?.height === 1920,
    `${video?.width}×${video?.height}`,
  );
  // Both the working visualizer export and this converter emit full-range
  // 4:2:0 8-bit from a canvas VideoFrame, which ffprobe labels `yuvj420p`.
  check(
    `${label}: 4:2:0 8-bit`,
    video?.pix_fmt === "yuv420p" || video?.pix_fmt === "yuvj420p",
    `${video?.pix_fmt} (range ${video?.color_range})`,
  );
  check(`${label}: avc1 codec tag`, video?.codec_tag_string === "avc1", video?.codec_tag_string);
  check(
    `${label}: High/Main/Baseline profile`,
    /High|Main|Baseline/i.test(video?.profile ?? ""),
    video?.profile,
  );
  check(`${label}: AAC audio`, audio?.codec_name === "aac", audio?.codec_name);
  check(`${label}: AAC-LC`, /LC/i.test(audio?.profile ?? ""), audio?.profile);
  check(`${label}: 48 kHz audio`, Number(audio?.sample_rate) === 48_000, audio?.sample_rate);
  check(`${label}: stereo audio`, Number(audio?.channels) === 2, String(audio?.channels));
  check(`${label}: mp4a codec tag`, audio?.codec_tag_string === "mp4a", audio?.codec_tag_string);
  check(
    `${label}: moov before mdat (fast start)`,
    order.indexOf("moov") !== -1 &&
      order.indexOf("mdat") !== -1 &&
      order.indexOf("moov") < order.indexOf("mdat"),
    order.join(" → "),
  );
  check(
    `${label}: A/V start times align at 0`,
    approx(video?.start_time ?? 0, 0, 0.1) && approx(audio?.start_time ?? 0, 0, 0.1),
    `video=${video?.start_time} audio=${audio?.start_time}`,
  );
  check(
    `${label}: A/V durations align`,
    Math.abs(Number(video?.duration ?? 0) - Number(audio?.duration ?? 0)) < 0.15,
    `video=${video?.duration} audio=${audio?.duration}`,
  );

  const decode = ffmpegDecode(file);
  check(
    `${label}: ffmpeg full decode without errors`,
    decode.status === 0 && decode.stderr === "",
    `status=${decode.status} stderr=${decode.stderr.slice(0, 400)}`,
  );
}

try {
  await done;
  console.log("\n=== harness metadata ===");
  console.log(JSON.stringify(meta, null, 2));

  console.log("\n=== analysis / conversion decisions ===");
  check(
    "Case 1 source (H.264 + Opus) is detected as incompatible",
    meta.analysisA?.compatible === false,
    JSON.stringify(meta.analysisA),
  );
  check(
    "Case 1 source video codec is h264, audio is not AAC",
    meta.analysisA?.videoCodec === "h264" && meta.analysisA?.hasAudio === true,
    JSON.stringify(meta.analysisA),
  );
  check(
    "Case 2 source (VP9 + Opus) is detected and has both tracks",
    meta.analysisB?.compatible === false && meta.analysisB?.container === "webm",
    JSON.stringify(meta.analysisB),
  );
  check(
    "Case 2 source plans a video and audio re-encode",
    meta.analysisB?.actions?.video === "encode" &&
      meta.analysisB?.actions?.audio === "encode" &&
      !/No audio/.test(meta.analysisB?.summary ?? ""),
    JSON.stringify(meta.analysisB),
  );
  check(
    "Case 3 source (H.264 + AAC) is already compatible",
    meta.analysisC?.compatible === true,
    JSON.stringify(meta.analysisC),
  );
  check(
    "Case 4 conversion keeps 1080×1920 @ 30 fps",
    meta.convertA?.width === 1080 &&
      meta.convertA?.height === 1920 &&
      meta.convertA?.fps === 30 &&
      meta.convertA?.scaled === false,
    JSON.stringify(meta.convertA),
  );
  check(
    "Case 5 output decode-checks in the browser",
    meta.convertA?.decode?.seeked === true &&
      meta.convertB?.decode?.seeked === true &&
      meta.convertA?.decode?.width === 1080,
    JSON.stringify({ a: meta.convertA?.decode, b: meta.convertB?.decode }),
  );
  check(
    "outputs use H.264 and have audio",
    meta.convertA?.videoCodec?.startsWith("avc1") &&
      meta.convertA?.hasAudio === true &&
      meta.convertB?.hasAudio === true,
    JSON.stringify({ a: meta.convertA, b: meta.convertB }),
  );

  reportOutput("Case 1 output (H.264 + Opus → compatible MP4)", path.join(outDir, "my-old-video-tiktok.mp4"));
  reportOutput("Case 2 output (VP9 + Opus → compatible MP4)", path.join(outDir, "my-vp9-video-tiktok.mp4"));

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`OUT_DIR ${outDir}`);
} catch (error) {
  console.error("CONVERT_FAILED", error.message);
  if (chromeErr) console.error(chromeErr.split("\n").slice(-20).join("\n"));
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  chrome.kill();
  server.close();
  await vite.close();
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  if (failed > 0) process.exitCode = 1;
}
