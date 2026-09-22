import { drawBackground } from "./layers/background";
import { drawDust } from "./layers/dust";
import { drawFlicker } from "./layers/flicker";
import { drawFrame } from "./layers/frame";
import { drawGrain } from "./layers/grain";
import { drawRain } from "./layers/rain";
import { drawLogo } from "./layers/logo";
import { drawNowPlaying } from "./layers/nowPlaying";
import { drawText } from "./layers/text";
import { drawTape } from "./layers/tape";
import { drawVinyl } from "./layers/vinyl";
import { drawVisualizer } from "./layers/visualizer";
import { drawCtaScene } from "./layers/cta";
import { ctaState } from "./identity";
import type { RenderContext } from "./types";

export type Layer = (r: RenderContext) => void;

/** Composition order. Add new effects here — layers stay independent. */
export const layers: Layer[] = [
  drawBackground,
  drawVinyl,
  drawTape,
  drawRain,
  drawDust,
  drawFlicker,
  drawVisualizer,
  drawText,
  drawNowPlaying,
  drawLogo,
  drawFrame,
  drawGrain,
];

/** The normal, artwork-led composition. */
export function renderNormalScene(r: RenderContext) {
  for (const layer of layers) {
    r.ctx.save();
    layer(r);
    r.ctx.restore();
  }
}

/**
 * Scene dispatcher shared by preview and export.
 *
 * Extends the existing layer pipeline rather than adding a second renderer: a
 * deterministic CTA timeline decides whether the normal scene or the CTA card
 * is composited. While the card crossfades in/out — and for the "dim"
 * background style — the normal scene is drawn underneath it.
 */
export function renderScene(r: RenderContext) {
  const cta = ctaState(r.settings.cta, r.time);
  if (!cta.active) {
    renderNormalScene(r);
    return;
  }
  if (cta.requiresBackdrop || cta.alpha < 1) renderNormalScene(r);
  drawCtaScene(r, cta);
}
