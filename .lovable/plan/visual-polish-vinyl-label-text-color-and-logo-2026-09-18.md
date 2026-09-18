# Visual polish: vinyl label, text color, and logo

## Scope
- Preserve the current interface, presets, deterministic canvas renderer, and export pipeline.
- Add only the requested composition controls and shared rendering support.

## Implementation
1. **Extend scene settings**
   - Add vinyl label darkness with a subtle default.
   - Add text color with the current warm-white appearance as the default.
   - Add logo enabled, corner, size, opacity, and edge-margin settings.
   - Ensure existing presets continue to apply without overriding uploaded media.

2. **Use artwork on the vinyl label**
   - Clip the uploaded artwork to the existing circular center label using a centered cover crop.
   - Draw it inside the vinyl’s rotating transform, then apply the configurable dark overlay.
   - Preserve the grooves, sheen, label border, and spindle hole.

3. **Add text color controls**
   - Add a native color picker and editable hex field in the Text section.
   - Accept valid six-digit hex values, retain the last valid color for incomplete/invalid input, and normalize the committed value.
   - Use the selected color for both title and subtitle while preserving their opacity difference and shadow.

4. **Add local logo overlay**
   - Add a PNG/SVG drop zone in the project panel, with object-URL cleanup matching artwork/audio.
   - Add logo controls for enable, four corners, size, opacity, and margin.
   - Introduce an independent logo layer using transparent image rendering and aspect-ratio-preserving sizing.
   - Pass the same loaded logo through preview and export so both outputs match.

## Verification
- Run the project typecheck and confirm the preview build remains green.
- Browser-test artwork/audio/logo upload, all four logo corners, text color, vinyl artwork, presets, and preview rendering.
- Run a short real export and inspect rendered frames/video playback to confirm vinyl artwork, text color, and logo appear without regressing audio/video export.
