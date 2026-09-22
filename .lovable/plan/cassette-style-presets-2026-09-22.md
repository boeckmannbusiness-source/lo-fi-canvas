# Cassette style presets

## Goal
Add three cassette-only style presets—Industrial Black, Faded Archive, and Bone Label—while preserving every existing cassette control, animation, positioning option, artwork printing behavior, and export path.

## Changes
- Add a cassette style setting and a small typed preset list for the three treatments.
- Add a **Style** selector inside the existing Cassette controls. Choosing a style changes only the cassette’s visual treatment.
- Update the Tape layer to render each treatment through a deterministic palette and material configuration:
  - **Industrial Black:** deep charcoal shell, restrained technical markings, smoked label/window.
  - **Faded Archive:** weathered graphite body, muted aged-paper label, softer worn markings.
  - **Bone Label:** dark shell with a higher-contrast bone label and crisp underground-label typography.
- Keep uploaded artwork printed into the label for every style, with the existing Print artwork and Label darkness controls still applied.
- Keep synchronized reel movement, tape transfer animation, position, size, opacity, motion, audio reactivity, scene order, and 1080p export unchanged.

## Verification
- Check all three styles in the live preview with uploaded artwork.
- Confirm existing cassette controls still update the cassette after changing styles.
- Export a short 1080p sample and confirm the selected style appears in the MP4 with video and audio intact.
- Confirm build and TypeScript checks remain green.
