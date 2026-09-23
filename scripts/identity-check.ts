/**
 * Deterministic checks for the BERLIN B TAPES identity geometry & CTA timeline.
 *
 * Pure, dependency-free, and runnable on Node's built-in type stripping:
 *   node --experimental-strip-types scripts/identity-check.ts
 *
 * These cover the parts that must be identical in preview and export and that
 * are easy to regress: frame geometry, CTA timing / interpolation, and the
 * portrait-safe coordinate maths.
 */
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import {
  CTA_PHASES,
  FRAME_PRESETS,
  clamp01,
  contentRect,
  ctaLayout,
  ctaState,
  usableRect,
  easeInCubic,
  easeOutCubic,
  frameBands,
  frameThicknessPx,
  hexToRgba,
  nowPlayingLayout,
  resolveFrameColor,
  resolveVisualizerColor,
  VISUALIZER_COLOR_PRESETS,
} from "../src/lib/viz/identity.ts";
import { alignmentRect, centerAnchor, cornerAnchor } from "../src/lib/viz/layout.ts";
import { CONTENT_SAFE_AREAS } from "../src/lib/viz/format.ts";
import type { RenderContext } from "../src/lib/viz/types.ts";

/** Minimal render context for pure layout helpers (no canvas needed). */
function layoutCtx(
  width: number,
  height: number,
  frame = FRAME_ON,
): RenderContext {
  return {
    width,
    height,
    layout: width >= height ? "landscape" : "portrait",
    safe: width >= height ? CONTENT_SAFE_AREAS.landscape : CONTENT_SAFE_AREAS.portrait,
    settings: { frame },
  } as unknown as RenderContext;
}

const FRAME_ON = { enabled: true, thickness: 0.04, preset: "cream", color: "#EFE4CB" };
const FRAME_OFF = { enabled: false, thickness: 0.04, preset: "cream", color: "#EFE4CB" };
const CTA = { enabled: true, startTime: 10, duration: 4, backgroundStyle: "title-card" };
const NP = { position: "top-right", customX: 0.82, customY: 0.12, align: "right" };

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

console.log("\nframe geometry");

check("thickness scales with the shorter edge in landscape and portrait", () => {
  strictEqual(frameThicknessPx(FRAME_ON, 1920, 1080), 1080 * 0.04);
  strictEqual(frameThicknessPx(FRAME_ON, 1080, 1920), 1080 * 0.04);
});

check("frame disabled produces no thickness", () => {
  strictEqual(frameThicknessPx(FRAME_OFF, 1920, 1080), 0);
});

check("content rect is inset on all four sides", () => {
  const rect = contentRect(FRAME_ON, 1920, 1080);
  const t = frameThicknessPx(FRAME_ON, 1920, 1080);
  strictEqual(rect.x, t);
  strictEqual(rect.y, t);
  strictEqual(rect.width, 1920 - 2 * t);
  strictEqual(rect.height, 1080 - 2 * t);
});

check("content rect falls back to a safe margin when the frame is off", () => {
  const rect = contentRect(FRAME_OFF, 1920, 1080);
  strictEqual(rect.x, 1080 * 0.05);
  ok(rect.width > 0 && rect.height > 0);
});

check("frame presets resolve to palette colors, custom passes through", () => {
  const amber = FRAME_PRESETS.find((p) => p.id === "amber");
  strictEqual(resolveFrameColor({ preset: "amber", color: "#000000" }), amber?.color);
  strictEqual(resolveFrameColor({ preset: "custom", color: "#123456" }), "#123456");
});

console.log("\ncta timeline");

check("inactive before, after, and outside its window", () => {
  strictEqual(ctaState(CTA, 9.99).active, false);
  strictEqual(ctaState(CTA, 10).active, true);
  strictEqual(ctaState(CTA, 13.99).active, true);
  strictEqual(ctaState(CTA, 14).active, false);
  strictEqual(ctaState(CTA, 20).active, false);
});

check("disabled CTA never activates", () => {
  strictEqual(ctaState({ ...CTA, enabled: false }, 11).active, false);
});

check("card fades 0 -> 1 -> 0 across the window", () => {
  strictEqual(ctaState(CTA, 10).alpha, 0);
  const entering = ctaState(CTA, 10.2).alpha;
  ok(entering > 0 && entering < 1, `entering alpha ${entering}`);
  ok(ctaState(CTA, 12).alpha > 0.99, "holds at full opacity");
  ok(ctaState(CTA, 14 - 1e-9).alpha < 0.05, "exits to transparent");
});

check("text entrance interpolates monotonically with easing", () => {
  let previous = -1;
  for (let t = 10.5; t <= 11.6; t += 0.02) {
    const entrance = ctaState(CTA, t).entrance;
    ok(entrance >= previous - 1e-9, `entrance decreased at t=${t}`);
    previous = entrance;
  }
  ok(previous > 0.99, "reaches fully entered");
});

check("exit ramp rises from the hold phase", () => {
  ok(ctaState(CTA, 10 + 4 * CTA_PHASES.outStart).exit < 1e-6);
  ok(ctaState(CTA, 13.9).exit > 0.5);
});

check("state is a pure function of time (preview === export)", () => {
  deepStrictEqual(ctaState(CTA, 11.234), ctaState(CTA, 11.234));
  deepStrictEqual(ctaState(CTA, 10.5), ctaState(CTA, 10.5));
});

check("only the dim background needs the normal scene as backdrop", () => {
  ok(ctaState({ ...CTA, backgroundStyle: "dim" }, 11).requiresBackdrop);
  strictEqual(ctaState(CTA, 11).requiresBackdrop, false);
});

check("a short track never reaches a later CTA window", () => {
  strictEqual(ctaState(CTA, 5).active, false);
});

console.log("\neasing / color helpers");

check("easing endpoints clamp", () => {
  strictEqual(easeOutCubic(0), 0);
  strictEqual(easeOutCubic(1), 1);
  strictEqual(easeOutCubic(-3), 0);
  strictEqual(easeOutCubic(9), 1);
  strictEqual(easeInCubic(0), 0);
  strictEqual(easeInCubic(1), 1);
  strictEqual(clamp01(2), 1);
  strictEqual(clamp01(-2), 0);
  ok(easeOutCubic(0.5) > 0.5, "ease-out is front-loaded");
});

check("hexToRgba converts shorthand and clamps alpha", () => {
  strictEqual(hexToRgba("#ff0000", 0.5), "rgba(255,0,0,0.5)");
  strictEqual(hexToRgba("#abc", 2), "rgba(170,187,204,1)");
});

console.log("\nportrait compatibility");

check("now playing clears the TikTok action rail in portrait", () => {
  const layout = nowPlayingLayout(NP, FRAME_ON, 1080, 1920);
  ok(layout.portrait);
  ok(layout.x / 1080 <= 0.88, `right edge ratio ${layout.x / 1080}`);
  ok(layout.y / 1920 >= 0.04, "top safe inset");
  ok(layout.x > layout.content.x && layout.x < 1080);
  ok(layout.y > layout.content.y && layout.y < 1920);
});

check("now playing sits inside the frame opening in landscape", () => {
  const layout = nowPlayingLayout(NP, FRAME_ON, 1920, 1080);
  const rect = contentRect(FRAME_ON, 1920, 1080);
  ok(!layout.portrait);
  ok(layout.x <= rect.x + rect.width && layout.x >= rect.x);
  ok(layout.y >= rect.y && layout.y <= rect.y + rect.height);
});

check("bottom positions anchor to the bottom of the opening", () => {
  const layout = nowPlayingLayout({ ...NP, position: "bottom-right" }, FRAME_ON, 1920, 1080);
  const rect = contentRect(FRAME_ON, 1920, 1080);
  ok(layout.anchorBottom);
  ok(layout.y < rect.y + rect.height, "above the inner bottom edge");
});

check("custom position is expressed as a fraction of the opening", () => {
  const layout = nowPlayingLayout(
    { position: "custom", customX: 0.5, customY: 0.5, align: "center" },
    FRAME_ON,
    1080,
    1920,
  );
  const rect = contentRect(FRAME_ON, 1080, 1920);
  strictEqual(layout.align, "center");
  strictEqual(layout.x, rect.x + rect.width / 2);
  strictEqual(layout.y, rect.y + rect.height / 2);
});

console.log("\ncta overlay geometry");

const CTA_POSITIONS = [
  "bottom-center",
  "bottom-left",
  "bottom-right",
  "center",
  "top-center",
] as const;

check("cta panel stays inside the usable area at every position", () => {
  for (const [w, h] of [
    [1920, 1080],
    [1080, 1920],
  ] as const) {
    const safe = w >= h ? CONTENT_SAFE_AREAS.landscape : CONTENT_SAFE_AREAS.portrait;
    const area = usableRect(FRAME_ON, w, h, safe);
    for (const position of CTA_POSITIONS) {
      const { panel } = ctaLayout({ position, size: 1 }, FRAME_ON, w, h, safe);
      ok(panel.x >= area.x - 1e-9, `${w}x${h} ${position} left`);
      ok(panel.y >= area.y - 1e-9, `${w}x${h} ${position} top`);
      ok(panel.x + panel.width <= area.x + area.width + 1e-9, `${w}x${h} ${position} right`);
      ok(panel.y + panel.height <= area.y + area.height + 1e-9, `${w}x${h} ${position} bottom`);
    }
  }
});

check("cta is a card, not a full-screen scene", () => {
  for (const [w, h] of [
    [1920, 1080],
    [1080, 1920],
  ] as const) {
    const safe = w >= h ? CONTENT_SAFE_AREAS.landscape : CONTENT_SAFE_AREAS.portrait;
    const { panel } = ctaLayout({ position: "bottom-center", size: 1 }, FRAME_ON, w, h, safe);
    ok((panel.width * panel.height) / (w * h) < 0.5, `${w}x${h} overlay is a minority of the frame`);
  }
});

check("cta bottom-center clears the portrait safe bottom", () => {
  const safe = CONTENT_SAFE_AREAS.portrait;
  const { panel } = ctaLayout({ position: "bottom-center", size: 1 }, FRAME_ON, 1080, 1920, safe);
  ok(panel.y + panel.height <= 1920 * (1 - safe.bottom) + 1e-9, "above the caption band");
});

check("cta size scales the panel", () => {
  const safe = CONTENT_SAFE_AREAS.landscape;
  const small = ctaLayout({ position: "bottom-center", size: 0.75 }, FRAME_ON, 1920, 1080, safe);
  const large = ctaLayout({ position: "bottom-center", size: 1.5 }, FRAME_ON, 1920, 1080, safe);
  ok(large.panel.width > small.panel.width);
  ok(large.panel.height > small.panel.height);
});

console.log("\nframe bands");

check("frame bands are absent when there is no frame", () => {
  strictEqual(frameBands(FRAME_OFF, 1920, 1080), null);
  strictEqual(frameBands({ ...FRAME_ON, thickness: 0 }, 1920, 1080), null);
});

check("frame bands derive their depth from the frame thickness", () => {
  const bands = frameBands(FRAME_ON, 1920, 1080)!;
  const t = frameThicknessPx(FRAME_ON, 1920, 1080);
  strictEqual(bands.thickness, t);
  strictEqual(bands.top.height, t);
  strictEqual(bands.bottom.height, t);
  strictEqual(bands.left.width, t);
  strictEqual(bands.right.width, t);
  strictEqual(bands.bottom.y, 1080 - t);
  strictEqual(bands.right.x, 1920 - t);
});

check("frame bands agree with the content opening", () => {
  const bands = frameBands(FRAME_ON, 1080, 1920)!;
  const content = contentRect(FRAME_ON, 1080, 1920);
  strictEqual(bands.content.x, content.x);
  strictEqual(bands.content.y, content.y);
  strictEqual(bands.top.height, content.y);
  strictEqual(bands.bottom.y, content.y + content.height);
});

check("a thicker frame deepens every band", () => {
  const thin = frameBands({ ...FRAME_ON, thickness: 0.02 }, 1080, 1920)!;
  const thick = frameBands({ ...FRAME_ON, thickness: 0.08 }, 1080, 1920)!;
  ok(thick.thickness > thin.thickness);
  ok(thick.bottom.height > thin.bottom.height);
  ok(thick.content.height < thin.content.height);
});

console.log("\nvisualizer colour");

check("defaults to white when the setting is absent", () => {
  strictEqual(resolveVisualizerColor({}), "#FFFFFF");
  strictEqual(resolveVisualizerColor({ colorPreset: "white" }), "#FFFFFF");
});

check("resolves the named presets", () => {
  strictEqual(resolveVisualizerColor({ colorPreset: "black" }), "#0A0A0A");
  strictEqual(resolveVisualizerColor({ colorPreset: "red" }), "#D5342B");
  strictEqual(resolveVisualizerColor({ colorPreset: "dark-red" }), "#7A1F1A");
  strictEqual(resolveVisualizerColor({ colorPreset: "gray" }), "#9A9A94");
});

check("custom passes the hex through", () => {
  strictEqual(resolveVisualizerColor({ colorPreset: "custom", color: "#12AB34" }), "#12AB34");
});

check("every palette entry resolves to a valid hex", () => {
  for (const preset of VISUALIZER_COLOR_PRESETS) {
    const hex = resolveVisualizerColor({
      colorPreset: preset.id,
      color: preset.id === "custom" ? "#010203" : undefined,
    });
    ok(/^#[0-9a-f]{6}$/i.test(hex), `${preset.id} -> ${hex}`);
  }
});

console.log("\nalignment anchors");

check("landscape top-left keeps the historic inset fraction", () => {
  const p = cornerAnchor(layoutCtx(1920, 1080), "top-left", 0.18, 0.18);
  strictEqual(p.x, 0.18 * 1920);
  strictEqual(p.y, 0.18 * 1080);
});

check("landscape bottom-right keeps the historic inset fraction", () => {
  const p = cornerAnchor(layoutCtx(1920, 1080), "bottom-right", 0.18, 0.18);
  strictEqual(p.x, (1 - 0.18) * 1920);
  strictEqual(p.y, (1 - 0.18) * 1080);
});

check("portrait top-left anchors the bounding box to the usable top-left", () => {
  const r = layoutCtx(1080, 1920);
  const rect = alignmentRect(r);
  const half = 120;
  const p = cornerAnchor(r, "top-left", 0.18, 0.18, half, half);
  ok(p.x - half >= rect.left - 1e-9, "left edge inside the content area");
  ok(p.y - half >= rect.top - 1e-9, "top edge inside the content area");
  ok(p.x - half < rect.left + 200, "actually near the left edge");
  ok(p.y - half < rect.top + 200, "actually near the top edge");
});

check("portrait bottom-right anchors the bounding box to the usable bottom-right", () => {
  const r = layoutCtx(1080, 1920);
  const rect = alignmentRect(r);
  const half = 120;
  const p = cornerAnchor(r, "bottom-right", 0.18, 0.18, half, half);
  ok(p.x + half <= rect.right + 1e-9, "right edge inside the content area");
  ok(p.y + half <= rect.bottom + 1e-9, "bottom edge inside the content area");
  ok(p.x + half > rect.right - 200, "actually near the right edge");
  ok(p.y + half > rect.bottom - 200, "actually near the bottom edge");
});

check("portrait anchors never leave the usable area for oversized elements", () => {
  const r = layoutCtx(1080, 1920);
  const rect = alignmentRect(r);
  const half = 900; // far larger than the content area
  for (const corner of ["top-left", "top-right", "bottom-left", "bottom-right"] as const) {
    const p = cornerAnchor(r, corner, 0.18, 0.18, half, half);
    ok(p.x - half <= rect.left + 1e-9 || p.x === (rect.left + rect.right) / 2);
    ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

check("portrait top-right is not pushed down by a portrait-only offset", () => {
  const r = layoutCtx(1080, 1920);
  const rect = alignmentRect(r);
  const p = cornerAnchor(r, "top-right", 0.18, 0.18, 100, 100);
  ok(p.y - 100 < rect.top + 200, "top anchor sits at the top of the content area");
  ok(p.x + 100 <= rect.right + 1e-9);
});

check("center alignment is the centre of the usable composition area", () => {
  const r = layoutCtx(1080, 1920);
  const rect = alignmentRect(r);
  const c = centerAnchor(r);
  strictEqual(c.x, (rect.left + rect.right) / 2);
  strictEqual(c.y, (rect.top + rect.bottom) / 2);
});

check("landscape center stays the canvas centre", () => {
  const c = centerAnchor(layoutCtx(1920, 1080));
  strictEqual(c.x, 960);
  strictEqual(c.y, 540);
});

check("alignment rect tracks frame thickness", () => {
  const thin = alignmentRect(layoutCtx(1080, 1920, { ...FRAME_ON, thickness: 0.02 }));
  const thick = alignmentRect(layoutCtx(1080, 1920, { ...FRAME_ON, thickness: 0.08 }));
  ok(thick.left >= thin.left, "thicker frame pushes the usable area inward");
  ok(thick.width <= thin.width);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
