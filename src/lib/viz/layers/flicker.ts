import type { RenderContext } from "../types";

/** Very subtle lamp / neon / CRT brightness fluctuation, nudged by loudness. */
export function drawFlicker(r: RenderContext) {
  const f = r.settings.flicker;
  const amp = r.audio.rms * 0.05;
  if ((!f.enabled || f.intensity <= 0) && amp <= 0.001) return;
  const { ctx, width: W, height: H } = r;
  let n = 0;
  if (f.enabled) {
    const t = r.time * (0.6 + f.speed * 3);
    n =
      (Math.sin(t * 1.7) * 0.5 +
        Math.sin(t * 3.9 + 1.2) * 0.3 +
        Math.sin(t * 9.3 + 2.7) * 0.2) *
      f.intensity;
  }
  const delta = n + amp;
  if (Math.abs(delta) < 0.0005) return;
  ctx.save();
  if (delta > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,240,220,${Math.min(0.25, delta)})`;
  } else {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgba(230,225,235,${Math.min(0.25, -delta)})`;
  }
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
