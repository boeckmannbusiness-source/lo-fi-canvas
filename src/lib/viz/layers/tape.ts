import type { RenderContext } from "../types";

function roundedRect(
  ctx: RenderContext["ctx"],
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function tapeCenter(r: RenderContext): { x: number; y: number } {
  const tape = r.settings.tape;
  const marginX = r.width * 0.18;
  const marginY = r.height * 0.22;
  switch (tape.position) {
    case "top-left":
      return { x: marginX, y: marginY };
    case "top-right":
      return { x: r.width - marginX, y: marginY };
    case "bottom-left":
      return { x: marginX, y: r.height - marginY };
    case "bottom-right":
      return { x: r.width - marginX, y: r.height - marginY };
    case "center":
      return { x: r.width * 0.5, y: r.height * 0.5 };
    case "custom":
      return { x: tape.x * r.width, y: tape.y * r.height };
  }
}

function drawArtworkLabel(
  r: RenderContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const { ctx } = r;
  const label = ctx.createLinearGradient(0, y, 0, y + height);
  label.addColorStop(0, "#beb6a1");
  label.addColorStop(1, "#8e8879");
  ctx.fillStyle = label;
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fill();

  if (!r.settings.tape.printArtwork || !r.image || r.imageWidth <= 0 || r.imageHeight <= 0) return;

  ctx.save();
  roundedRect(ctx, x, y, width, height, radius);
  ctx.clip();
  const imageRatio = r.imageWidth / r.imageHeight;
  const labelRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = r.imageWidth;
  let sh = r.imageHeight;
  if (imageRatio > labelRatio) {
    sw = r.imageHeight * labelRatio;
    sx = (r.imageWidth - sw) * 0.5;
  } else {
    sh = r.imageWidth / labelRatio;
    sy = (r.imageHeight - sh) * 0.5;
  }
  ctx.drawImage(r.image, sx, sy, sw, sh, x, y, width, height);
  ctx.fillStyle = `rgba(0,0,0,${r.settings.tape.labelDarkness})`;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "rgba(190,182,161,0.1)";
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function drawReel(
  ctx: RenderContext["ctx"],
  x: number,
  y: number,
  radius: number,
  angle: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.fillStyle = "#090a0b";
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(226,220,202,0.28)";
  ctx.lineWidth = Math.max(0.8, radius * 0.055);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.74, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#b8b19f";
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    roundedRect(ctx, radius * 0.22, -radius * 0.09, radius * 0.48, radius * 0.18, radius * 0.05);
    ctx.fill();
  }

  ctx.fillStyle = "#252526";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A restrained vintage cassette with deterministic reel and body motion. */
export function drawTape(r: RenderContext) {
  const tape = r.settings.tape;
  if (!tape.enabled) return;

  const { ctx } = r;
  const center = tapeCenter(r);
  const width = tape.size * r.width;
  const height = width * 0.62;
  const x = -width / 2;
  const y = -height / 2;
  const motion = tape.motion * 0.012;
  const angle = Math.sin(r.time * 0.22 * tape.motion) * motion;
  const floatY = Math.sin(r.time * 0.31 * tape.motion) * height * motion;
  const reactive = tape.audioReactive ? 1 + r.audio.bass * 0.009 : 1;
  const reelAngle = r.time * 0.7 * Math.max(0.15, tape.motion);

  ctx.save();
  ctx.globalAlpha = tape.opacity;
  ctx.translate(center.x, center.y + floatY);
  ctx.rotate(angle);
  ctx.scale(reactive, reactive);

  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = height * 0.12;
  ctx.shadowOffsetY = height * 0.055;
  const shell = ctx.createLinearGradient(x, y, x + width, y + height);
  shell.addColorStop(0, "#292a2b");
  shell.addColorStop(0.5, "#161719");
  shell.addColorStop(1, "#090a0b");
  ctx.fillStyle = shell;
  roundedRect(ctx, x, y, width, height, height * 0.065);
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = Math.max(0.8, height * 0.008);
  roundedRect(ctx, x, y, width, height, height * 0.065);
  ctx.stroke();

  // Recessed paper label and tape window.
  const labelX = x + width * 0.1;
  const labelY = y + height * 0.13;
  const labelW = width * 0.8;
  const labelH = height * 0.55;
  drawArtworkLabel(r, labelX, labelY, labelW, labelH, height * 0.025);

  ctx.fillStyle = "rgba(20,18,16,0.88)";
  roundedRect(
    ctx,
    x + width * 0.22,
    y + height * 0.25,
    width * 0.56,
    height * 0.27,
    height * 0.12,
  );
  ctx.fill();

  const reelRadius = height * 0.12;
  drawReel(ctx, -width * 0.19, -height * 0.055, reelRadius, reelAngle);
  drawReel(ctx, width * 0.19, -height * 0.055, reelRadius, -reelAngle);

  // Muted label rules and lower head window.
  ctx.strokeStyle = "rgba(54,48,40,0.42)";
  ctx.lineWidth = Math.max(0.6, height * 0.006);
  for (let i = 0; i < 3; i++) {
    const ruleY = labelY + labelH * (0.17 + i * 0.16);
    ctx.beginPath();
    ctx.moveTo(labelX + labelW * 0.08, ruleY);
    ctx.lineTo(labelX + labelW * 0.92, ruleY);
    ctx.stroke();
  }

  ctx.fillStyle = "#08090a";
  ctx.beginPath();
  ctx.moveTo(-width * 0.24, height * 0.24);
  ctx.lineTo(width * 0.24, height * 0.24);
  ctx.lineTo(width * 0.18, height * 0.42);
  ctx.lineTo(-width * 0.18, height * 0.42);
  ctx.closePath();
  ctx.fill();

  // Small hardware details and analog scuffs.
  ctx.fillStyle = "rgba(205,202,190,0.65)";
  const screwR = height * 0.018;
  for (const [sx, sy] of [
    [-0.43, -0.38],
    [0.43, -0.38],
    [-0.43, 0.38],
    [0.43, 0.38],
  ] as const) {
    ctx.beginPath();
    ctx.arc(sx * width, sy * height, screwR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = Math.max(0.5, height * 0.004);
  for (let i = 0; i < 8; i++) {
    const yy = y + height * (0.1 + i * 0.105);
    ctx.beginPath();
    ctx.moveTo(x + width * (0.05 + (i % 3) * 0.02), yy);
    ctx.lineTo(x + width * (0.9 - (i % 2) * 0.04), yy + height * 0.012);
    ctx.stroke();
  }

  ctx.restore();
}