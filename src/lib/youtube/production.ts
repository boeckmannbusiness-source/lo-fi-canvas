/**
 * BERLIN B TAPES — YouTube production metadata.
 *
 * One typed model for everything a YouTube episode needs:
 *
 *   production inputs (episode / location / genre / mood / style / tempo)
 *        │  pure, deterministic generators
 *        ▼
 *   title · description · hashtags · tags · thumbnail text · filenames · JSON
 *
 * The production inputs are the single source of truth. Every derived artifact
 * is a pure function of them, so identical inputs always produce identical
 * output (no timestamps, no randomness, no network).
 *
 * A user may still override a generated title/description/hashtags/tags. An
 * override is stored separately and used verbatim; clearing it falls straight
 * back to the deterministic generator.
 */
import type { LocationTagConfig } from "../viz/types";
import {
  DEFAULT_TITLE_TEMPLATE_ID,
  clampTitle,
  findTitleTemplate,
  renderTitleTemplate,
  type TitleValues,
} from "./templates";

export const YOUTUBE_PRODUCTION_VERSION = 1;

/** Editable overrides of the generated artifacts. Empty string = generated. */
export interface YouTubeOverrides {
  title: string;
  description: string;
  hashtags: string;
  tags: string;
}

/** The persisted, single-source-of-truth production configuration. */
export interface YouTubeProduction {
  version: number;
  episode: string;
  location: string;
  genre: string;
  mood: string;
  style: string;
  /** BPM, or null when not provided. */
  tempo: number | null;
  /** Optional concept / theme line. */
  concept: string;
  /** Series branding used in titles. */
  seriesName: string;
  titleTemplateId: string;
  /** Subtle opening-seconds location tag in the exported video. */
  showLocationTag: boolean;
  overrides: YouTubeOverrides;
}

/** Fully resolved metadata: production inputs + generated/overridden outputs. */
export interface YouTubeMetadata {
  episode: string;
  location: string;
  genre: string;
  mood: string;
  style: string;
  tempo: number | null;
  concept: string;
  seriesName: string;
  title: string;
  description: string;
  hashtags: string[];
  tags: string[];
  thumbnailTitle: string;
  thumbnailSubtitle: string;
}

/** Defaults match the canonical "B-005 / Checkpoint Charlie" episode. */
export const DEFAULT_YOUTUBE_PRODUCTION: YouTubeProduction = {
  version: YOUTUBE_PRODUCTION_VERSION,
  episode: "B-005",
  location: "Checkpoint Charlie",
  genre: "90s Boom Bap",
  mood: "Late Night",
  style: "Berlin Underground",
  tempo: 88,
  concept: "",
  seriesName: "Berlin After Dark",
  titleTemplateId: DEFAULT_TITLE_TEMPLATE_ID,
  showLocationTag: true,
  overrides: { title: "", description: "", hashtags: "", tags: "" },
};

/* ── Small pure helpers ──────────────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Collapse runs of whitespace (used by the generators). */
function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Trim only — preserves internal newlines (used for user overrides). */
function plain(value: string): string {
  return value.replace(/^\s+|\s+$/g, "");
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** Punctuation-insensitive substring test. */
function has(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/* ── Title ───────────────────────────────────────────────────────────────── */

/** Values a title template renders against. */
export function titleValues(p: YouTubeProduction): TitleValues {
  return {
    episode: p.episode,
    location: p.location,
    genre: p.genre,
    mood: p.mood,
    style: p.style,
    series: p.seriesName,
    city: "Berlin",
    tempo: p.tempo,
  };
}

/** Deterministic title. Identical production → identical title. */
export function generateTitle(p: YouTubeProduction, templateId = p.titleTemplateId): string {
  const template =
    findTitleTemplate(templateId) ?? findTitleTemplate(DEFAULT_TITLE_TEMPLATE_ID)!;
  return renderTitleTemplate(template.pattern, titleValues(p));
}

/* ── Hashtags ────────────────────────────────────────────────────────────── */

/** "90s Boom Bap" → "BoomBap"; strips numeric-only words and punctuation. */
export function hashtagFromText(text: string): string {
  const words = text
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !/^\d/.test(word));
  if (words.length === 0) return "";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

const HIP_HOP = /hip[\s-]?hop|boom[\s-]?bap|\brap\b|\btrap\b|lo[\s-]?fi/;

/** A small, relevant, duplicate-free hashtag set. Deterministic. */
export function generateHashtags(p: YouTubeProduction): string[] {
  const tags: string[] = ["Berlin"];

  const genreSlug = hashtagFromText(p.genre);
  if (genreSlug) tags.push(genreSlug);

  const genreLc = p.genre.toLowerCase();
  const hipHop = HIP_HOP.test(genreLc);
  if (hipHop && /jazz|boom[\s-]?bap/.test(genreLc)) tags.push("JazzHipHop");
  if (hipHop) tags.push("InstrumentalHipHop");

  const moodSlug = hashtagFromText(p.mood);
  if (moodSlug) tags.push(moodSlug);

  const styleSlug = hashtagFromText(p.style);
  if (styleSlug) tags.push(styleSlug);

  tags.push("BerlinAfterDark");

  return dedupe(tags)
    .slice(0, 8)
    .map((tag) => `#${tag}`);
}

/** Parse a user hashtag override ("#Berlin, boom bap") into a clean list. */
export function parseHashtagOverride(raw: string): string[] {
  const parts = raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith("#") ? part : `#${part}`));
  return dedupe(parts).slice(0, 12);
}

/* ── Tags ────────────────────────────────────────────────────────────────── */

/** "90s Boom Bap" → "boom bap" (drops a leading decade). */
function genreKeyword(genre: string): string {
  const stripped = genre.toLowerCase().replace(/^\d{2,4}s?\s+/, "").trim();
  return stripped || genre.toLowerCase().trim();
}

/** Optional traditional tags: keyword variations, never stuffing. */
export function generateTags(p: YouTubeProduction): string[] {
  const loc = p.location.toLowerCase().trim();
  const genre = p.genre.toLowerCase().trim();
  const mood = p.mood.toLowerCase().trim();
  const keyword = genreKeyword(genre);
  const hipHop = HIP_HOP.test(genre);

  const candidates = [
    "berlin",
    keyword ? `berlin ${keyword}` : "",
    hipHop ? "berlin hip hop" : "",
    genre,
    hipHop ? "jazz hip hop instrumental" : "",
    loc,
    loc ? `${loc} berlin` : "",
    "berlin after dark",
    "berlin beats",
    hipHop ? "instrumental hip hop" : "",
    mood ? `berlin ${mood}` : "",
    keyword,
  ];

  return dedupe(candidates.map(clean)).slice(0, 12);
}

/** Parse a user tag override (newline or comma separated). */
export function parseTagsOverride(raw: string): string[] {
  return dedupe(
    raw
      .split(/[\n,]+/)
      .map(clean)
      .filter(Boolean),
  ).slice(0, 30);
}

/* ── Description ─────────────────────────────────────────────────────────── */

/**
 * A per-episode description built from the metadata. Location, genre and mood
 * always vary the output, so two episodes never share a generic paragraph.
 */
export function generateDescription(p: YouTubeProduction): string {
  const location = clean(p.location);
  const genre = clean(p.genre);
  const mood = clean(p.mood);
  const style = clean(p.style);
  const concept = clean(p.concept);
  const tempo = typeof p.tempo === "number" && p.tempo > 0 ? Math.round(p.tempo) : null;
  const hashtags = generateHashtags(p);

  const moodWord = mood ? mood.toLowerCase() : "late-night";
  const genreWord = genre || "instrumental hip hop";
  const intro = location
    ? `${location} after dark — a ${moodWord} instrumental mix blending ${genreWord} with Berlin night-walk textures.`
    : `A ${moodWord} instrumental mix blending ${genreWord} with Berlin night-walk textures.`;

  const info = [
    "🎧 Berlin B Tapes",
    location ? `📍 ${location} · Berlin` : "📍 Berlin",
    `🎵 ${genreWord}${tempo ? ` · ${tempo} BPM` : ""}`,
    `🌃 ${mood || "Late Night"}${style ? ` · ${style}` : ""}`,
  ].join("\n");

  const perfectFor = [
    "Perfect for:",
    "• late night listening",
    "• studying & deep work",
    "• coding",
    "• night drives",
    "• relaxing",
  ].join("\n");

  const sections = [intro, info];
  if (concept) sections.push(concept);
  sections.push(perfectFor);
  sections.push(hashtags.join(" "));

  return sections.join("\n\n");
}

/* ── Thumbnail text ──────────────────────────────────────────────────────── */

export interface ThumbnailText {
  /** Dominant line: the location / visual hook. */
  title: string;
  /** Kicker line: the series. */
  subtitle: string;
  /** Small branding line. */
  brand: string;
  /** Corner episode badge. */
  episode: string;
  /** Optional secondary context (genre · mood). */
  meta: string;
}

export function thumbnailText(p: YouTubeProduction): ThumbnailText {
  const location = clean(p.location).toUpperCase();
  const series = clean(p.seriesName).toUpperCase();
  const meta = [clean(p.genre), clean(p.mood)].filter(Boolean).join(" · ").toUpperCase();
  return {
    title: location || series || "BERLIN B TAPES",
    subtitle: series || "BERLIN AFTER DARK",
    brand: "BERLIN B TAPES",
    episode: clean(p.episode).toUpperCase(),
    meta,
  };
}

/* ── Resolution (generated + overrides) ──────────────────────────────────── */

export function resolveYouTubeMetadata(p: YouTubeProduction): YouTubeMetadata {
  const titleOverride = clean(p.overrides.title);
  const descriptionOverride = plain(p.overrides.description);
  const hashtagOverride = plain(p.overrides.hashtags);
  const tagOverride = plain(p.overrides.tags);
  const th = thumbnailText(p);

  return {
    episode: clean(p.episode),
    location: clean(p.location),
    genre: clean(p.genre),
    mood: clean(p.mood),
    style: clean(p.style),
    tempo: typeof p.tempo === "number" && p.tempo > 0 ? Math.round(p.tempo) : null,
    concept: clean(p.concept),
    seriesName: clean(p.seriesName),
    title: titleOverride ? clampTitle(titleOverride) : generateTitle(p),
    description: descriptionOverride || generateDescription(p),
    hashtags: hashtagOverride ? parseHashtagOverride(hashtagOverride) : generateHashtags(p),
    tags: tagOverride ? parseTagsOverride(tagOverride) : generateTags(p),
    thumbnailTitle: th.title,
    thumbnailSubtitle: th.subtitle,
  };
}

/* ── Video overlay / filenames / JSON ────────────────────────────────────── */

/** The subtle opening-seconds location tag fed into the export renderer. */
export function productionToLocationTag(p: YouTubeProduction): LocationTagConfig {
  return {
    enabled: p.showLocationTag && clean(p.location).length > 0,
    episode: clean(p.episode),
    location: clean(p.location).toUpperCase(),
    city: "BERLIN",
    startTime: 0,
    duration: 7,
  };
}

/** "Checkpoint Charlie" → "Checkpoint_Charlie" (diacritics stripped). */
export function slugifyWords(value: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const words = normalized
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("_");
}

function slugifyEpisode(episode: string): string {
  const cleaned = episode
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "Episode";
}

/** "B-005_Checkpoint_Charlie" */
export function bundleBaseName(p: YouTubeProduction): string {
  const location = slugifyWords(p.location) || "Berlin";
  return `${slugifyEpisode(p.episode)}_${location}`;
}

export interface YouTubeFilenames {
  base: string;
  video: string;
  thumbnail: string;
  description: string;
  metadata: string;
}

export function youtubeFilenames(p: YouTubeProduction): YouTubeFilenames {
  const base = bundleBaseName(p);
  return {
    base,
    video: `${base}.mp4`,
    thumbnail: `${base}_thumbnail.jpg`,
    description: `${base}_description.txt`,
    metadata: `${base}_metadata.json`,
  };
}

/** Reproducible production record. No timestamps, no environment data. */
export function buildMetadataJson(_p: YouTubeProduction, m: YouTubeMetadata): string {
  const payload = {
    episode: m.episode,
    location: m.location,
    genre: m.genre,
    mood: m.mood,
    style: m.style,
    tempo: m.tempo,
    concept: m.concept,
    series: m.seriesName,
    youtube: {
      title: m.title,
      description: m.description,
      hashtags: m.hashtags,
      tags: m.tags,
      thumbnailTitle: m.thumbnailTitle,
      thumbnailSubtitle: m.thumbnailSubtitle,
    },
  };
  return JSON.stringify(payload, null, 2);
}

/** The description as a downloadable plain-text file body. */
export function buildDescriptionText(m: YouTubeMetadata): string {
  return `${m.description}\n`;
}

/* ── Validation ──────────────────────────────────────────────────────────── */

function sanitizeTempo(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) return null;
  return Math.min(400, Math.round(input));
}

/** Coerce arbitrary input into a complete, valid production. Never throws. */
export function sanitizeYouTubeProduction(input: unknown): YouTubeProduction {
  const record = isRecord(input) ? input : {};
  const overrides = isRecord(record["overrides"]) ? record["overrides"] : {};
  const templateId =
    typeof record["titleTemplateId"] === "string" ? record["titleTemplateId"] : "";

  return {
    version: YOUTUBE_PRODUCTION_VERSION,
    episode: typeof record["episode"] === "string" ? clean(record["episode"]) : DEFAULT_YOUTUBE_PRODUCTION.episode,
    location:
      typeof record["location"] === "string" ? clean(record["location"]) : DEFAULT_YOUTUBE_PRODUCTION.location,
    genre: typeof record["genre"] === "string" ? clean(record["genre"]) : DEFAULT_YOUTUBE_PRODUCTION.genre,
    mood: typeof record["mood"] === "string" ? clean(record["mood"]) : DEFAULT_YOUTUBE_PRODUCTION.mood,
    style: typeof record["style"] === "string" ? clean(record["style"]) : DEFAULT_YOUTUBE_PRODUCTION.style,
    tempo: "tempo" in record ? sanitizeTempo(record["tempo"]) : DEFAULT_YOUTUBE_PRODUCTION.tempo,
    concept:
      typeof record["concept"] === "string" ? clean(record["concept"]) : DEFAULT_YOUTUBE_PRODUCTION.concept,
    seriesName:
      typeof record["seriesName"] === "string" && clean(record["seriesName"])
        ? clean(record["seriesName"])
        : DEFAULT_YOUTUBE_PRODUCTION.seriesName,
    titleTemplateId:
      findTitleTemplate(templateId)?.id ?? DEFAULT_TITLE_TEMPLATE_ID,
    showLocationTag:
      typeof record["showLocationTag"] === "boolean"
        ? record["showLocationTag"]
        : DEFAULT_YOUTUBE_PRODUCTION.showLocationTag,
    overrides: {
      title: typeof overrides["title"] === "string" ? plain(overrides["title"]) : "",
      description: typeof overrides["description"] === "string" ? plain(overrides["description"]) : "",
      hashtags: typeof overrides["hashtags"] === "string" ? plain(overrides["hashtags"]) : "",
      tags: typeof overrides["tags"] === "string" ? plain(overrides["tags"]) : "",
    },
  };
}
