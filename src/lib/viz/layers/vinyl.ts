import type { RenderContext } from "../types";

function vinylCenter(r: RenderContext): { x: number; y: number } {
  const v = r.settings.vinyl;
  const m = 0.18;
  switch (v.position) {
    case "top-left":
      return { x: m * r.width, y: m * r.height };
    case "top-right":
      return { x: (1 - m) * r.width, y: m * r.height };
    case "bottom-left":
      return { x: m * r.width, y: (1 - m) * r.height };
    case "bottom-right":
      return { x: (1 - m) * r.width, y: (1 - m) * r.height };
    default:
      return { x: v.x * r.width, y: v.y * r.height };
  }
}

/** Continuously rotating vinyl record overlay. */
export function drawVinyl(r: RenderContext) {
  const v = r.settings.vinyl;
  if (!v.enabled) return;
  const { ctx } = r;
  const { x, y } = vinylCenter(r);
  const radius = v.size * r.height * 0.5;
  const reactive = v.audioReactive ? 1 + r.audio.bass * 0.018 : 1;
  const angle = ((r.time * v.rpm) / 60) * Math.PI * 2;

  ctx.save();
  ctx.globalAlpha = v.opacity;
  ctx.translate(x, y);
  ctx.scale(reactive, reactive);

  // soft drop shadow
  const sh = ctx.createRadialGradient(0, 0, radius * 0.7, 0, 0, radius * 1.25);
  sh.addColorStop(0, "rgba(0,0,0,0.5)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(angle);

  // disc body
  const body = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
  body.addColorStop(0, "#161616");
  body.addColorStop(0.55, "#0c0c0e");
  body.addColorStop(1, "#050506");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // grooves
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = Math.max(0.5, radius * 0.004);
  const grooves = 46;
  for (let i = 0; i < grooves; i++) {
    const gr = radius * (0.36 + (i / grooves) * 0.62);
    ctx.globalAlpha = v.opacity * (0.25 + (i % 3 === 0 ? 0.25 : 0.1));
    ctx.beginPath();
    ctx.arc(0, 0, gr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = v.opacity;

  // sheen sweep (rotates with the disc so it reads as a spinning record)
  const sheen = ctx.createLinearGradient(-radius, -radius, radius, radius);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.42, "rgba(255,255,255,0.07)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.12)");
  sheen.addColorStop(0.58, "rgba(255,255,255,0.05)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // center label
  const labelR = radius * 0.33;
  const label = ctx.createRadialGradient(0, -labelR * 0.3, labelR * 0.1, 0, 0, labelR);
  label.addColorStop(0, "#d8c7a6");
  label.addColorStop(1, "#b39a72");
  ctx.fillStyle = label;
  ctx.beginPath();
  ctx.arc(0, 0, labelR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = Math.max(0.5, radius * 0.006);
  ctx.beginPath();
  ctx.arc(0, 0, labelR * 0.78, 0, Math.PI * 2);
  ctx.stroke();

  // spindle hole
  ctx.fillStyle = "#08080a";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.035, 0, Math.PI * 2);
  ctx.fill();

  // outer rim highlight
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = Math.max(0.6, radius * 0.008);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.995, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
