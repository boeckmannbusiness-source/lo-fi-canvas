import type { RenderContext } from "./types";

/**
 * Shared layout helpers so a single scene renderer composes sensibly in both
 * 16:9 and 9:16. Every helper is a pure function of the render context.
 */

/** Short edge of the canvas — the stable basis for object and type sizing. */
export function shortEdge(r: RenderContext): number {
  return Math.min(r.width, r.height);
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Safe content rectangle in pixels. */
export function safeRect(r: RenderContext): Rect {
  const left = r.width * r.safe.left;
  const right = r.width * (1 - r.safe.right);
  const top = r.height * r.safe.top;
  const bottom = r.height * (1 - r.safe.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function isPortrait(r: RenderContext): boolean {
  return r.layout === "portrait";
}

/**
 * Corner anchor for physical objects (vinyl, cassette).
 * Landscape keeps the historic inset fractions; portrait anchors inside the
 * safe rect so nothing lands under the platform UI.
 */
export function cornerAnchor(
  r: RenderContext,
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  insetX: number,
  insetY: number,
): { x: number; y: number } {
  const right = corner.endsWith("right");
  const bottom = corner.startsWith("bottom");
  if (!isPortrait(r)) {
    return {
      x: right ? (1 - insetX) * r.width : insetX * r.width,
      y: bottom ? (1 - insetY) * r.height : insetY * r.height,
    };
  }
  const rect = safeRect(r);
  const dx = rect.width * 0.22;
  const dy = rect.height * 0.16;
  return {
    x: right ? rect.right - dx : rect.left + dx,
    y: bottom ? rect.bottom - dy : rect.top + dy,
  };
}

/** Clamp a y coordinate into the safe band. */
export function clampSafeY(r: RenderContext, y: number, pad = 0): number {
  const rect = safeRect(r);
  return Math.min(Math.max(y, rect.top + pad), rect.bottom - pad);
}
