# Lo-Fi Canvas

Build a browser-based Lo-Fi Music Visualizer / Video Generator.

The goal is to create YouTube-ready visualizer videos from:

one static artwork/image (PNG or JPG)

one music file (MP3 or WAV)

The visual style should be inspired by premium lo-fi hip-hop YouTube channels such as "Beats by Tokyo": calm, atmospheric, minimal, cinematic and subtle. This is NOT supposed to be a flashy EDM-style audio visualizer.

Core concept

The user uploads:

Artwork: PNG/JPG

Audio: MP3/WAV

The application creates a looping animated scene around the static artwork.

The first MVP should support:

static background artwork

very slow camera zoom / Ken Burns effect

rotating vinyl record overlay

subtle film grain

subtle floating dust particles

optional rain overlay

subtle audio-reactive movement

optional waveform/audio visualizer

audio playback

real-time preview

export/render to a YouTube-ready MP4

Everything should preferably run locally in the browser. Do NOT introduce a backend, database, authentication or user accounts for this MVP.

Technical stack

Use:

React

TypeScript

Vite

Tailwind CSS

Web Audio API

HTML Canvas or WebGL for rendering

FFmpeg/WebAssembly where appropriate for client-side video rendering/export

Keep the architecture modular so additional visual effects can be added later.

Do NOT use a video-generation AI API.

The application should be deterministic: given the same artwork, audio and settings, the visual output should be reproducible.

UI / UX

Create a polished dark interface suitable for a music-production tool.

Layout:

LEFT:

project/settings panel

CENTER:

large 16:9 video preview

BOTTOM:

audio playback controls / timeline

RIGHT or below:

effect controls

The interface should feel like a small professional creative tool, not like an admin dashboard.

Project setup

Allow the user to:

Upload artwork

Drag & drop or file picker.

Supported:

PNG

JPG

JPEG

Show the uploaded artwork immediately in the preview.

Provide image fitting options:

Cover

Contain

Fill

Default: Cover.

Upload audio

Drag & drop or file picker.

Supported:

MP3

WAV

Display:

filename

duration

play/pause

current time

total duration

volume

The audio should be analyzed through the Web Audio API.

Preview

The main preview must use a fixed 16:9 aspect ratio.

Default preview resolution can be lower for performance, but the composition must represent the final 1920x1080 output.

The preview should show the actual visual effects in real time.

Add:

Play

Pause

Restart

Mute

Preview quality selector if useful

Visual effects

Implement the following effects as independent modules.

1. Background artwork

The uploaded image is the base layer.

Add a subtle configurable Ken Burns effect:

slow zoom in

slow zoom out

optional very slow horizontal/vertical movement

The movement should be extremely subtle.

The default should be:

5-minute animation:
100% → 103% scale

Do not make the movement distracting.

2. Vinyl record

Create a reusable vinyl record overlay.

The vinyl should look like a realistic dark vinyl record with:

subtle grooves

center label

small center hole

subtle reflections

The user should be able to position it:

top-left

top-right

bottom-left

bottom-right

custom position

Default:

bottom-right.

The vinyl rotates continuously.

Default rotation speed should visually resemble a real record player.

The vinyl must rotate smoothly and independently from the artwork.

Add:

size slider

opacity slider

rotation speed slider

optional audio-reactive scale

The audio-reactive scale must be subtle.

Example:

normal scale = 1.0

bass response = maximum approximately 1.01–1.02

Do NOT create exaggerated bouncing.

3. Film grain

Add a subtle animated film-grain overlay.

Controls:

enabled/disabled

intensity

Default intensity should be very low.

The effect should make the scene feel analog rather than obviously noisy.

4. Dust particles

Create subtle floating dust particles.

Controls:

enabled/disabled

density

speed

opacity

Particles should move slowly and randomly.

They should not look like stars.

5. Rain

Add an optional subtle rain overlay.

Controls:

enabled/disabled

density

speed

opacity

Rain should be thin and atmospheric.

Do not make it look like a storm.

6. Light flicker

Add an optional very subtle light/brightness fluctuation.

This can simulate:

neon light

lamp flicker

CRT glow

Controls:

enabled/disabled

intensity

speed

Keep the default effect extremely subtle.

7. Audio visualizer

Add an optional minimal audio visualizer.

Possible modes:

waveform

spectrum

minimal bars

Default should be waveform or an extremely subtle spectrum.

Position:

bottom-center.

Controls:

enabled/disabled

opacity

size

sensitivity

The visualizer should react to the actual uploaded audio using the Web Audio API.

Do NOT make it look like a generic music visualizer.

The default visualizer should be almost understated.

Audio analysis

Use Web Audio API / AnalyserNode.

Extract at least:

overall amplitude / RMS

bass energy

mid energy

treble energy

Expose these values internally so visual effects can react to them.

For example:

bass → very subtle vinyl scale

overall amplitude → very subtle brightness response

treble → subtle particle intensity

Use smoothing to avoid jitter.

Presets

Create a preset system.

Initial presets:

Tokyo Night

vinyl: ON

rain: ON

dust: ON

film grain: ON

light flicker: ON

visualizer: OFF

subtle camera zoom

Coffee Shop

vinyl: ON

rain: OFF

dust: ON

film grain: ON

light flicker: ON

visualizer: OFF

Late Night Coding

vinyl: ON

rain: ON

dust: ON

film grain: ON

light flicker: subtle

visualizer: ON

Minimal

vinyl: ON

rain: OFF

dust: OFF

film grain: subtle

visualizer: OFF

camera movement: subtle

Presets should simply change configuration values. Do not hard-code visual effects into individual presets.

Settings panel

Provide controls for:

Scene

preset

background fit

camera movement

Vinyl

enabled

position

size

opacity

rotation speed

audio reactivity

Atmosphere

film grain

dust

rain

light flicker

Audio visualizer

enabled

type

opacity

sensitivity

position

Provide a "Reset preset" / "Reset settings" action.

Text overlay

Add an optional text overlay.

Fields:

title

subtitle

Example:

TITLE:
MIDNIGHT TOKYO

SUBTITLE:
lo-fi beats for late nights

Controls:

enabled

position

font size

opacity

Keep typography minimal and elegant.

Rendering / export

The most important functional requirement after preview is video export.

Create an "Export Video" button.

Target:

1920 × 1080

16:9

30 FPS

H.264 video if technically possible

AAC audio

MP4 container

The exported video must contain the original uploaded audio.

The animation must continue for the entire duration of the audio.

Do not simply export a short GIF or short loop.

The renderer must use the actual audio duration.

If browser-only MP4/H.264 rendering is technically difficult, implement the cleanest viable architecture using FFmpeg WebAssembly or another client-side solution.

The UI must show:

rendering progress %

elapsed time if possible

cancel button if technically possible

download/export completion state

Do not upload the user's music or artwork to an external server.

Performance

The application must distinguish between:

realtime preview

final rendering

Preview may use reduced resolution.

Final rendering should render frame-by-frame at the selected output resolution.

Avoid memory leaks when loading large audio files or images.

Properly dispose:

AudioContext

Object URLs

animation frames

Canvas/WebGL resources

Architecture

Organize the visual system into reusable components/modules.

Suggested conceptual architecture:

App
├── ProjectManager
├── UploadPanel
├── PreviewCanvas
│ ├── BackgroundLayer
│ ├── CameraEffect
│ ├── VinylLayer
│ ├── RainLayer
│ ├── DustLayer
│ ├── GrainLayer
│ ├── LightFlickerLayer
│ ├── VisualizerLayer
│ └── TextLayer
├── AudioEngine
├── AudioAnalyzer
├── PresetManager
├── SettingsPanel
└── VideoRenderer

Keep effects independent so new effects can easily be added later.

Important product principle

This tool should prioritize:

subtle motion > flashy effects

The final result should look like a beautiful lo-fi album artwork that happens to be alive.

It should NOT look like:

EDM visualizer

gaming visualizer

Spotify visualizer

psychedelic audio spectrum

AI-generated random video

The intended result is suitable for long-form YouTube lo-fi videos.

MVP acceptance criteria

The MVP is successful when I can:

Open the web app.

Upload a JPG/PNG artwork.

Upload an MP3/WAV.

Press Play.

See the artwork with a subtle slow zoom.

See a vinyl record continuously rotating.

See subtle film grain.

Optionally see rain and dust.

See subtle audio-reactive movement.

Hear the uploaded audio.

Change presets/settings.

Preview the result.

Click Export Video.

Receive a 1920x1080 MP4 containing the animation and the original audio.

Do not add unnecessary features such as:

authentication

accounts

payments

database

social features

AI generation

cloud storage

Build the actual functional MVP first.

After implementation, verify that the preview works with real local MP3 + JPG files and that the exported MP4 contains both video and audio.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/df5a948f-442f-4ea0-93d9-0a12e640786a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Cloudinary mobile download (optional)

Portrait (1080×1920) exports offer a **Send to phone** action that uploads the
already-generated MP4 to Cloudinary and returns a shareable link. This is the
only path that leaves the device, it is opt-in, and it only ever uploads the
exported MP4 — never the source artwork or audio.

Configure it with two public Vite env vars (see `.env.example`). The upload uses
an **unsigned upload preset**, so no API secret is ever shipped to the browser:

```sh
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-unsigned-video-preset
```

In the Cloudinary console create an upload preset with **Signing mode:
Unsigned**, scoped to video uploads. When the vars are absent the action shows a
clear configuration error and local download keeps working unchanged.

