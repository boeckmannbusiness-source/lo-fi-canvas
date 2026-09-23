/**
 * Headless render smoke test for the BERLIN B TAPES identity systems.
 *
 * Runs the *real* `renderScene` pipeline against a stub canvas context and
 * verifies:
 *   - the normal scene, the frame and the CTA all render without throwing, in
 *     landscape and portrait
 *   - rendering the same frame twice produces an identical canvas op sequence
 *     (preview === export, no hidden state)
 *   - a disabled CTA is byte-identical to the plain normal scene
 *   - a fixed 1920×1080 fixture is locked to a known op count + hash, so an
 *     unintended landscape composition change fails the suite
 *
 * Run with Bun (resolves the app's extensionless TS imports):
 *   bun scripts/render-smoke.ts
 */
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { layers, renderNormalScene, renderScene } from "../src/lib/viz/scene";
import { SAFE_AREAS } from "../src/lib/viz/format";
import { defaultSettings, type RenderContext, type Settings } from "../src/lib/viz/types";

type Call = [string, ...unknown[]];

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

/* ── Minimal 2D context stub ─────────────────────────────────────────────── */

function makeCtx(log: Call[]): RenderContext["ctx"] {
  const gradient = () => ({ addColorStop() {} });
  const ctx = {
    canvas: null,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineJoin: "miter",
    lineCap: "butt",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as Record<string, unknown>;

  const record = (name: string, args: unknown[]) => {
    log.push([name, ...args]);
  };
  const methods = [
    "save",
    "restore",
    "beginPath",
    "closePath",
    "rect",
    "roundRect",
    "fill",
    "clip",
    "stroke",
    "fillRect",
    "strokeRect",
    "clearRect",
    "moveTo",
    "lineTo",
    "arc",
    "arcTo",
    "quadraticCurveTo",
    "bezierCurveTo",
    "translate",
    "rotate",
    "scale",
    "transform",
    "setTransform",
    "resetTransform",
    "drawImage",
    "fillText",
    "strokeText",
    "putImageData",
    "setLineDash",
  ];
  for (const m of methods) ctx[m] = (...args: unknown[]) => record(m, args);
  ctx["createRadialGradient"] = (...a: unknown[]) => {
    record("createRadialGradient", a);
    return gradient();
  };
  ctx["createLinearGradient"] = (...a: unknown[]) => {
    record("createLinearGradient", a);
    return gradient();
  };
  ctx["createPattern"] = (...a: unknown[]) => {
    record("createPattern", a);
    return { setTransform() {} };
  };
  ctx["createImageData"] = (w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  });
  ctx["getImageData"] = (_x: number, _y: number, w: number, h: number) => ({
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
  });
  ctx["measureText"] = (text: string) => ({ width: String(text).length * 8 });
  return ctx as unknown as RenderContext["ctx"];
}

class StubOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return makeCtx([]);
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = StubOffscreenCanvas;

/* ── Harness ─────────────────────────────────────────────────────────────── */

const baseSettings = (): Settings => {
  const s = defaultSettings();
  s.text.enabled = true;
  s.text.title = "MIDNIGHT TAPES";
  s.text.subtitle = "late night in berlin";
  s.text.showSubtitle = true;
  s.visualizer.enabled = true;
  s.visualizer.type = "bars";
  s.tape.enabled = true;
  s.logo.enabled = false;
  s.nowPlaying.title = "Kreuzberg Nights";
  s.nowPlaying.artist = "B Tapes";
  return s;
};

function render(width: number, height: number, time: number, settings: Settings): Call[] {
  const log: Call[] = [];
  const rc: RenderContext = {
    ctx: makeCtx(log),
    width,
    height,
    layout: width >= height ? "landscape" : "portrait",
    safe: SAFE_AREAS[width >= height ? "landscape" : "portrait"],
    time,
    duration: 200,
    audio: {
      rms: 0.4,
      bass: 0.5,
      mid: 0.3,
      treble: 0.2,
      spectrum: new Float32Array(64).fill(0.4),
      waveform: new Float32Array(256).fill(0.1),
      levelLeft: 0.5,
      levelRight: 0.5,
      peakLeft: 0.6,
      peakRight: 0.6,
    },
    settings,
    image: null,
    imageWidth: 0,
    imageHeight: 0,
    logo: null,
    logoWidth: 0,
    logoHeight: 0,
    scale: Math.min(width, height) / 1080,
  };
  renderScene(rc);
  return log;
}

function renderNormal(width: number, height: number, time: number, settings: Settings): Call[] {
  const log: Call[] = [];
  const rc = {
    ctx: makeCtx(log),
    width,
    height,
    layout: width >= height ? "landscape" : "portrait",
    safe: SAFE_AREAS[width >= height ? "landscape" : "portrait"],
    time,
    duration: 200,
    audio: {
      rms: 0.4,
      bass: 0.5,
      mid: 0.3,
      treble: 0.2,
      spectrum: new Float32Array(64).fill(0.4),
      waveform: new Float32Array(256).fill(0.1),
      levelLeft: 0.5,
      levelRight: 0.5,
      peakLeft: 0.6,
      peakRight: 0.6,
    },
    settings,
    image: null,
    imageWidth: 0,
    imageHeight: 0,
    logo: null,
    logoWidth: 0,
    logoHeight: 0,
    scale: Math.min(width, height) / 1080,
  };
  renderNormalScene(rc);
  return log;
}

const drawsText = (log: Call[], text: string) =>
  log.some((c) => c[0] === "fillText" && c[1] === text);

console.log("\nrender smoke");

check("normal scene renders in landscape without throwing", () => {
  const log = render(1920, 1080, 2, baseSettings());
  ok(log.length > 50, `expected many ops, got ${log.length}`);
  ok(
    log.some((c) => c[0] === "fillText"),
    "typography rendered",
  );
});

check("normal scene renders in portrait without throwing", () => {
  const log = render(1080, 1920, 2, baseSettings());
  ok(log.length > 50);
});

check("rendering the same frame twice is identical (preview === export)", () => {
  const a = render(1920, 1080, 11, baseSettings());
  const b = render(1920, 1080, 11, baseSettings());
  deepStrictEqual(a, b);
});

check("disabled CTA is identical to the plain normal scene", () => {
  const s = baseSettings();
  s.cta.enabled = false;
  const viaScene = render(1920, 1080, 11, s);
  const normalOnly = renderNormal(1920, 1080, 11, s);
  deepStrictEqual(viaScene, normalOnly);
});

check("CTA is inactive before its start time", () => {
  const s = baseSettings();
  const log = render(1920, 1080, 4, s);
  ok(!drawsText(log, "S"), "no CTA headline before start");
});

check("active CTA draws the headline", () => {
  const log = render(1920, 1080, 11.5, baseSettings());
  ok(drawsText(log, "L") && drawsText(log, "E"), "LIKE rendered");
  ok(drawsText(log, "S") && drawsText(log, "C"), "SUBSCRIBE rendered");
});

check("CTA renders in portrait without throwing", () => {
  const log = render(1080, 1920, 11.5, baseSettings());
  ok(drawsText(log, "L"));
});

check("CTA composition does not depend on 16:9 pixel positions", () => {
  // The headline is centred on both stages, scaled by the shorter edge.
  const land = render(1920, 1080, 12, baseSettings());
  const port = render(1080, 1920, 12, baseSettings());
  const centreX = (log: Call[]) => {
    const hit = log.find((c) => c[0] === "fillText" && c[1] === "L");
    ok(hit, "headline found");
    return Number(hit[2]);
  };
  ok(Math.abs(centreX(land) - 960) < 1920 * 0.2, "landscape centred");
  ok(Math.abs(centreX(port) - 540) < 1080 * 0.2, "portrait centred");
});

check("frame disabled still renders the scene", () => {
  const s = baseSettings();
  s.frame.enabled = false;
  const log = render(1920, 1080, 2, s);
  ok(log.length > 50);
});

/* ── Landscape regression lock ───────────────────────────────────────────── */

/**
 * A fixed 1920×1080 fixture with every identity system enabled, rendered
 * through the real pipeline against the deterministic stub context. The op
 * count and hash below are a regression lock: any unintended change to the
 * landscape composition changes them. They are *not* pixel hashes, so they are
 * identical on every machine — the stub never rasterizes.
 */
const LANDSCAPE = { width: 1920, height: 1080, time: 7.25, duration: 180 };
const LANDSCAPE_OPS = 1017;
const LANDSCAPE_HASH = "bbe42c68";

function fixedLandscapeSettings(): Settings {
  const s = baseSettings();
  s.camera = { move: "zoom-in", amount: 0.03, driftX: 0.2, driftY: 0.1 };
  s.background = { fit: "cover", vignette: 0.35, warmth: 0.12 };
  s.cta.enabled = false; // normal-scene baseline
  return s;
}

function renderFixedLandscape(): Call[] {
  const log: Call[] = [];
  renderScene({
    ctx: makeCtx(log),
    width: LANDSCAPE.width,
    height: LANDSCAPE.height,
    layout: "landscape",
    safe: SAFE_AREAS.landscape,
    time: LANDSCAPE.time,
    duration: LANDSCAPE.duration,
    audio: {
      rms: 0.4,
      bass: 0.5,
      mid: 0.3,
      treble: 0.2,
      spectrum: new Float32Array(64).fill(0.4),
      waveform: new Float32Array(256).fill(0.1),
      levelLeft: 0.5,
      levelRight: 0.5,
      peakLeft: 0.6,
      peakRight: 0.6,
    },
    settings: fixedLandscapeSettings(),
    image: { width: 1400, height: 1400 } as unknown as CanvasImageSource,
    imageWidth: 1400,
    imageHeight: 1400,
    logo: null,
    logoWidth: 0,
    logoHeight: 0,
    scale: Math.min(LANDSCAPE.width, LANDSCAPE.height) / 1080,
  });
  return log;
}

/** FNV-1a over the serialized op sequence — stable, compact, cross-platform. */
function hashOps(log: Call[]): string {
  const serialized = JSON.stringify(log);
  let h = 2166136261;
  for (let i = 0; i < serialized.length; i++) {
    h ^= serialized.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

console.log("\nlandscape regression");

check("fixed landscape fixture renders deterministically", () => {
  deepStrictEqual(renderFixedLandscape(), renderFixedLandscape());
});

check("fixed landscape op sequence is locked", () => {
  const log = renderFixedLandscape();
  strictEqual(log.length, LANDSCAPE_OPS, `op count drifted (hash ${hashOps(log)})`);
  strictEqual(hashOps(log), LANDSCAPE_HASH);
});

check("layer order is the canonical identity order", () => {
  strictEqual(
    layers.map((l) => l.name).join(","),
    [
      "drawBackground",
      "drawVinyl",
      "drawTape",
      "drawRain",
      "drawDust",
      "drawFlicker",
      "drawVisualizer",
      "drawText",
      "drawNowPlaying",
      "drawLogo",
      "drawFrame",
      "drawGrain",
    ].join(","),
  );
});

check("identity layers render in the normal scene", () => {
  const log = renderFixedLandscape();
  ok(
    log.some((c) => c[0] === "fill" && c[1] === "evenodd"),
    "frame print band rendered",
  );
  ok(
    log.some((c) => c[0] === "strokeRect"),
    "frame hairline rendered",
  );
  ok(drawsText(log, "P"), "now playing label rendered");
});

check("landscape never applies the portrait background bias", () => {
  const log = renderFixedLandscape();
  const draw = log.find((c) => c[0] === "drawImage");
  ok(draw, "background image drawn");
  const cam = fixedLandscapeSettings().camera;
  const driftX = Math.sin(LANDSCAPE.time * 0.012) * cam.driftX * 0.01 * LANDSCAPE.width;
  const driftY = Math.cos(LANDSCAPE.time * 0.009) * cam.driftY * 0.01 * LANDSCAPE.height;
  const dx = Number(draw[2]);
  const dy = Number(draw[3]);
  const dw = Number(draw[4]);
  const dh = Number(draw[5]);
  ok(
    Math.abs(dx - ((LANDSCAPE.width - dw) / 2 + driftX)) < 1e-9,
    "x is centred with drift only",
  );
  ok(
    Math.abs(dy - ((LANDSCAPE.height - dh) / 2 + driftY)) < 1e-9,
    "y has no portrait bias",
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
