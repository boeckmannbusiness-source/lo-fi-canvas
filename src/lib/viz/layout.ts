import { contentRect, frameThicknessPx } from "./identity.ts";
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
 * The usable composition rectangle that alignment anchors refer to: the frame
 * opening, further clipped by the content-safe band. Deriving it from the
 * existing `contentRect` + safe insets (rather than a portrait-only offset)
 * means "top-left" always means the top-left of the intended content area, at
 * every aspect ratio and frame thickness.
 */
export function alignmentRect(r: RenderContext): Rect {
  const content = contentRect(r.settings.frame, r.width, r.height);
  const safe = safeRect(r);
  const left = Math.max(content.x, safe.left);
  const top = Math.max(content.y, safe.top);
  const right = Math.min(content.x + content.width, safe.right);
  const bottom = Math.min(content.y + content.height, safe.bottom);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Corner anchor for physical objects (vinyl, cassette).
 *
 * Landscape keeps the historic inset fractions byte-for-byte so the locked
 * landscape regression fixture stays green. Portrait anchors the element's
 * *bounding box* (halfW / halfH) to the usable composition rect, with padding
 * derived from the frame thickness — no arbitrary portrait offsets.
 */
export function cornerAnchor(
  r: RenderContext,
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right",
  insetX: number,
  insetY: number,
  halfW = 0,
  halfH = 0,
): { x: number; y: number } {
  const right = corner.endsWith("right");
  const bottom = corner.startsWith("bottom");
  if (!isPortrait(r)) {
    return {
      x: right ? (1 - insetX) * r.width : insetX * r.width,
      y: bottom ? (1 - insetY) * r.height : insetY * r.height,
    };
  }
  const rect = alignmentRect(r);
  const pad = Math.max(
    frameThicknessPx(r.settings.frame, r.width, r.height),
    Math.min(r.width, r.height) * 0.02,
  );
  const minX = rect.left + halfW;
  const maxX = rect.right - halfW;
  const minY = rect.top + halfH;
  const maxY = rect.bottom - halfH;
  const anchorX = right ? rect.right - pad - halfW : rect.left + pad + halfW;
  const anchorY = bottom ? rect.bottom - pad - halfH : rect.top + pad + halfH;
  return {
    x: minX > maxX ? (rect.left + rect.right) / 2 : Math.min(Math.max(anchorX, minX), maxX),
    y: minY > maxY ? (rect.top + rect.bottom) / 2 : Math.min(Math.max(anchorY, minY), maxY),
  };
}

/** Centre of the usable composition rect. Landscape stays the canvas centre. */
export function centerAnchor(r: RenderContext): { x: number; y: number } {
  if (!isPortrait(r)) return { x: r.width * 0.5, y: r.height * 0.5 };
  const rect = alignmentRect(r);
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

/** Clamp a y coordinate into the safe band. */
export function clampSafeY(r: RenderContext, y: number, pad = 0): number {
  const rect = safeRect(r);
  return Math.min(Math.max(y, rect.top + pad), rect.bottom - pad);
}
