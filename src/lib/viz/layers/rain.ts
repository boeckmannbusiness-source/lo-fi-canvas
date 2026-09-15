import type { RenderContext } from "../types";

/** Thin atmospheric rain streaks (deterministic, time-derived). */
export function drawRain(r: RenderContext) {
  const rn = r.settings.rain;
  if (!rn.enabled || rn.opacity <= 0) return;
  const { ctx, width: W, height: H } = r;
  const count = Math.round(40 + rn.density * 320);
  const tilt = 0.12;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const seed = i * 7.3213;
    const sx = Math.abs((Math.sin(seed) * 43758.5453) % 1);
    const sz = Math.abs((Math.sin(seed * 3.1 + 2.4) * 15731.743) % 1);
    const speed = (0.18 + sz * 0.35) * (0.4 + rn.speed);
    const y = ((sx * 3.7 + r.time * speed) % 1.2) - 0.1;
    const x = (sx + y * tilt) % 1;
    const len = (24 + sz * 60) * r.scale * (0.5 + rn.speed * 0.8);
    ctx.globalAlpha = rn.opacity * (0.25 + sz * 0.6);
    ctx.strokeStyle = "rgba(200,220,255,0.75)";
    ctx.lineWidth = Math.max(0.6, (0.6 + sz * 0.9) * r.scale);
    ctx.beginPath();
    ctx.moveTo(x * W, y * H);
    ctx.lineTo(x * W - len * tilt, y * H + len);
    ctx.stroke();
  }
  ctx.restore();
}
