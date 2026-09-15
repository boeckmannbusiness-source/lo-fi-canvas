import type { RenderContext } from "../types";

/**
 * Deterministic floating dust: every particle's position is a pure function of
 * time, so preview and render always match.
 */
export function drawDust(r: RenderContext) {
  const d = r.settings.dust;
  if (!d.enabled || d.opacity <= 0) return;
  const { ctx, width: W, height: H } = r;
  const count = Math.round(20 + d.density * 180);
  const sparkle = 1 + r.audio.treble * 0.5;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < count; i++) {
    const seed = i * 12.9898;
    const sx = (Math.sin(seed) * 43758.5453) % 1;
    const sy = (Math.sin(seed * 1.7 + 4.1) * 24634.6345) % 1;
    const sz = Math.abs((Math.sin(seed * 2.3 + 1.7) * 15731.743) % 1);
    const baseX = Math.abs(sx);
    const baseY = Math.abs(sy);
    const speed = (0.004 + sz * 0.012) * d.speed;
    const t = r.time;
    const x =
      (baseX + Math.sin(t * speed * 3 + seed) * 0.03 + t * speed * 0.05) % 1;
    const y = (baseY - t * speed * 0.06 + 2) % 1;
    const size = (0.6 + sz * 2.2) * r.scale * sparkle;
    const alpha = d.opacity * (0.25 + sz * 0.75);
    ctx.globalAlpha = alpha;
    const grd = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, size * 3);
    grd.addColorStop(0, "rgba(255,248,230,0.9)");
    grd.addColorStop(1, "rgba(255,248,230,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x * W, y * H, size * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
