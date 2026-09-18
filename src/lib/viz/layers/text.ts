import type { RenderContext } from "../types";

/** Minimal typographic overlay. */
export function drawText(r: RenderContext) {
  const t = r.settings.text;
  if (!t.enabled || (!t.title && !t.subtitle)) return;
  const { ctx, width: W, height: H } = r;
  const base = H * (0.035 + t.fontSize * 0.045);
  let x = W * 0.07;
  let y = H * 0.14;
  let align: CanvasTextAlign = "left";
  if (t.position === "top-center") {
    x = W / 2;
    align = "center";
  } else if (t.position === "bottom-left") {
    y = H * 0.82;
  } else if (t.position === "center") {
    x = W / 2;
    y = H * 0.5;
    align = "center";
  }

  ctx.save();
  ctx.globalAlpha = t.opacity;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = base * 0.5;

  if (t.title) {
    ctx.fillStyle = t.color;
    ctx.font = `600 ${base}px ui-sans-serif, system-ui, sans-serif`;
    const spaced = t.title.split("").join("\u2009");
    ctx.fillText(spaced, x, y);
  }
  if (t.subtitle) {
    ctx.globalAlpha = t.opacity * 0.7;
    ctx.fillStyle = t.color;
    ctx.font = `300 ${base * 0.42}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(t.subtitle, x, y + base * 0.85);
  }
  ctx.restore();
}
