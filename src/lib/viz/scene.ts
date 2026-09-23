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
import { drawFrameVisualizer, drawVisualizer } from "./layers/visualizer";
import { drawCtaScene } from "./layers/cta";
import { ctaState } from "./identity";
import type { RenderContext } from "./types";

export type Layer = (r: RenderContext) => void;

/**
 * The printed border plus any readout printed onto it.
 *
 * The frame-band visualizer is composed into the frame pass rather than given
 * its own entry so it renders *after* the band fill (the band must never paint
 * over it) while the artwork path emits exactly the same canvas ops as before.
 */
const drawFramedBorder: Layer = (r) => {
  drawFrame(r);
  drawFrameVisualizer(r);
};

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
  drawFramedBorder,
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
 * Extends the existing layer pipeline rather than adding a second renderer: the
 * normal artwork-led scene always renders, and a deterministic CTA timeline
 * composites the "LIKE & SUBSCRIBE" overlay on top of it while it is active.
 * The overlay never replaces the artwork, so a single renderer serves both
 * preview and export.
 */
export function renderScene(r: RenderContext) {
  const cta = ctaState(r.settings.cta, r.time);
  renderNormalScene(r);
  if (cta.active) drawCtaScene(r, cta);
}
