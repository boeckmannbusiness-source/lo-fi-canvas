# Vertical (TikTok / Reels / Shorts) export — 1080×1920

Add a second export format alongside the existing landscape export. The 1920×1080 pipeline stays byte-for-byte unchanged in behaviour; portrait reuses the same renderer, the same precomputed audio analysis, and the same WebCodecs + mp4-muxer encoder.

## 1. Current architecture assessment

- `renderScene(r)` walks a flat `layers[]` array; every layer is a pure function of `RenderContext` (`ctx`, `width`, `height`, `time`, `duration`, `audio`, `settings`, `image`, `logo`, `scale`). Nothing hardcodes 1920×1080.
- `scale` is defined as `height / 1080` in both `PreviewCanvas` and `export.ts`. This is the one assumption that breaks in portrait: at 1080×1920 it becomes 1.78, so hairlines, meter bars and monospace labels get ~78% oversized. It must become a reference-diagonal / short-edge based scale.
- Layers already scale off `width`/`height`, but they mix the two inconsistently:
  - vinyl radius = `size * height * 0.5` → in portrait the record gets much bigger.
  - cassette width = `size * width`, margins `0.18w / 0.22h` → cassette shrinks and drifts.
  - text sizes = `% of width` → title shrinks by 44% in portrait.
  - visualizer width = `% of width`, y fixed at `0.88H` → lands inside TikTok's action rail.
  - logo margin = `min(W,H) * margin` → fine; corner anchoring fine.
  - background `cover` fit already fills any aspect; the crop is the real risk.
  - grain / dust / rain / flicker are resolution-agnostic; only dust/rain particle size uses `scale`.
- `renderVideo(opts)` is already fully resolution-driven (`width`, `height`, `fps`, `duration`) — no hardcoded dimensions. Codec probing passes the actual width/height. Audio is truncated with `Math.ceil(duration * sampleRate)`, so duration truncation already works for audio; the video loop uses `duration * fps` frames.
- `Studio.exportVideo()` hardcodes `width: 1920, height: 1080, duration: duration || 60`. This is the only caller.

Conclusion: the encoder needs no structural change. The work is (a) an export-format concept in the UI/Studio, (b) a layout-aware scale + per-layer portrait composition rules, (c) duration clamping enforced in both UI and `renderVideo`.

## 2. Proposed architecture

Two small additions, no new renderer.

**A. `ExportFormat` / `ExportPreset` (new, in `src/lib/viz/format.ts`)**

```ts
export type ExportFormatId = "landscape" | "portrait";

export interface ExportFormat {
  id: ExportFormatId;
  label: string;          // "Landscape 16:9" / "Portrait 9:16"
  width: number;          // 1920 | 1080
  height: number;         // 1080 | 1920
  fps: 30;
  maxDuration: number | null;   // null = full track, 60 for portrait
  durationPresets?: number[];   // [15, 30, 60]
}
```

**B. `layout` on `RenderContext` (extends the existing type, no duplication)**

```ts
export type LayoutMode = "landscape" | "portrait";

export interface SafeArea { top: number; bottom: number; left: number; right: number } // fractions

// RenderContext gains:
layout: LayoutMode;
safe: SafeArea;       // portrait: top .12, bottom .20, sides .06; landscape: .04 all round
// and `scale` changes meaning to: min(width, height) / 1080  (identical value in landscape)
```

Layers read `r.layout` / `r.safe` only where composition genuinely differs. No portrait copies of settings, no duplicated typography system, no second renderer. Settings remain a single object; portrait applies **derived adjustments at draw time**, so switching format never mutates the user's settings.

Safe areas affect composition only — no guides are ever drawn into the exported frames. A guide overlay may optionally be drawn in the preview canvas (toggle), never in `renderScene`.

## 3. File-by-file plan

| File | Change |
| --- | --- |
| `src/lib/viz/format.ts` *(new)* | `ExportFormat` definitions, `EXPORT_FORMATS`, `clampDuration(format, seconds)`, `SAFE_AREAS` per layout. |
| `src/lib/viz/types.ts` | Add `LayoutMode`, `SafeArea`; add `layout` + `safe` to `RenderContext`; redefine `scale` doc as short-edge based. |
| `src/lib/viz/layout.ts` *(new, small)* | Helpers used by layers: `shortEdge(r)`, `safeRect(r)`, `portraitAnchor(r, slot)` returning normalized centres for the portrait stack (upper / mid / lower thirds). |
| `src/lib/viz/layers/vinyl.ts` | Radius off `shortEdge` instead of `height`; portrait corner anchors move to `0.22 / 0.28` insets inside the safe rect so the record isn't half off-canvas. |
| `src/lib/viz/layers/tape.ts` | Cassette width off `shortEdge`; portrait margins from the safe rect; `center` unchanged. |
| `src/lib/viz/layers/text.ts` | Replace the flat `SAFE_MARGIN` with `r.safe`; font size resolves against `shortEdge` (so a 7% title is the same physical size in both formats); portrait vertical anchors clamp inside the safe band. No new presets, no duplicated typography controls. |
| `src/lib/viz/layers/visualizer.ts` | Width off `shortEdge`; portrait baseline moves from `0.88H` to `~0.74H` (above the caption/action zone); stereo meter bar length/thickness off `shortEdge`. |
| `src/lib/viz/layers/logo.ts` | Margin respects `r.safe` rather than a raw fraction, so a top-right logo clears the TikTok header. |
| `src/lib/viz/layers/background.ts` | Keep `cover`; add a portrait focus bias so a square/landscape artwork crops toward the centre-upper third rather than dead centre; keep drift/overscan maths unchanged. |
| `src/lib/viz/scene.ts` | Unchanged (layer list identical). |
| `src/lib/viz/export.ts` | `ExportOptions` gains `layout` + `safe` (or a single `format`); the reusable render-context object passes them through; `scale` computed as `min(width,height)/1080`; **hard clamp**: `duration = Math.min(duration, format.maxDuration ?? duration)` inside `renderVideo`, independent of the UI. |
| `src/components/visualizer/PreviewCanvas.tsx` | Accept `format`; canvas dims derived from the format's aspect; pass `layout`, `safe`, new `scale`; optional non-exported safe-area guide overlay drawn after `renderScene` directly on the preview ctx. |
| `src/components/visualizer/Studio.tsx` | Format state + duration state; export panel (below); preview container aspect switches between `aspect-video` and `aspect-[9/16]`; filename suffix `-1080x1920`; header frame count reflects the clamped duration. |

Grain, dust, rain, flicker: no code change beyond inheriting the corrected `scale`.

## 4. Portrait composition strategy

| Layer | Landscape | Portrait | Changes required |
| --- | --- | --- | --- |
| Artwork / background | `cover`, centred, 4% overscan | `cover` with centre-upper crop bias | Focus bias only; fit modes unchanged |
| Ken Burns camera | zoom 1→1.03 over 300s, sin/cos drift | Identical maths | None (drift is already `%W` / `%H`) |
| Vinyl | radius `size*H*0.5`, corner insets 0.18 | radius off short edge, insets inside safe rect, default lower-right of mid band | Scale basis + portrait anchor |
| Cassette | width `size*W`, margins .18/.22 | width off short edge, margins from safe rect | Scale basis + portrait margins |
| Typography | size `%W`, safe 4% | size off short edge, safe band 12% top / 20% bottom | Same controls, layout-aware resolution |
| Logo | corner, margin `min(W,H)*m` | corner inside safe rect | Safe-rect offset |
| Stereo levels | bottom-centre at 0.88H | ~0.74H, bars sized off short edge | Baseline + scale basis |
| Minimal bars | width `0.25–0.7 W` | width off short edge (wider relative to frame) | Scale basis + baseline |
| Grain | full-frame pattern | Identical | None |
| Dust | particle size × `scale` | Identical with corrected scale | Inherits scale fix |
| Rain | streaks × `scale` | Identical with corrected scale | Inherits scale fix |
| Flicker | full-frame alpha | Identical | None |

Collision avoidance: portrait assigns each heavy element a band — typography in the centre band, vinyl/cassette in the lower-mid band, visualizer above the caption zone, logo in the top safe corner. Defaults only; the user can still override every position.

## 5. Export safety analysis

Pixel count is identical to landscape (2,073,600 px), so per-frame `VideoFrame` cost is unchanged (~3 MB I420). The existing safeguards carry over verbatim: max 2 frames in flight via `dequeue`-driven `waitForQueue`, every frame `close()`d in `finally`, one reusable render context, `fastStart: false`, muxer buffer released after the Blob.

| Duration | Frames | Encoded size (8 Mbps + audio) | Risk |
| --- | --- | --- | --- |
| 15 s | 450 | ~15 MB | None |
| 30 s | 900 | ~30 MB | None |
| 60 s | 1800 | ~60 MB | Muxer holds the whole file in an `ArrayBufferTarget`; ~60–70 MB resident plus the Blob copy at finalize. Acceptable, and well below the 45 s landscape stress run already verified. |

Risks and mitigations:
- The single real growth term is the in-memory muxer target — linear in duration, not in resolution. 60 s at 8 Mbps is safe; anything beyond 60 s is why the hard cap exists.
- Consider 6 Mbps for portrait (mobile-delivered, smaller display) — lowers peak memory ~25% with no visible loss. Flagged as a tuning decision, not a quality reduction of the landscape path.
- VP9 fallback: software-encoded, ~1.7× realtime at this pixel count, so a 60 s portrait export takes ~100 s in a browser without H.264. No additional memory pressure, but the UI should keep the elapsed timer and cancel button visible. Document, don't hide.
- Tall non-macroblock-aligned dimensions are fine: 1080 and 1920 are both multiples of 16.

## 6. UI plan

New "Export" block in the header/right panel (replacing the single Export button with a small popover):

- **Format**: segmented control — Landscape 1920×1080 / Portrait 1080×1920.
- **Resolution + FPS**: read-only line reflecting the chosen format (`1080×1920 · 30 fps`).
- **Duration**: landscape = full track (current behaviour). Portrait = 15 / 30 / 60 chips plus Custom, custom input clamped to `min(trackDuration, 60)`; the field cannot accept a higher value and the value is re-clamped inside `renderVideo`.
- **Estimate**: `frames = duration × 30` and `≈ duration × (bitrate + 192 kbps) / 8` MB.
- **Export video** button, existing progress / elapsed / cancel UI unchanged.

The centre preview switches aspect with the format so what the user composes is what gets exported, with an optional "Show safe areas" toggle that only affects the preview.

## 7. Validation plan

1. 15 / 30 / 60 s portrait exports from a real MP3 + JPG — each completes, no console errors, download fires.
2. `ffprobe` each: video stream 1080×1920, audio stream present, both durations ≈ selected duration (not the full track).
3. Audio is real, not silent (`ffmpeg volumedetect`), and starts at t=0 — confirms truncation didn't shift the start.
4. Custom duration >60 blocked in the UI; a direct `renderVideo` call with `duration: 120` and the portrait format produces exactly 60 s.
5. Composition frames extracted at t=0 / mid / end: typography readable and inside the safe band, vinyl and cassette fully on-canvas and not overlapping the title, visualizer above the bottom 20%, logo inside the top safe corner.
6. Preview/export consistency: same time index screenshot from the preview canvas vs. an extracted export frame, visually identical composition.
7. Memory: sample `performance.memory` / process RSS during the 60 s run — flat, no growth.
8. Landscape regression: re-run the existing 8 s and 45 s landscape exports; sizes, durations and codecs must match the previously recorded results, and a frame diff against a pre-change render must be pixel-identical apart from the intentional `scale` redefinition (which is a no-op at 16:9).
9. `npm run build` and `npx tsgo --noEmit` green.

## 8. Implementation order

1. `format.ts` + types (`LayoutMode`, `SafeArea`, `RenderContext` fields) — no behaviour change; landscape passes `layout: "landscape"` and the 4% safe area.
2. Redefine `scale` to `min(width,height)/1080` in both preview and export; verify landscape is pixel-identical.
3. `renderVideo` duration clamp + `layout`/`safe` plumbing; verify landscape unchanged.
4. Preview canvas format switch + portrait aspect; visually inspect with all layers on, no layer edits yet — this shows the raw un-adapted portrait as a baseline.
5. Layer adaptation, one commit each, checking the landscape render after every step: background bias → vinyl → cassette → typography → visualizer → logo.
6. Export UI (format, duration presets, estimate).
7. Optional safe-area preview overlay.
8. Full validation pass (section 7), including landscape regression.
