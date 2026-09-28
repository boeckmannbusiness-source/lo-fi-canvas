/**
 * Deterministic checks for the BERLIN B TAPES YouTube production layer.
 *
 * Runs under Bun (the src modules use extensionless relative imports):
 *   bun scripts/youtube-check.ts
 *
 * Covers title/description/hashtag/tag generation, the dedicated thumbnail
 * (text, dimensions, JPEG export), filenames + metadata JSON, LocalStorage
 * persistence, determinism, and the preflight rules (valid + each missing
 * field). The thumbnail canvas core is driven against a stub 2D context, so no
 * real browser is needed.
 */
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import {
  DEFAULT_YOUTUBE_PRODUCTION,
  buildDescriptionText,
  buildMetadataJson,
  bundleBaseName,
  generateDescription,
  generateHashtags,
  generateTags,
  generateTitle,
  hashtagFromText,
  parseHashtagOverride,
  productionToLocationTag,
  resolveYouTubeMetadata,
  sanitizeYouTubeProduction,
  thumbnailText,
  youtubeFilenames,
  type YouTubeProduction,
} from "../src/lib/youtube/production.ts";
import {
  DEFAULT_TITLE_TEMPLATE_ID,
  TITLE_TEMPLATES,
  clampTitle,
  renderTitleTemplate,
} from "../src/lib/youtube/templates.ts";
import {
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  drawThumbnail,
  renderThumbnailCanvas,
  thumbnailToJpegBlob,
  wrapThumbnailLines,
} from "../src/lib/youtube/thumbnail.ts";
import {
  runYouTubePreflight,
  type PreflightVideoInfo,
} from "../src/lib/youtube/preflight.ts";
import { YOUTUBE_EXPORT } from "../src/lib/youtube/export-profile.ts";
import {
  YOUTUBE_STORAGE_KEY,
  loadYouTubeProduction,
  parseYouTubeProduction,
  persistYouTubeProduction,
  serializeYouTubeProduction,
} from "../src/lib/youtube/persistence.ts";
import type { PresetStorage } from "../src/lib/presets.ts";
import { avcCodecStrings } from "../src/lib/viz/compat.ts";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok   ${name}`);
    })
    .catch((error) => {
      failed++;
      console.error(`  FAIL ${name}\n       ${(error as Error).message}`);
    });
}

function prod(overrides: Partial<YouTubeProduction> = {}): YouTubeProduction {
  return {
    ...DEFAULT_YOUTUBE_PRODUCTION,
    overrides: { ...DEFAULT_YOUTUBE_PRODUCTION.overrides },
    ...overrides,
  };
}

/* ── Stub canvas 2D context ──────────────────────────────────────────────── */

function makeCtx() {
  const calls: unknown[][] = [];
  const text: string[] = [];
  const ctx: Record<string, unknown> = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  const methods = [
    "save",
    "restore",
    "fillRect",
    "strokeRect",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
    "fill",
    "drawImage",
  ];
  for (const m of methods) {
    ctx[m] = (...args: unknown[]) => calls.push([m, ...args]);
  }
  ctx["fillText"] = (value: string, ...args: unknown[]) => {
    text.push(value);
    calls.push(["fillText", value, ...args]);
  };
  ctx["measureText"] = (value: string) => ({ width: String(value).length * 10 });
  ctx["createLinearGradient"] = (...args: unknown[]) => {
    calls.push(["createLinearGradient", ...args]);
    return { addColorStop() {} };
  };
  ctx["createPattern"] = (...args: unknown[]) => {
    calls.push(["createPattern", ...args]);
    return {};
  };
  return { ctx, calls, text, joined: () => text.join("") };
}

class StubOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return makeCtx().ctx;
  }
  async convertToBlob(options?: { type?: string }) {
    return new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
      type: options?.type ?? "image/jpeg",
    });
  }
}
(globalThis as unknown as Record<string, unknown>).OffscreenCanvas = StubOffscreenCanvas;

/* ── Title ───────────────────────────────────────────────────────────────── */

console.log("\ntitle generation");

await check("default title matches the branded format exactly", () => {
  strictEqual(
    generateTitle(prod()),
    "90s Boom Bap | Berlin After Dark – Checkpoint Charlie | B-005",
  );
});

await check("important terms come early, episode stays near the end", () => {
  const title = generateTitle(prod());
  const genre = title.indexOf("90s Boom Bap");
  const berlin = title.indexOf("Berlin After Dark");
  const location = title.indexOf("Checkpoint Charlie");
  const episode = title.indexOf("B-005");
  ok(genre >= 0 && genre < berlin, "genre leads");
  ok(berlin < location, "Berlin before location");
  ok(location < episode, "episode after location");
  ok(title.endsWith("B-005"), "episode at the end");
});

await check("every template is deterministic and keeps the tokens", () => {
  for (const template of TITLE_TEMPLATES) {
    const title = renderTitleTemplate(template.pattern, {
      episode: "B-005",
      location: "Checkpoint Charlie",
      genre: "90s Boom Bap",
      mood: "Late Night",
      style: "Berlin Underground",
      series: "Berlin After Dark",
      city: "Berlin",
      tempo: 88,
    });
    strictEqual(title, renderTitleTemplate(template.pattern, {
      episode: "B-005",
      location: "Checkpoint Charlie",
      genre: "90s Boom Bap",
      mood: "Late Night",
      style: "Berlin Underground",
      series: "Berlin After Dark",
      city: "Berlin",
      tempo: 88,
    }));
    ok(title.includes("B-005"), `${template.id} keeps the episode`);
    ok(!/undefined|null/.test(title), `${template.id} has no placeholder leakage`);
  }
});

await check("the jazz template includes the example's literal suffix", () => {
  const title = generateTitle(prod(), "boom-bap-jazz");
  ok(title.startsWith("90s Boom Bap & Jazz Hip Hop"), title);
});

await check("an unknown template id falls back to the default", () => {
  strictEqual(generateTitle(prod(), "does-not-exist"), generateTitle(prod(), DEFAULT_TITLE_TEMPLATE_ID));
});

await check("long titles are clamped to 100 characters cleanly", () => {
  const long = prod({
    location: "Checkpoint Charlie Friedrichstrasse Kreuzberg Kottbusser Tor Neukolln",
  });
  const title = generateTitle(long);
  ok(title.length <= 100, `length ${title.length}`);
  ok(!/[\s|–]$/.test(title), "no dangling separator");
  strictEqual(clampTitle("Short title"), "Short title");
});

await check("special characters survive untouched", () => {
  const title = generateTitle(prod({ location: "Kreuzberg/Kottbusser Tor" }));
  ok(title.includes("Kreuzberg/Kottbusser Tor"), title);
});

await check("missing fields drop their clause instead of leaking", () => {
  const title = generateTitle(prod({ genre: "", location: "", mood: "" }));
  ok(!/undefined|null/.test(title) && !title.includes("\u0001"), title);
  strictEqual(title, "Berlin After Dark | B-005");
});

await check("title generation is deterministic", () => {
  strictEqual(generateTitle(prod()), generateTitle(prod()));
});

/* ── Description ─────────────────────────────────────────────────────────── */

console.log("\ndescription generation");

await check("description embeds location, genre, mood and Berlin", () => {
  const d = generateDescription(prod());
  ok(d.includes("Checkpoint Charlie"), "location");
  ok(d.includes("90s Boom Bap"), "genre");
  ok(d.toLowerCase().includes("late night"), "mood");
  ok(d.includes("Berlin"), "Berlin reference");
  ok(d.includes("88 BPM"), "tempo");
  ok(d.includes("#Berlin"), "hashtags appended");
});

await check("description contains no undefined / null leakage", () => {
  for (const p of [prod(), prod({ location: "", mood: "", style: "", tempo: null }), prod({ concept: "A midnight walk." })]) {
    const d = generateDescription(p);
    ok(!/undefined|null/.test(d), d);
  }
});

await check("description differs per episode (not one generic block)", () => {
  const a = generateDescription(prod());
  const b = generateDescription(prod({ location: "Alexanderplatz", mood: "Rainy" }));
  ok(a !== b);
});

await check("description is deterministic", () => {
  strictEqual(generateDescription(prod()), generateDescription(prod()));
});

await check(".txt body ends with a newline", () => {
  const m = resolveYouTubeMetadata(prod());
  strictEqual(buildDescriptionText(m), `${m.description}\n`);
});

/* ── Hashtags ────────────────────────────────────────────────────────────── */

console.log("\nhashtags");

await check("relevant defaults are generated", () => {
  const tags = generateHashtags(prod());
  for (const expected of ["#Berlin", "#BoomBap", "#JazzHipHop", "#InstrumentalHipHop", "#BerlinAfterDark", "#LateNight"]) {
    ok(tags.includes(expected), `${expected} missing from ${tags.join(" ")}`);
  }
  ok(tags.length <= 8, "small set");
});

await check("hashtags are unique and deterministic", () => {
  const tags = generateHashtags(prod());
  strictEqual(new Set(tags.map((t) => t.toLowerCase())).size, tags.length);
  deepStrictEqual(tags, generateHashtags(prod()));
});

await check("hashtagFromText drops leading decades and punctuation", () => {
  strictEqual(hashtagFromText("90s Boom Bap"), "BoomBap");
  strictEqual(hashtagFromText("Late Night"), "LateNight");
  strictEqual(hashtagFromText(""), "");
});

await check("hashtag override is normalized and de-duplicated", () => {
  deepStrictEqual(parseHashtagOverride("#Berlin, berlin, boom bap"), [
    "#Berlin",
    "#boom",
    "#bap",
  ]);
});

/* ── Tags ────────────────────────────────────────────────────────────────── */

console.log("\ntags");

await check("sensible keyword variations are generated", () => {
  const tags = generateTags(prod());
  for (const expected of [
    "berlin boom bap",
    "berlin hip hop",
    "90s boom bap",
    "checkpoint charlie",
    "berlin after dark",
    "instrumental hip hop",
  ]) {
    ok(tags.includes(expected), `${expected} missing from ${tags.join(", ")}`);
  }
});

await check("tags are unique and deterministic", () => {
  const tags = generateTags(prod());
  strictEqual(new Set(tags).size, tags.length);
  deepStrictEqual(tags, generateTags(prod()));
});

/* ── Thumbnail ───────────────────────────────────────────────────────────── */

console.log("\nthumbnail");

await check("thumbnail text prioritizes the location and branding", () => {
  const t = thumbnailText(prod());
  strictEqual(t.title, "CHECKPOINT CHARLIE");
  strictEqual(t.subtitle, "BERLIN AFTER DARK");
  strictEqual(t.brand, "BERLIN B TAPES");
  strictEqual(t.episode, "B-005");
  strictEqual(t.meta, "90S BOOM BAP · LATE NIGHT");
});

await check("drawThumbnail renders kicker, location, episode and brand", () => {
  const { ctx, joined } = makeCtx();
  drawThumbnail(ctx as unknown as CanvasRenderingContext2D, 1280, 720, prod());
  const text = joined();
  ok(text.includes("BERLIN AFTER DARK"), "series kicker");
  ok(text.includes("CHECKPOINT CHARLIE"), "location hook");
  ok(text.includes("B-005"), "episode badge");
  ok(text.includes("BERLIN B TAPES"), "branding");
});

await check("drawThumbnail is deterministic", () => {
  const a = makeCtx();
  const b = makeCtx();
  drawThumbnail(a.ctx as unknown as CanvasRenderingContext2D, 1280, 720, prod());
  drawThumbnail(b.ctx as unknown as CanvasRenderingContext2D, 1280, 720, prod());
  deepStrictEqual(a.calls, b.calls);
});

await check("wrapThumbnailLines breaks long locations into at most 2 lines", () => {
  const { ctx } = makeCtx();
  const lines = wrapThumbnailLines(
    ctx as unknown as CanvasRenderingContext2D,
    "CHECKPOINT CHARLIE FRIEDRICHSTRASSE KREUZBERG",
    200,
    2,
  );
  ok(lines.length === 2, `got ${lines.length} lines`);
});

await check("thumbnail export is 1280×720 JPEG", async () => {
  strictEqual(THUMBNAIL_WIDTH, 1280);
  strictEqual(THUMBNAIL_HEIGHT, 720);
  strictEqual(THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT, 16 / 9);
  const canvas = renderThumbnailCanvas(prod()) as unknown as StubOffscreenCanvas;
  strictEqual(canvas.width, 1280);
  strictEqual(canvas.height, 720);
  const blob = await thumbnailToJpegBlob(canvas as unknown as OffscreenCanvas);
  strictEqual(blob.type, "image/jpeg");
  ok(blob.size > 0);
});

/* ── Filenames / JSON ────────────────────────────────────────────────────── */

console.log("\nfilenames & metadata json");

await check("bundle filenames follow the target structure", () => {
  const names = youtubeFilenames(prod());
  strictEqual(bundleBaseName(prod()), "B-005_Checkpoint_Charlie");
  strictEqual(names.video, "B-005_Checkpoint_Charlie.mp4");
  strictEqual(names.thumbnail, "B-005_Checkpoint_Charlie_thumbnail.jpg");
  strictEqual(names.description, "B-005_Checkpoint_Charlie_description.txt");
  strictEqual(names.metadata, "B-005_Checkpoint_Charlie_metadata.json");
});

await check("filenames are deterministic and diacritic-safe", () => {
  strictEqual(bundleBaseName(prod()), bundleBaseName(prod()));
  strictEqual(slug(prod({ location: "Schöneberg" })), "B-005_Schoneberg");
});

function slug(p: YouTubeProduction): string {
  return bundleBaseName(p);
}

await check("metadata JSON is complete, parseable and stable", () => {
  const m = resolveYouTubeMetadata(prod());
  const json = buildMetadataJson(prod(), m);
  const parsed = JSON.parse(json) as Record<string, unknown>;
  strictEqual(parsed["episode"], "B-005");
  strictEqual(parsed["location"], "Checkpoint Charlie");
  strictEqual(parsed["tempo"], 88);
  const yt = parsed["youtube"] as Record<string, unknown>;
  strictEqual(yt["title"], m.title);
  ok(Array.isArray(yt["hashtags"]));
  ok(typeof yt["thumbnailTitle"] === "string");
  strictEqual(json, buildMetadataJson(prod(), m));
  ok(!/\d{4}-\d{2}-\d{2}T/.test(json), "no timestamps");
});

/* ── Location tag ────────────────────────────────────────────────────────── */

console.log("\nlocation tag");

await check("production maps to an enabled opening location tag", () => {
  const tag = productionToLocationTag(prod());
  strictEqual(tag.enabled, true);
  strictEqual(tag.episode, "B-005");
  strictEqual(tag.location, "CHECKPOINT CHARLIE");
  strictEqual(tag.city, "BERLIN");
  ok(tag.duration > 0 && tag.duration <= 10, "short opening window");
});

await check("an empty location disables the tag", () => {
  strictEqual(productionToLocationTag(prod({ location: "" })).enabled, false);
  strictEqual(productionToLocationTag(prod({ showLocationTag: false })).enabled, false);
});

/* ── Preflight ───────────────────────────────────────────────────────────── */

console.log("\npreflight");

const VALID_VIDEO: PreflightVideoInfo = {
  width: YOUTUBE_EXPORT.width,
  height: YOUTUBE_EXPORT.height,
  fps: YOUTUBE_EXPORT.fps,
  hasAudio: true,
  hasArtwork: true,
  identityPresent: true,
  ctaEnabled: true,
  ctaStart: 10,
};

function preflight(p: YouTubeProduction, overrides: { hasThumbnail?: boolean; video?: Partial<PreflightVideoInfo> } = {}) {
  return runYouTubePreflight({
    production: p,
    metadata: resolveYouTubeMetadata(p),
    hasThumbnail: overrides.hasThumbnail ?? true,
    video: { ...VALID_VIDEO, ...overrides.video },
  });
}

function findCheck(result: ReturnType<typeof runYouTubePreflight>, id: string) {
  for (const section of result.sections) {
    const found = section.checks.find((c) => c.id === id);
    if (found) return found;
  }
  return null;
}

await check("a valid project is READY with zero issues", () => {
  const result = preflight(prod());
  strictEqual(result.ready, true);
  strictEqual(result.issueCount, 0);
});

await check("missing location produces an ERROR with a fix", () => {
  const result = preflight(prod({ location: "" }));
  strictEqual(result.ready, false);
  const c = findCheck(result, "content.location")!;
  strictEqual(c.ok, false);
  ok(c.fix && c.fix.length > 0, "fix provided");
  ok(result.issueCount >= 1);
});

await check("missing genre produces an ERROR", () => {
  const result = preflight(prod({ genre: "" }));
  strictEqual(findCheck(result, "content.genre")!.ok, false);
  strictEqual(result.ready, false);
});

await check("missing episode produces an ERROR", () => {
  const result = preflight(prod({ episode: "" }));
  strictEqual(findCheck(result, "content.episode")!.ok, false);
  strictEqual(result.ready, false);
});

await check("missing title produces an ERROR", () => {
  const empty = prod({ genre: "", location: "", mood: "", style: "", episode: "", seriesName: "" });
  const result = preflight(empty);
  strictEqual(findCheck(result, "title.generated")!.ok, false);
});

await check("missing thumbnail produces an ERROR", () => {
  const result = preflight(prod(), { hasThumbnail: false });
  strictEqual(findCheck(result, "thumbnail.generated")!.ok, false);
  strictEqual(result.ready, false);
});

await check("video facts are validated (1080p / 60 / audio / intro / identity)", () => {
  strictEqual(findCheck(preflight(prod(), { video: { width: 1280 } }), "video.1080p")!.ok, false);
  strictEqual(findCheck(preflight(prod(), { video: { fps: 30 } }), "video.fps")!.ok, false);
  strictEqual(findCheck(preflight(prod(), { video: { hasAudio: false } }), "video.audio")!.ok, false);
  strictEqual(findCheck(preflight(prod(), { video: { ctaStart: 0 } }), "video.intro")!.ok, false);
  strictEqual(findCheck(preflight(prod(), { video: { identityPresent: false } }), "video.identity")!.ok, false);
});

await check("preflight is deterministic", () => {
  deepStrictEqual(preflight(prod()), preflight(prod()));
});

/* ── Determinism of the resolved model ───────────────────────────────────── */

console.log("\nresolution & determinism");

await check("identical production yields identical metadata", () => {
  deepStrictEqual(resolveYouTubeMetadata(prod()), resolveYouTubeMetadata(prod()));
});

await check("overrides replace the generated output", () => {
  const p = prod();
  p.overrides.title = "My exact title";
  const m = resolveYouTubeMetadata(p);
  strictEqual(m.title, "My exact title");
  const p2 = prod();
  p2.overrides.hashtags = "#Berlin #BoomBap";
  deepStrictEqual(resolveYouTubeMetadata(p2).hashtags, ["#Berlin", "#BoomBap"]);
});

/* ── Persistence ─────────────────────────────────────────────────────────── */

console.log("\npersistence");

function fakeStorage(initial?: string): PresetStorage {
  const raw = new Map<string, string>();
  if (initial !== undefined) raw.set(YOUTUBE_STORAGE_KEY, initial);
  return {
    getItem: (key) => (raw.has(key) ? raw.get(key)! : null),
    setItem: (key, value) => {
      raw.set(key, value);
    },
  };
}

await check("production round-trips through storage", () => {
  const storage = fakeStorage();
  const p = prod({ location: "Alexanderplatz", tempo: 92, concept: "Night walk." });
  ok(persistYouTubeProduction(p, storage));
  deepStrictEqual(loadYouTubeProduction(storage), p);
});

await check("malformed storage falls back to defaults without throwing", () => {
  deepStrictEqual(loadYouTubeProduction(fakeStorage("{ not json")), sanitizeYouTubeProduction(DEFAULT_YOUTUBE_PRODUCTION));
  deepStrictEqual(loadYouTubeProduction(null), sanitizeYouTubeProduction(DEFAULT_YOUTUBE_PRODUCTION));
});

await check("invalid values are sanitized", () => {
  const s = sanitizeYouTubeProduction({
    episode: 42,
    tempo: Number.NaN,
    titleTemplateId: "nope",
    overrides: { title: 7 },
  });
  strictEqual(s.episode, DEFAULT_YOUTUBE_PRODUCTION.episode);
  strictEqual(s.tempo, null);
  strictEqual(s.titleTemplateId, DEFAULT_TITLE_TEMPLATE_ID);
  strictEqual(s.overrides.title, "");
});

await check("serialize -> parse is stable", () => {
  const p = prod({ overrides: { ...DEFAULT_YOUTUBE_PRODUCTION.overrides, description: "Custom\n\ndescription" } });
  deepStrictEqual(parseYouTubeProduction(serializeYouTubeProduction(p)), p);
});

/* ── Codec level for 1080p60 ─────────────────────────────────────────────── */

console.log("\ncodec");

await check("1080p60 selects H.264 High Level 4.2 (and 1080p30 stays 4.0)", () => {
  ok(avcCodecStrings(1920, 1080, 60).includes("avc1.64002A"), "1080p60 → L4.2");
  ok(avcCodecStrings(1920, 1080, 30).includes("avc1.640028"), "1080p30 → L4.0");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
