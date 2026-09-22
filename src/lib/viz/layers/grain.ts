import type { RenderContext } from "../types";

let tile: HTMLCanvasElement | OffscreenCanvas | null = null;
let tileFrames: (HTMLCanvasElement | OffscreenCanvas)[] = [];
const TILE = 256;
const VARIANTS = 8;

/** Number of pre-rendered deterministic grain variants. */
export const GRAIN_VARIANTS = VARIANTS;

/**
 * Shared grain tile lookup so other layers (frame border, CTA card) can reuse
 * the exact same analog texture without duplicating the tile generator.
 */
export function grainTile(index: number): CanvasImageSource | null {
  makeTiles();
  const i = ((index % VARIANTS) + VARIANTS) % VARIANTS;
  return tileFrames[i] ?? tile;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTiles() {
  if (tileFrames.length) return;
  for (let v = 0; v < VARIANTS; v++) {
    const c =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(TILE, TILE)
        : Object.assign(document.createElement("canvas"), {
            width: TILE,
            height: TILE,
          });
    const cx = (c as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D;
    const img = cx.createImageData(TILE, TILE);
    const rnd = mulberry32(1337 + v * 7919);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = 110 + rnd() * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    tileFrames.push(c);
  }
  tile = tileFrames[0] ?? null;
}

/** Subtle animated analog film grain. */
export function drawGrain(r: RenderContext) {
  const g = r.settings.grain;
  if (!g.enabled || g.intensity <= 0) return;
  const frame = Math.floor(r.time * 24) % VARIANTS;
  const src = grainTile(frame);
  if (!src) return;
  const { ctx } = r;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = Math.min(0.4, g.intensity);
  const pattern = ctx.createPattern(src as CanvasImageSource, "repeat");
  if (pattern) {
    const ox = ((frame * 37) % TILE) - TILE;
    const oy = ((frame * 61) % TILE) - TILE;
    ctx.translate(ox, oy);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, r.width + TILE * 2, r.height + TILE * 2);
  }
  ctx.restore();
}
