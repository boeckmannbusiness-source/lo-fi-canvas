import type { RenderContext } from "../types";

/** Understated waveform / spectrum / bars readout. */
export function drawVisualizer(r: RenderContext) {
  const v = r.settings.visualizer;
  if (!v.enabled || v.opacity <= 0) return;
  const { ctx, width: W, height: H } = r;
  const w = W * (0.25 + v.size * 0.45);
  const h = H * (0.04 + v.size * 0.08);
  let cx = W / 2;
  if (v.position === "bottom-left") cx = W * 0.05 + w / 2;
  if (v.position === "bottom-right") cx = W * 0.95 - w / 2;
  const cy = H * 0.88;
  const gain = v.sensitivity;

  ctx.save();
  ctx.globalAlpha = v.opacity;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = Math.max(1, 1.6 * r.scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (v.type === "waveform") {
    const data = r.audio.waveform;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = cx - w / 2 + (i / (data.length - 1)) * w;
      const y = cy + data[i] * h * 0.5 * gain;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (v.type === "spectrum") {
    const data = r.audio.spectrum;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy);
    for (let i = 0; i < data.length; i++) {
      const x = cx - w / 2 + (i / (data.length - 1)) * w;
      const y = cy - Math.min(1, data[i] * gain) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cx + w / 2, cy);
    ctx.globalAlpha = v.opacity * 0.35;
    ctx.fill();
    ctx.globalAlpha = v.opacity;
    ctx.stroke();
  } else {
    const data = r.audio.spectrum;
    const bars = 32;
    const gap = w / bars;
    const bw = Math.max(1, gap * 0.35);
    for (let i = 0; i < bars; i++) {
      const val = Math.min(1, data[Math.floor((i / bars) * data.length)] * gain);
      const bh = Math.max(1, val * h);
      const x = cx - w / 2 + i * gap + gap / 2 - bw / 2;
      ctx.fillRect(x, cy - bh / 2, bw, bh);
    }
  }
  ctx.restore();
}
