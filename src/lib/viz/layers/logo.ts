import type { RenderContext } from "../types";

/** Optional transparent logo, anchored to a corner of the composition. */
export function drawLogo(r: RenderContext) {
  const logo = r.settings.logo;
  if (!logo.enabled || !r.logo || r.logoWidth <= 0 || r.logoHeight <= 0) return;

  const { ctx, width: W, height: H } = r;
  const maxWidth = W * logo.size;
  const maxHeight = H * logo.size;
  const scale = Math.min(maxWidth / r.logoWidth, maxHeight / r.logoHeight);
  const width = r.logoWidth * scale;
  const height = r.logoHeight * scale;
  const margin = Math.min(W, H) * logo.margin;
  const right = logo.position.endsWith("right");
  const bottom = logo.position.startsWith("bottom");
  const x = right ? W - margin - width : margin;
  const y = bottom ? H - margin - height : margin;

  ctx.globalAlpha = logo.opacity;
  ctx.drawImage(r.logo, x, y, width, height);
}