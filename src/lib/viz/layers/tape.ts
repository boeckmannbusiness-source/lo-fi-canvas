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
  const paper = ctx.createLinearGradient(x, y, x + width, y + height);
  paper.addColorStop(0, "#d7d1c3");
  paper.addColorStop(0.55, "#b8b09e");
  paper.addColorStop(1, "#8d887d");
  ctx.fillStyle = paper;
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
  ctx.fillStyle = `rgba(6,7,8,${Math.min(0.88, r.settings.tape.labelDarkness + 0.16)})`;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "rgba(226,221,208,0.08)";
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function drawScrew(ctx: RenderContext["ctx"], x: number, y: number, radius: number, angle: number) {
  const metal = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 0, x, y, radius);
  metal.addColorStop(0, "#77766f");
  metal.addColorStop(0.48, "#343638");
  metal.addColorStop(1, "#101113");
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = "rgba(226,221,208,0.38)";
  ctx.lineWidth = Math.max(0.55, radius * 0.18);
  ctx.beginPath();
  ctx.moveTo(-radius * 0.55, 0);
  ctx.lineTo(radius * 0.55, 0);
  ctx.stroke();
  ctx.restore();
}

function drawReel(
  ctx: RenderContext["ctx"],
  x: number,
  y: number,
  radius: number,
  tapeRadius: number,
  angle: number,
) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "rgba(4,5,6,0.92)";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(226,221,208,0.12)";
  ctx.lineWidth = Math.max(0.7, radius * 0.035);
  ctx.stroke();

  const tapePack = ctx.createRadialGradient(0, 0, radius * 0.33, 0, 0, tapeRadius);
  tapePack.addColorStop(0, "#161719");
  tapePack.addColorStop(0.74, "#27231f");
  tapePack.addColorStop(0.91, "#100f0e");
  tapePack.addColorStop(1, "#34302a");
  ctx.fillStyle = tapePack;
  ctx.beginPath();
  ctx.arc(0, 0, tapeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(184,176,158,0.18)";
  ctx.lineWidth = Math.max(0.45, radius * 0.018);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, tapeRadius * (0.78 + i * 0.045), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.rotate(angle);
  ctx.strokeStyle = "#b8b09e";
  ctx.lineWidth = Math.max(1.1, radius * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.37, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#b8b09e";
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 3);
    roundedRect(ctx, radius * 0.3, -radius * 0.075, radius * 0.38, radius * 0.15, radius * 0.04);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#17181a";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Premium smoked-shell underground cassette with deterministic synchronized mechanics. */
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
  const duration = Math.max(1, r.duration);
  const progress = Math.max(0, Math.min(1, r.time / duration));

  ctx.save();
  ctx.globalAlpha = tape.opacity;
  ctx.translate(center.x, center.y + floatY);
  ctx.rotate(angle);
  ctx.scale(reactive, reactive);

  // Chunky, smoked charcoal shell.
  ctx.shadowColor = "rgba(0,0,0,0.68)";
  ctx.shadowBlur = height * 0.16;
  ctx.shadowOffsetY = height * 0.07;
  const shell = ctx.createLinearGradient(x, y, x + width, y + height);
  shell.addColorStop(0, "#343638");
  shell.addColorStop(0.18, "#202225");
  shell.addColorStop(0.7, "#111214");
  shell.addColorStop(1, "#08090a");
  ctx.fillStyle = shell;
  roundedRect(ctx, x, y, width, height, height * 0.072);
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.strokeStyle = "rgba(226,221,208,0.18)";
  ctx.lineWidth = Math.max(0.9, height * 0.007);
  roundedRect(ctx, x, y, width, height, height * 0.072);
  ctx.stroke();

  // Recessed technical inner chassis.
  const innerX = x + width * 0.045;
  const innerY = y + height * 0.07;
  const innerW = width * 0.91;
  const innerH = height * 0.76;
  ctx.fillStyle = "rgba(4,5,6,0.34)";
  roundedRect(ctx, innerX, innerY, innerW, innerH, height * 0.04);
  ctx.fill();
  ctx.strokeStyle = "rgba(226,221,208,0.07)";
  ctx.stroke();

  // Asymmetric split label: artwork strip left, catalog typography right.
  const labelY = y + height * 0.105;
  const labelH = height * 0.22;
  const artX = x + width * 0.09;
  const artW = width * 0.39;
  drawArtworkLabel(r, artX, labelY, artW, labelH, height * 0.018);
  ctx.fillStyle = "rgba(184,176,158,0.14)";
  roundedRect(ctx, x + width * 0.5, labelY, width * 0.4, labelH, height * 0.018);
  ctx.fill();
  ctx.strokeStyle = "rgba(226,221,208,0.16)";
  ctx.lineWidth = Math.max(0.6, height * 0.004);
  ctx.stroke();

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(226,221,208,0.93)";
  ctx.font = `900 ${Math.max(8, height * 0.115)}px "Arial Narrow", "Helvetica Neue", sans-serif`;
  ctx.fillText("B TAPES", x + width * 0.865, labelY + labelH * 0.43);
  ctx.fillStyle = "rgba(184,176,158,0.62)";
  ctx.font = `700 ${Math.max(5, height * 0.034)}px monospace`;
  ctx.fillText("BERLIN  /  TYPE II  /  B-90", x + width * 0.865, labelY + labelH * 0.76);

  // Smoked mechanical window and a visible tape path.
  const windowX = x + width * 0.115;
  const windowY = y + height * 0.37;
  const windowW = width * 0.77;
  const windowH = height * 0.32;
  const glass = ctx.createLinearGradient(windowX, windowY, windowX, windowY + windowH);
  glass.addColorStop(0, "rgba(2,3,4,0.88)");
  glass.addColorStop(0.55, "rgba(20,22,23,0.78)");
  glass.addColorStop(1, "rgba(2,3,4,0.94)");
  ctx.fillStyle = glass;
  roundedRect(ctx, windowX, windowY, windowW, windowH, height * 0.045);
  ctx.fill();
  ctx.strokeStyle = "rgba(226,221,208,0.13)";
  ctx.lineWidth = Math.max(0.7, height * 0.005);
  ctx.stroke();

  const reelY = windowY + windowH * 0.48;
  const leftX = -width * 0.205;
  const rightX = width * 0.205;
  const reelRadius = height * 0.13;
  const leftTape = reelRadius * (0.94 - progress * 0.24);
  const rightTape = reelRadius * (0.7 + progress * 0.24);
  drawReel(ctx, leftX, reelY, reelRadius, leftTape, reelAngle);
  drawReel(ctx, rightX, reelY, reelRadius, rightTape, reelAngle);

  ctx.strokeStyle = "rgba(58,50,42,0.94)";
  ctx.lineWidth = Math.max(1, height * 0.014);
  ctx.beginPath();
  ctx.moveTo(leftX, windowY + windowH * 0.84);
  ctx.quadraticCurveTo(0, windowY + windowH * 0.98, rightX, windowY + windowH * 0.84);
  ctx.stroke();
  ctx.strokeStyle = "rgba(226,221,208,0.05)";
  ctx.lineWidth = Math.max(0.6, height * 0.004);
  ctx.beginPath();
  ctx.moveTo(windowX + windowW * 0.08, windowY + windowH * 0.12);
  ctx.lineTo(windowX + windowW * 0.92, windowY + windowH * 0.12);
  ctx.stroke();

  // Lower tape-head housing with precision apertures.
  ctx.fillStyle = "#0b0c0e";
  ctx.beginPath();
  ctx.moveTo(-width * 0.27, y + height * 0.79);
  ctx.lineTo(width * 0.27, y + height * 0.79);
  ctx.lineTo(width * 0.21, y + height * 0.96);
  ctx.lineTo(-width * 0.21, y + height * 0.96);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(226,221,208,0.09)";
  ctx.stroke();
  for (const hx of [-0.14, 0, 0.14]) {
    ctx.fillStyle = hx === 0 ? "rgba(184,176,158,0.2)" : "#030405";
    roundedRect(ctx, hx * width - width * 0.026, y + height * 0.845, width * 0.052, height * 0.035, height * 0.012);
    ctx.fill();
  }

  // Hardware and small catalog marks.
  const screwR = height * 0.019;
  const screws = [
    [-0.445, -0.405, 0.4],
    [0.445, -0.405, -0.65],
    [-0.445, 0.405, -0.2],
    [0.445, 0.405, 0.82],
  ] as const;
  for (const [sx, sy, sa] of screws) drawScrew(ctx, sx * width, sy * height, screwR, sa);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(184,176,158,0.5)";
  ctx.font = `700 ${Math.max(4, height * 0.026)}px monospace`;
  ctx.fillText("A", x + width * 0.075, y + height * 0.91);
  ctx.textAlign = "right";
  ctx.fillText("NR OFF   44.1", x + width * 0.925, y + height * 0.91);

  // Deterministic abrasion and molding texture; no frame-to-frame noise.
  ctx.lineWidth = Math.max(0.35, height * 0.0025);
  for (let i = 0; i < 18; i++) {
    const tx = x + width * (0.055 + ((i * 47) % 89) / 100);
    const ty = y + height * (0.055 + ((i * 31) % 87) / 100);
    const len = width * (0.016 + (i % 4) * 0.009);
    ctx.strokeStyle = i % 3 === 0 ? "rgba(226,221,208,0.045)" : "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + len, ty + height * 0.003);
    ctx.stroke();
  }

  ctx.restore();
}