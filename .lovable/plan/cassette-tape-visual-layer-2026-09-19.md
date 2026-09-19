# Cassette Tape Visual Layer

## Goal
Add an optional vintage cassette object that matches the existing restrained vinyl styling and renders identically in live preview and exported 1080p video.

## Implementation
- Extend scene settings with a cassette section: enabled, five fixed positions, size, opacity, slow motion speed, and subtle audio reactivity.
- Keep cassette disabled by default so current presets and compositions remain unchanged.
- Add an independent pure canvas layer that draws:
  - a dark beveled cassette shell with rounded corners and a soft shadow,
  - two detailed reels with deterministic rotation,
  - a muted label panel, tape window, screws, highlights, and restrained analog wear,
  - slow whole-object drift/tilt plus optional bass-driven movement capped at a subtle amount.
- Insert the cassette layer alongside the vinyl in the shared scene pipeline. Because preview and export already call the same renderer, no export architecture changes are needed.
- Add a dedicated Cassette section to the existing settings panel with enable, position, size, opacity, movement speed, and audio-reactive controls.

## Verification
- Confirm the cassette appears at all five positions and controls update without renderer errors.
- Confirm existing vinyl, artwork label, text, logo, presets, and uploads remain functional.
- Export a short 1920×1080 sample and inspect a frame to confirm the cassette is present and matches preview placement.
- Verify the MP4 still contains readable video and audio streams.
- Confirm the project build and TypeScript checks are green.
