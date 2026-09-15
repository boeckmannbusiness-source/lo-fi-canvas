import { drawBackground } from "./layers/background";
import { drawDust } from "./layers/dust";
import { drawFlicker } from "./layers/flicker";
import { drawGrain } from "./layers/grain";
import { drawRain } from "./layers/rain";
import { drawText } from "./layers/text";
import { drawVinyl } from "./layers/vinyl";
import { drawVisualizer } from "./layers/visualizer";
import type { RenderContext } from "./types";

export type Layer = (r: RenderContext) => void;

/** Composition order. Add new effects here — layers stay independent. */
export const layers: Layer[] = [
  drawBackground,
  drawVinyl,
  drawRain,
  drawDust,
  drawFlicker,
  drawVisualizer,
  drawText,
  drawGrain,
];

export function renderScene(r: RenderContext) {
  for (const layer of layers) {
    r.ctx.save();
    layer(r);
    r.ctx.restore();
  }
}
