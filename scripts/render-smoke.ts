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
import { CONTENT_SAFE_AREAS } from "../src/lib/viz/format";
import {
  drawFrameVisualizer,
  drawVisualizer,
  frameVisualizerGeometry,
  frameWaveformSamples,
  FRAME_VISUALIZER,
  visualizerBaseline,
  visualizerGeometry,
} from "../src/lib/viz/layers/visualizer";
import { contentRect, frameBands } from "../src/lib/viz/identity";
import { ctaRows } from "../src/lib/viz/layers/cta";
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
    safe: CONTENT_SAFE_AREAS[width >= height ? "landscape" : "portrait"],
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
    safe: CONTENT_SAFE_AREAS[width >= height ? "landscape" : "portrait"],
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
  // The headline is centred on both stages, scaled by the shorter edge. The
  // normal scene now always renders underneath the overlay, so locate the
  // "LIKE" run specifically instead of the first standalone "L".
  const land = render(1920, 1080, 12, baseSettings());
  const port = render(1080, 1920, 12, baseSettings());
  const headlineX = (log: Call[]) => {
    for (let i = 0; i < log.length - 3; i++) {
      if (
        log[i]![0] === "fillText" &&
        log[i]![1] === "L" &&
        log[i + 1]?.[0] === "fillText" &&
        log[i + 1]![1] === "I" &&
        log[i + 2]?.[0] === "fillText" &&
        log[i + 2]![1] === "K" &&
        log[i + 3]?.[0] === "fillText" &&
        log[i + 3]![1] === "E"
      ) {
        return Number(log[i]![2]);
      }
    }
    ok(false, "LIKE headline found");
    return Number.NaN;
  };
  ok(Math.abs(headlineX(land) - 960) < 1920 * 0.2, "landscape centred");
  ok(Math.abs(headlineX(port) - 540) < 1080 * 0.2, "portrait centred");
});

check("CTA composites over the artwork instead of replacing the scene", () => {
  const log = render(1920, 1080, 12, baseSettings());
  ok(
    log.some((c) => c[0] === "fill" && c[1] === "evenodd"),
    "frame print band still rendered behind the overlay",
  );
  ok(
    log.some((c) => c[0] === "strokeRect"),
    "frame hairline still rendered",
  );
  ok(drawsText(log, "P"), "now playing still rendered behind the overlay");
  ok(drawsText(log, "L") && drawsText(log, "S"), "CTA overlay drawn on top");
});

console.log("\ncta overlay rows");

check("LIKE & SUBSCRIBE becomes a thumbs-up row and a bell row", () => {
  const rows = ctaRows({ text: "LIKE & SUBSCRIBE" });
  strictEqual(rows.length, 2);
  strictEqual(rows[0]!.label, "LIKE");
  strictEqual(rows[0]!.icon, "thumb");
  strictEqual(rows[1]!.label, "SUBSCRIBE");
  strictEqual(rows[1]!.icon, "bell");
});

check("a single-word headline stays one thumbs-up row", () => {
  const rows = ctaRows({ text: "FOLLOW" });
  strictEqual(rows.length, 1);
  strictEqual(rows[0]!.label, "FOLLOW");
  strictEqual(rows[0]!.icon, "thumb");
});

check("active CTA draws two icon rows (thumb + bell)", () => {
  const log = render(1920, 1080, 12, baseSettings());
  const icons = log.filter((c) => c[0] === "arc" || c[0] === "quadraticCurveTo");
  ok(icons.length > 0, "icon geometry drawn");
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
  s.background = { fit: "cover", vignette: 0.35, warmth: 0.12, focusY: 0.5 };
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
    safe: CONTENT_SAFE_AREAS.landscape,
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
      "drawFramedBorder",
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
  ok(Math.abs(dx - ((LANDSCAPE.width - dw) / 2 + driftX)) < 1e-9, "x is centred with drift only");
  ok(Math.abs(dy - ((LANDSCAPE.height - dh) / 2 + driftY)) < 1e-9, "y has no portrait bias");
});

console.log("\nportrait typography");

/** Capture the resolved pixel size of the title's font at draw time. */
function titleFontPx(width: number, height: number): number {
  const log: Call[] = [];
  const ctx = makeCtx(log) as unknown as {
    font: string;
    fillText: (t: string, x: number, y: number) => void;
  };
  const fonts: Array<[string, string]> = [];
  const originalFill = ctx.fillText;
  ctx.fillText = (text: string, x: number, y: number) => {
    fonts.push([String(text), String(ctx.font)]);
    originalFill(text, x, y);
  };
  const settings = baseSettings();
  settings.cta.enabled = false;
  renderScene({
    ctx: ctx as unknown as RenderContext["ctx"],
    width,
    height,
    layout: width >= height ? "landscape" : "portrait",
    safe: CONTENT_SAFE_AREAS[width >= height ? "landscape" : "portrait"],
    time: 3,
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
  });
  const hit = fonts.find(([text]) => text === settings.text.title);
  ok(hit, "title rendered");
  const match = /([\d.]+)px/.exec(hit![1]);
  ok(match, "font size resolved");
  return Number(match![1]);
}

check("portrait type keeps the landscape physical size", () => {
  const landscape = titleFontPx(1920, 1080);
  const portrait = titleFontPx(1080, 1920);
  strictEqual(portrait, landscape);
  ok(landscape > 0);
});

check("portrait background focus is explicit and user-controlled", () => {
  const renderFocus = (focusY: number) => {
    const log: Call[] = [];
    const settings = baseSettings();
    settings.cta.enabled = false;
    settings.background = { fit: "cover", vignette: 0.35, warmth: 0.12, focusY };
    renderScene({
      ctx: makeCtx(log),
      width: 1080,
      height: 1920,
      layout: "portrait",
      safe: CONTENT_SAFE_AREAS.portrait,
      time: 0,
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
      image: { width: 1400, height: 1400 } as unknown as CanvasImageSource,
      imageWidth: 1400,
      imageHeight: 1400,
      logo: null,
      logoWidth: 0,
      logoHeight: 0,
      scale: 1,
    });
    const draw = log.find((c) => c[0] === "drawImage");
    ok(draw, "background drawn");
    return Number(draw![3]);
  };
  const top = renderFocus(0);
  const middle = renderFocus(0.5);
  const bottom = renderFocus(1);
  ok(top > bottom, "focus moves the visible crop window");
  ok(Math.abs(middle - (top + bottom) / 2) < 1e-9, "0.5 is the centred crop");
});

console.log("\nvisualizer placement");

function visualizerCtx(width: number, height: number, settings: Settings): RenderContext {
  return {
    ctx: makeCtx([]),
    width,
    height,
    layout: width >= height ? "landscape" : "portrait",
    safe: CONTENT_SAFE_AREAS[width >= height ? "landscape" : "portrait"],
    time: 1,
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
}

check("portrait visualizer clears the frame opening and the safe bottom", () => {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.type = "bars";
  const rc = visualizerCtx(1080, 1920, s);
  const cy = visualizerBaseline(rc);
  const h = Math.min(1080, 1920) * (0.04 + s.visualizer.size * 0.08);
  const safeBottom = 1920 * (1 - CONTENT_SAFE_AREAS.portrait.bottom);
  const content = contentRect(s.frame, 1080, 1920);
  ok(cy + h / 2 <= safeBottom + 1e-9, "above the content-safe bottom");
  ok(cy + h / 2 <= content.y + content.height + 1e-9, "inside the frame opening");
});

check("landscape visualizer baseline is unchanged at 0.88H", () => {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.type = "bars";
  const rc = visualizerCtx(1920, 1080, s);
  strictEqual(visualizerBaseline(rc), 1080 * 0.88);
});

console.log("\nvisualizer colour");

/** Context that records fill/stroke style assignments as canvas ops. */
function styleLogCtx(log: Call[]): RenderContext["ctx"] {
  const ctx = makeCtx(log) as unknown as Record<string, unknown>;
  for (const prop of ["fillStyle", "strokeStyle"]) {
    let value: unknown = ctx[prop];
    Object.defineProperty(ctx, prop, {
      configurable: true,
      get: () => value,
      set: (next: unknown) => {
        value = next;
        log.push([prop, next]);
      },
    });
  }
  return ctx as unknown as RenderContext["ctx"];
}

function visualizerStyles(
  type: Settings["visualizer"]["type"],
  colorPreset: Settings["visualizer"]["colorPreset"],
  color = "#FFFFFF",
): string[] {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.type = type;
  s.visualizer.colorPreset = colorPreset;
  s.visualizer.color = color;
  const log: Call[] = [];
  const rc = { ...visualizerCtx(1920, 1080, s), ctx: styleLogCtx(log) };
  drawVisualizer(rc);
  return log.filter((c) => c[0] === "fillStyle" || c[0] === "strokeStyle").map((c) => String(c[1]));
}

check("default visualizer is white", () => {
  const styles = visualizerStyles("bars", "white");
  ok(styles.includes("rgba(255,255,255,0.85)"), `stroke ${styles.join(", ")}`);
  ok(styles.includes("rgba(255,255,255,0.8)"));
});

check("black / red / custom hex reach every mode", () => {
  for (const type of ["waveform", "spectrum", "bars", "stereo"] as const) {
    const black = visualizerStyles(type, "black");
    ok(
      black.some((s) => s.startsWith("rgba(10,10,10,")),
      `${type} uses the black preset (${black.join(", ")})`,
    );
    const red = visualizerStyles(type, "red");
    ok(
      red.some((s) => s.startsWith("rgba(213,52,43,")),
      `${type} uses the red preset (${red.join(", ")})`,
    );
    const custom = visualizerStyles(type, "custom", "#12AB34");
    ok(
      custom.some((s) => s.startsWith("rgba(18,171,52,")),
      `${type} uses the custom hex (${custom.join(", ")})`,
    );
  }
});

console.log("\nframe visualizer");

function frameVisualizer(
  width: number,
  height: number,
  thickness: number,
  type: Settings["visualizer"]["type"] = "bars",
  frameBand: Settings["visualizer"]["frameBand"] = "bottom",
  position: Settings["visualizer"]["position"] = "bottom-center",
) {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.type = type;
  s.visualizer.placement = "frame";
  s.visualizer.frameBand = frameBand;
  s.visualizer.position = position;
  s.frame.thickness = thickness;
  const rc = visualizerCtx(width, height, s);
  const geo = frameVisualizerGeometry(rc)!;
  const bands = frameBands(s.frame, width, height)!;
  return { geo, bands, content: contentRect(s.frame, width, height) };
}

const STAGES = [
  [1920, 1080],
  [1080, 1920],
] as const;

check("frame waveform stays inside the top and bottom bands", () => {
  for (const [w, h] of STAGES) {
    for (const band of ["top", "bottom"] as const) {
      const { geo } = frameVisualizer(w, h, 0.038, "waveform", band);
      const b = geo.band!;
      const amp = geo.amplitude!;
      ok(amp > 0, `${w}x${h} ${band}: has amplitude`);
      ok(amp < b.height / 2, `${w}x${h} ${band}: leaves breathing room`);
      ok(geo.cy - amp >= b.y - 1e-9, `${w}x${h} ${band}: envelope above band edge`);
      ok(geo.cy + amp <= b.y + b.height + 1e-9, `${w}x${h} ${band}: envelope below band edge`);
      // Never touches the canvas trim.
      ok(geo.cx - geo.w / 2 > 0, `${w}x${h} ${band}: left trim margin`);
      ok(geo.cx + geo.w / 2 < w, `${w}x${h} ${band}: right trim margin`);
    }
  }
});

check("frame waveform clears the artwork opening", () => {
  for (const [w, h] of STAGES) {
    for (const band of ["top", "bottom"] as const) {
      const { geo, content } = frameVisualizer(w, h, 0.05, "waveform", band);
      const b = geo.band!;
      if (band === "top") {
        ok(b.y + b.height <= content.y + 1e-9, "band sits above the opening");
        ok(geo.cy + geo.amplitude! <= content.y + 1e-9, "waveform above the opening");
      } else {
        ok(b.y >= content.y + content.height - 1e-9, "band sits below the opening");
        ok(
          geo.cy - geo.amplitude! >= content.y + content.height - 1e-9,
          "waveform below the opening",
        );
      }
    }
  }
});

check("frame thickness drives a bounded amplitude", () => {
  const thin = frameVisualizer(1080, 1920, 0.015, "waveform").geo;
  const mid = frameVisualizer(1080, 1920, 0.038, "waveform").geo;
  const thick = frameVisualizer(1080, 1920, 0.08, "waveform").geo;
  ok(thin.amplitude! < mid.amplitude!, "thin frame -> restrained amplitude");
  ok(mid.amplitude! < thick.amplitude!, "thicker frame -> larger amplitude");
  for (const g of [thin, mid, thick]) {
    ok(g.amplitude! <= g.band!.height / 2, "amplitude never exceeds the band");
  }
});

check("frame waveform uses the available horizontal span", () => {
  for (const [w, h] of STAGES) {
    const { geo } = frameVisualizer(w, h, 0.038, "waveform");
    const b = geo.band!;
    const pad = b.height * FRAME_VISUALIZER.padX;
    ok(Math.abs(geo.cx - geo.w / 2 - pad) < 1e-9, "left edge respects the trim margin");
    ok(Math.abs(geo.cx + geo.w / 2 - (w - pad)) < 1e-9, "right edge respects the trim margin");
    ok(geo.w > w * 0.85, `${w}x${h}: stretches across most of the band`);
  }
});

check("frame placement supports left/right marks within the band", () => {
  for (const position of ["bottom-left", "bottom-right"] as const) {
    const { geo } = frameVisualizer(1920, 1080, 0.038, "waveform", "bottom", position);
    const b = geo.band!;
    ok(geo.cx - geo.w / 2 >= b.x - 1e-9, `${position}: inside left edge`);
    ok(geo.cx + geo.w / 2 <= b.x + b.width + 1e-9, `${position}: inside right edge`);
    ok(geo.w < 1920 * 0.6, `${position}: restrained share of the strip`);
  }
});

check("every frame mode stays within the band envelope", () => {
  for (const type of ["waveform", "bars", "spectrum", "stereo"] as const) {
    for (const band of ["top", "bottom"] as const) {
      const { geo } = frameVisualizer(1920, 1080, 0.038, type, band);
      const b = geo.band!;
      ok(geo.amplitude! > 0, `${type} ${band}: amplitude`);
      ok(geo.amplitude! <= b.height / 2, `${type} ${band}: bounded`);
      ok(geo.cy - geo.amplitude! >= b.y - 1e-9, `${type} ${band}: above`);
      ok(geo.cy + geo.amplitude! <= b.y + b.height + 1e-9, `${type} ${band}: below`);
    }
  }
});

check("frame placement survives frame thickness changes", () => {
  for (const thickness of [0.015, 0.038, 0.08]) {
    const { geo, bands, content } = frameVisualizer(1080, 1920, thickness, "waveform");
    const box = {
      top: geo.cy - geo.amplitude!,
      bottom: geo.cy + geo.amplitude!,
    };
    ok(box.top >= bands.bottom.y - 1e-9, `thickness ${thickness}: above canvas edge`);
    ok(box.top >= content.y + content.height - 1e-9, `thickness ${thickness}: clear of artwork`);
    ok(geo.h > 0 && geo.w > 0, `thickness ${thickness}: has extent`);
  }
});

check("frame placement falls back to artwork when the frame is disabled", () => {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.placement = "frame";
  s.frame.enabled = false;
  const rc = visualizerCtx(1080, 1920, s);
  const geo = visualizerGeometry(rc);
  strictEqual(geo.clip, null);
  strictEqual(geo.cy, visualizerBaseline(rc));
});

check("default placement keeps the historic artwork geometry", () => {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.type = "bars";
  const rc = visualizerCtx(1920, 1080, s);
  strictEqual(s.visualizer.placement, "artwork");
  strictEqual(visualizerGeometry(rc).cy, visualizerBaseline(rc));
  strictEqual(visualizerGeometry(rc).clip, null);
});

check("frame placement is drawn by the dedicated layer, not the artwork layer", () => {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.type = "waveform";
  s.visualizer.placement = "frame";
  const artworkLog: Call[] = [];
  drawVisualizer({ ...visualizerCtx(1920, 1080, s), ctx: makeCtx(artworkLog) });
  strictEqual(artworkLog.length, 0, "artwork layer skips frame placement");

  const frameLog: Call[] = [];
  drawFrameVisualizer({ ...visualizerCtx(1920, 1080, s), ctx: makeCtx(frameLog) });
  ok(frameLog.length > 0, "frame layer draws the readout");
});

check("artwork placement is ignored by the frame layer", () => {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.placement = "artwork";
  const log: Call[] = [];
  drawFrameVisualizer({ ...visualizerCtx(1920, 1080, s), ctx: makeCtx(log) });
  strictEqual(log.length, 0);
});

check("frame visualizer composites on top of the printed band", () => {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.type = "waveform";
  s.visualizer.placement = "frame";
  s.visualizer.frameBand = "bottom";
  s.cta.enabled = false;
  const log: Call[] = [];
  renderScene({ ...visualizerCtx(1920, 1080, s), ctx: makeCtx(log) });
  const frameFill = log.reduce(
    (last, c, i) => (c[0] === "fill" && c[1] === "evenodd" ? i : last),
    -1,
  );
  ok(frameFill >= 0, "frame band was filled");
  const strokesAfter = log.map((c, i) => (c[0] === "stroke" ? i : -1)).filter((i) => i > frameFill);
  ok(strokesAfter.length > 0, "frame waveform stroked after the band");
});

check("frame waveform envelope is clamped even at high sensitivity", () => {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.type = "waveform";
  s.visualizer.placement = "frame";
  s.visualizer.frameBand = "bottom";
  s.visualizer.sensitivity = 3;
  const rc = visualizerCtx(1080, 1920, s);
  rc.audio.waveform = new Float32Array(256).fill(1);
  const log: Call[] = [];
  rc.ctx = makeCtx(log);
  drawFrameVisualizer(rc);
  const geo = frameVisualizerGeometry(rc)!;
  const band = geo.band!;
  let points = 0;
  for (const c of log) {
    if (c[0] === "moveTo" || c[0] === "lineTo") {
      points++;
      const y = Number(c[2]);
      ok(y >= band.y - 1e-9 && y <= band.y + band.height + 1e-9, `y ${y} inside band`);
      ok(Math.abs(y - geo.cy) <= geo.amplitude! + 1e-9, `y ${y} within amplitude envelope`);
    }
  }
  ok(points > 0, "waveform drawn");
});

check("frame waveform resampling is deterministic and bounded", () => {
  const data = new Float32Array(256);
  for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 0.5);
  const a = frameWaveformSamples(data, 96);
  const b = frameWaveformSamples(data, 96);
  deepStrictEqual(a, b);
  strictEqual(a.length, 96);
  ok(Math.max(...a) <= 1 && Math.min(...a) >= -1, "values stay in range");
});

function frameVisualizerStyles(
  colorPreset: Settings["visualizer"]["colorPreset"],
  color = "#FFFFFF",
  type: Settings["visualizer"]["type"] = "waveform",
): string[] {
  const s = baseSettings();
  s.visualizer.enabled = true;
  s.visualizer.type = type;
  s.visualizer.placement = "frame";
  s.visualizer.frameBand = "bottom";
  s.visualizer.colorPreset = colorPreset;
  s.visualizer.color = color;
  const log: Call[] = [];
  const rc = { ...visualizerCtx(1920, 1080, s), ctx: styleLogCtx(log) };
  drawFrameVisualizer(rc);
  return log.filter((c) => c[0] === "fillStyle" || c[0] === "strokeStyle").map((c) => String(c[1]));
}

check("frame visualizer uses the same resolved colours", () => {
  ok(
    frameVisualizerStyles("white").some((s) => s.startsWith("rgba(255,255,255,")),
    "white",
  );
  ok(
    frameVisualizerStyles("black").some((s) => s.startsWith("rgba(10,10,10,")),
    "black",
  );
  ok(
    frameVisualizerStyles("red").some((s) => s.startsWith("rgba(213,52,43,")),
    "red",
  );
  ok(
    frameVisualizerStyles("custom", "#12AB34").some((s) => s.startsWith("rgba(18,171,52,")),
    "custom",
  );
});

console.log("\ncustom positions");

check("portrait honours explicit custom vinyl coordinates", () => {
  const s = baseSettings();
  s.vinyl.enabled = true;
  s.vinyl.position = "custom";
  s.vinyl.x = 0.3;
  s.vinyl.y = 0.7;
  const log = render(1080, 1920, 2, s);
  // Vinyl is the first layer that translates, using its own centre.
  const translate = log.find((c) => c[0] === "translate");
  ok(translate, "vinyl translated");
  strictEqual(Number(translate![1]), 0.3 * 1080);
  strictEqual(Number(translate![2]), 0.7 * 1920);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
