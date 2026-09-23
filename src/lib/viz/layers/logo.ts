import { isPortrait, safeRect } from "../layout";
import type { RenderContext } from "../types";

/** Optional transparent logo, anchored to a corner of the composition. */
export function drawLogo(r: RenderContext) {
  const logo = r.settings.logo;
  if (!logo.enabled || !r.logo || r.logoWidth <= 0 || r.logoHeight <= 0) return;

  const { ctx, width: W, height: H } = r;
  const short = Math.min(W, H);
  const maxWidth = (isPortrait(r) ? short : W) * logo.size;
  const maxHeight = (isPortrait(r) ? short : H) * logo.size;
  const scale = Math.min(maxWidth / r.logoWidth, maxHeight / r.logoHeight);
  const width = r.logoWidth * scale;
  const height = r.logoHeight * scale;
  const margin = short * logo.margin;
  const right = logo.position.endsWith("right");
  const bottom = logo.position.startsWith("bottom");
  let x = right ? W - margin - width : margin;
  let y = bottom ? H - margin - height : margin;
  if (isPortrait(r)) {
    // Keep the mark clear of the platform header / caption zone.
    const rect = safeRect(r);
    x = right ? rect.right - width : rect.left;
    y = bottom ? rect.bottom - height : rect.top;
  }

  ctx.globalAlpha = logo.opacity;
  ctx.drawImage(r.logo, x, y, width, height);
}