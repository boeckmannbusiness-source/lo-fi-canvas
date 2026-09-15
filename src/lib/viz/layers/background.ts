import type { RenderContext } from "../types";

/** Base artwork + Ken Burns camera + vignette + warmth grade. */
export function drawBackground(r: RenderContext) {
  const { ctx, width: W, height: H, settings } = r;

  ctx.save();
  ctx.fillStyle = "#07070a";
  ctx.fillRect(0, 0, W, H);

  if (r.image && r.imageWidth > 0) {
    const cam = settings.camera;
    // amount is defined over a 5 minute (300s) span
    const progress = Math.min(1, r.time / 300);
    let scale = 1;
    if (cam.move === "zoom-in") scale = 1 + cam.amount * progress;
    else if (cam.move === "zoom-out") scale = 1 + cam.amount * (1 - progress);
    const driftX = Math.sin(r.time * 0.012) * cam.driftX * 0.01 * W;
    const driftY = Math.cos(r.time * 0.009) * cam.driftY * 0.01 * H;

    const iw = r.imageWidth;
    const ih = r.imageHeight;
    let dw = W;
    let dh = H;
    if (settings.background.fit === "cover") {
      const s = Math.max(W / iw, H / ih);
      dw = iw * s;
      dh = ih * s;
    } else if (settings.background.fit === "contain") {
      const s = Math.min(W / iw, H / ih);
      dw = iw * s;
      dh = ih * s;
    }
    // slight overscan so drift never exposes edges
    const over = 1.04 * scale;
    dw *= over;
    dh *= over;
    ctx.drawImage(r.image, (W - dw) / 2 + driftX, (H - dh) / 2 + driftY, dw, dh);
  }

  const warmth = settings.background.warmth;
  if (warmth > 0) {
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = `rgba(255, 170, 110, ${warmth * 0.4})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  const vig = settings.background.vignette;
  if (vig > 0) {
    const g = ctx.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.25,
      W / 2,
      H / 2,
      Math.max(W, H) * 0.75,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${vig})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
