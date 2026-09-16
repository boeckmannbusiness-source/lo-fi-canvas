# Final end-to-end verification of the video export

No redesign, no new features. This is a test pass; any code change is a minimal fix for a concrete failure found during testing.

## Test assets

Generate two small but real files locally (none are present in the project):
- A short real MP3 (about 8-10 seconds, real tone/noise content, encoded with a real MP3 encoder) so the export finishes quickly while still exercising decoding and audio encoding.
- A real JPG artwork (1600x1600).

Both stay on disk in a temp folder and are fed to the app through the normal upload inputs.

## Browser run

Drive the running app in a real headless Chromium session and check, in order:
1. Page loads with no console errors.
2. Artwork upload shows in the preview.
3. MP3 upload shows filename, duration, and finishes the analysis progress bar.
4. Preview animates (compare two screenshots taken a second apart).
5. Play/pause moves the transport clock.
6. Switch through Tokyo Night, Coffee Shop, Late Night Coding, Minimal; confirm no renderer crash and that the effect toggles visibly change.
7. Switch background fit through Cover, Contain, Fill; confirm each renders without exceptions.
8. Try two preview quality options; confirm the preview canvas resolution changes and that export stays fixed at 1920x1080 (quality is a preview-only control by design).
9. Start an export, cancel mid-render; confirm the overlay closes, a "cancelled" message appears, no download is offered, and no uncaught error remains.
10. Start a full export; confirm progress advances to 100% and a blob/download is produced.

The exported blob is written to disk from the page so it can be inspected outside the browser.

## Container inspection (the real acceptance test)

Run ffprobe on the saved file and check:
- a video stream and an audio stream both exist
- codec names for each
- video duration and audio duration both close to the source audio duration
- audio sample rate and channel count are non-zero
- container parses without errors

Then decode the audio track with ffmpeg and measure its loudness/peak level, to prove the audio is real sound and not a silent track. Also load the file back into a browser video element and confirm it plays with a non-zero audio duration.

## Codec path

Record which video and audio codec the environment actually selected, whether H.264/AAC was available, whether the fallback (VP9/Opus) was triggered, and whether audio survived that path. Headless Chromium often lacks the AAC encoder; if the fallback produces a WebM-style codec inside an MP4 container, that is reported as a finding, with a minimal fix only if the resulting file is not playable.

## Regression

Run the production build and the TypeScript check; both must stay green.

## Report

A single concise report with PASS/FAIL per item in the requested structure. If audio-in-MP4 cannot be proven, the MVP is marked NOT FULLY VERIFIED explicitly.
