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
  ctaState,
  easeInCubic,
  easeOutCubic,
  frameThicknessPx,
  hexToRgba,
  nowPlayingLayout,
  resolveFrameColor,
} from "../src/lib/viz/identity.ts";

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

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
