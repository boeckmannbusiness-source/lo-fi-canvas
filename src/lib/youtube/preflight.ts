/**
 * Deterministic YouTube preflight validation.
 *
 * Pure: given the production metadata, the resolved YouTube metadata, the
 * thumbnail state and the actual export/encoding facts, it returns the exact
 * checklist the UI renders. Every failed rule carries a concrete fix, so the
 * user always knows what to change before exporting.
 */
import type { YouTubeMetadata, YouTubeProduction } from "./production";
import { YOUTUBE_EXPORT } from "./export-profile";

export const YOUTUBE_MAX_TITLE_LENGTH = 100;
/** The YouTube export profile the checks target. */
export const YOUTUBE_TARGET_WIDTH = YOUTUBE_EXPORT.width;
export const YOUTUBE_TARGET_HEIGHT = YOUTUBE_EXPORT.height;
export const YOUTUBE_TARGET_FPS = YOUTUBE_EXPORT.fps;
/** A CTA that starts earlier than this is treated as an unnecessary intro. */
export const INTRO_GRACE_SECONDS = 3;

export interface PreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  /** What was checked / why it passed or failed. */
  detail: string | null;
  /** What to do about a failure. */
  fix: string | null;
}

export interface PreflightSection {
  id: string;
  title: string;
  checks: PreflightCheck[];
}

export interface PreflightVideoInfo {
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  hasArtwork: boolean;
  /** A frame / identity element is enabled in the active settings. */
  identityPresent: boolean;
  ctaEnabled: boolean;
  ctaStart: number;
}

export interface PreflightInput {
  production: YouTubeProduction;
  metadata: YouTubeMetadata;
  /** The dedicated thumbnail was generated (canvas + text). */
  hasThumbnail: boolean;
  video: PreflightVideoInfo;
}

export interface PreflightResult {
  sections: PreflightSection[];
  issueCount: number;
  ready: boolean;
}

function check(
  id: string,
  label: string,
  ok: boolean,
  detail: string,
  fix: string,
): PreflightCheck {
  return { id, label, ok, detail: ok ? detail : null, fix: ok ? null : fix };
}

function contains(haystack: string, needle: string): boolean {
  if (!needle.trim()) return false;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

/** First meaningful word of a genre, used as the "main keyword" probe. */
function mainGenreKeyword(genre: string): string {
  const cleaned = genre
    .replace(/^\d{2,4}s?\s+/, "")
    .split(/\s+/)
    .find((word) => word.length >= 3);
  return cleaned ?? genre.trim();
}

export function runYouTubePreflight(input: PreflightInput): PreflightResult {
  const { production, metadata, hasThumbnail, video } = input;
  const location = metadata.location.trim();
  const genre = metadata.genre.trim();
  const mood = metadata.mood.trim();
  const episode = metadata.episode.trim();
  const title = metadata.title.trim();
  const description = metadata.description.trim();
  const keyword = mainGenreKeyword(genre);

  const content: PreflightCheck[] = [
    check(
      "content.location",
      "Location defined",
      location.length > 0,
      `Location: ${location}`,
      "Enter the episode location in the production metadata.",
    ),
    check(
      "content.genre",
      "Genre defined",
      genre.length > 0,
      `Genre: ${genre}`,
      "Enter a genre so the title and description can describe the music.",
    ),
    check(
      "content.mood",
      "Mood defined",
      mood.length > 0,
      `Mood: ${mood}`,
      "Enter a mood for the episode.",
    ),
    check(
      "content.episode",
      "Episode defined",
      episode.length > 0,
      `Episode: ${episode}`,
      "Give this episode an id (for example B-005).",
    ),
  ];

  const titleChecks: PreflightCheck[] = [
    check(
      "title.generated",
      "Title generated",
      title.length > 0,
      `“${title}”`,
      "Title is empty — check the production metadata or the title override.",
    ),
    check(
      "title.keyword",
      "Main keyword present",
      title.length > 0 && contains(title, keyword),
      `“${keyword}” appears in the title`,
      `Include the genre keyword “${keyword || "genre"}” in the title.`,
    ),
    check(
      "title.location",
      "Location present",
      location.length > 0 && contains(title, location),
      `“${location}” appears in the title`,
      "Add the location to the title template or override the title.",
    ),
    check(
      "title.episode",
      "Episode ID present",
      episode.length > 0 && contains(title, episode),
      `“${episode}” appears in the title`,
      "Add the episode id (usually at the end) to the title.",
    ),
    check(
      "title.length",
      "Under 100 characters",
      title.length > 0 && title.length <= YOUTUBE_MAX_TITLE_LENGTH,
      `${title.length} / ${YOUTUBE_MAX_TITLE_LENGTH} characters`,
      `Shorten the title to ${YOUTUBE_MAX_TITLE_LENGTH} characters or fewer.`,
    ),
  ];

  const descriptionChecks: PreflightCheck[] = [
    check(
      "description.generated",
      "Description generated",
      description.length > 0,
      `${description.length} characters`,
      "Description is empty — regenerate or clear the override.",
    ),
    check(
      "description.location",
      "Location included",
      location.length > 0 && contains(description, location),
      `“${location}” is referenced`,
      "Include the location in the description.",
    ),
    check(
      "description.genre",
      "Genre included",
      genre.length > 0 && contains(description, genre),
      `“${genre}” is referenced`,
      "Include the genre in the description.",
    ),
    check(
      "description.berlin",
      "Berlin reference included",
      contains(description, "berlin"),
      "A Berlin reference is present",
      "Add a Berlin reference to the description.",
    ),
    check(
      "description.hashtags",
      "Hashtags generated",
      metadata.hashtags.length > 0,
      `${metadata.hashtags.length} hashtags`,
      "Generate at least one relevant hashtag.",
    ),
  ];

  const thumbnailChecks: PreflightCheck[] = [
    check(
      "thumbnail.generated",
      "Thumbnail generated",
      hasThumbnail,
      "A dedicated 1280×720 thumbnail is ready",
      "Generate the thumbnail before exporting.",
    ),
    check(
      "thumbnail.text",
      "Thumbnail text available",
      metadata.thumbnailTitle.trim().length > 0 && metadata.thumbnailSubtitle.trim().length > 0,
      "Thumbnail text is available",
      "The thumbnail needs a title and a series line.",
    ),
    check(
      "thumbnail.location",
      "Location available",
      location.length > 0 && contains(metadata.thumbnailTitle, location),
      `“${metadata.thumbnailTitle}” is readable`,
      "Add the location so the thumbnail has a visual hook.",
    ),
    check(
      "thumbnail.branding",
      "Branding present",
      metadata.thumbnailSubtitle.trim().length > 0,
      `“${metadata.thumbnailSubtitle}” branding is present`,
      "Keep the Berlin B Tapes series branding on the thumbnail.",
    ),
  ];

  const introOk = video.hasArtwork && (!video.ctaEnabled || video.ctaStart >= INTRO_GRACE_SECONDS);
  const videoChecks: PreflightCheck[] = [
    check(
      "video.1080p",
      "1080p",
      video.width === YOUTUBE_TARGET_WIDTH && video.height === YOUTUBE_TARGET_HEIGHT,
      `${video.width}×${video.height}`,
      "Export the YouTube profile at 1920×1080.",
    ),
    check(
      "video.fps",
      "60 FPS",
      video.fps === YOUTUBE_TARGET_FPS,
      `${video.fps} fps`,
      "Export the YouTube profile at 60 fps.",
    ),
    check(
      "video.audio",
      "Audio available",
      video.hasAudio,
      "An audio track is loaded",
      "Load an MP3 or WAV track before exporting.",
    ),
    check(
      "video.intro",
      "No unnecessary intro",
      introOk,
      "The video opens straight into the artwork and music",
      "Add artwork and move the call to action past the first 3 seconds.",
    ),
    check(
      "video.identity",
      "Identity present",
      video.identityPresent,
      "Berlin B Tapes identity is active",
      "Keep the frame / identity elements enabled.",
    ),
  ];

  const sections: PreflightSection[] = [
    { id: "content", title: "Content", checks: content },
    { id: "title", title: "Title", checks: titleChecks },
    { id: "description", title: "Description", checks: descriptionChecks },
    { id: "thumbnail", title: "Thumbnail", checks: thumbnailChecks },
    { id: "video", title: "Video", checks: videoChecks },
  ];

  const issueCount = sections.reduce(
    (sum, section) => sum + section.checks.filter((c) => !c.ok).length,
    0,
  );

  // `production` is accepted for API symmetry / future rules; reference it so
  // the intent is explicit and the parameter is never silently unused.
  void production;

  return { sections, issueCount, ready: issueCount === 0 };
}
