/**
 * YouTube title templates for BERLIN B TAPES.
 *
 * The title format is intentionally data, not code: a template is a plain
 * string with `{token}` placeholders, so a new format can be added here without
 * touching the generator. Rendering is a pure function of the production
 * metadata, which is what makes identical inputs always produce an identical
 * title.
 *
 * Token vocabulary (resolved by `renderTitleTemplate`):
 *   {episode}  B-005
 *   {location} Checkpoint Charlie
 *   {genre}    90s Boom Bap
 *   {mood}     Late Night
 *   {style}    Berlin Underground
 *   {series}   Berlin After Dark
 *   {city}     Berlin
 *   {tempo}    88 BPM
 */

/** Hard YouTube limit for the video title. */
export const YOUTUBE_TITLE_MAX = 100;

export interface TitleTemplate {
  id: string;
  /** Shown in the template picker. */
  name: string;
  pattern: string;
}

/**
 * Ordered list of shipped templates. The first entry is the default and stays
 * consistent with the existing "Berlin After Dark" branding: the genre leads
 * (search/context term near the front), Berlin stays prominent, and the episode
 * id sits at the end.
 */
export const TITLE_TEMPLATES: TitleTemplate[] = [
  {
    id: "genre-first",
    name: "Genre first",
    pattern: "{genre} | {series} – {location} | {episode}",
  },
  {
    id: "series-first",
    name: "Series first",
    pattern: "{series} | {genre} – {location} | {episode}",
  },
  {
    id: "boom-bap-jazz",
    name: "Boom bap & jazz hip hop",
    pattern: "{genre} & Jazz Hip Hop | {series} – {location} | {episode}",
  },
  {
    id: "genre-mood",
    name: "Genre & mood",
    pattern: "{genre} – {mood} | {series} – {location} | {episode}",
  },
  {
    id: "location-first",
    name: "Location first",
    pattern: "{series} – {location} | {genre} | {episode}",
  },
];

export const DEFAULT_TITLE_TEMPLATE_ID = TITLE_TEMPLATES[0]!.id;

export function findTitleTemplate(id: string): TitleTemplate | null {
  return TITLE_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Sentinel used internally to mark a placeholder that resolved to nothing. */
const MISSING = "\u0001";

/** Values a template renders against. A null/empty value drops its clause. */
export interface TitleValues {
  episode?: string | null;
  location?: string | null;
  genre?: string | null;
  mood?: string | null;
  style?: string | null;
  series?: string | null;
  city?: string | null;
  tempo?: number | null;
}

/** Collapse whitespace and strip dangling separators from a fragment. */
export function tidyFragment(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s&|–,+-]+/, "")
    .replace(/[\s&|–,+-]+$/, "")
    .trim();
}

function tokenToText(key: string, values: TitleValues): string {
  if (key === "tempo") {
    const tempo = values.tempo;
    return typeof tempo === "number" && Number.isFinite(tempo) && tempo > 0
      ? `${Math.round(tempo)} BPM`
      : "";
  }
  const raw = values[key as keyof TitleValues];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Render one `|`-separated clause.
 *
 * Clauses are further split on a *spaced* en-dash/hyphen so an optional part
 * ("Berlin After Dark – {location}") can drop cleanly when its token is empty.
 * Splitting happens before substitution, so a value that itself contains a
 * hyphen ("Checkpoint-Charlie") is never torn apart.
 */
function renderClause(clause: string, values: TitleValues): string {
  const parts = clause.split(/\s+[–-]\s+/);
  const rendered: string[] = [];
  for (const part of parts) {
    const replaced = part.replace(/\{(\w+)\}/g, (_match, key: string) => {
      const text = tokenToText(key, values);
      return text || MISSING;
    });
    if (replaced.includes(MISSING)) continue;
    const tidy = tidyFragment(replaced);
    if (tidy) rendered.push(tidy);
  }
  return rendered.join(" – ");
}

/**
 * Clamp a generated title to YouTube's limit.
 *
 * Short titles pass through untouched. Longer ones drop trailing `|` clauses
 * (keeping the leading keyword clause) before falling back to a hard cut, then
 * tidy any dangling separator/partial punctuation.
 */
export function clampTitle(title: string, max = YOUTUBE_TITLE_MAX): string {
  const clean = tidyFragment(title);
  if (clean.length <= max) return clean;
  const clauses = clean.split(" | ");
  while (clauses.length > 1 && clauses.join(" | ").length > max) clauses.pop();
  let out = clauses.join(" | ");
  if (out.length > max) out = out.slice(0, max);
  return tidyFragment(out);
}

/** Deterministic title for a template id + values. */
export function renderTitleTemplate(pattern: string, values: TitleValues): string {
  const clauses = pattern
    .split("|")
    .map((clause) => renderClause(clause, values))
    .filter((clause) => clause.length > 0);
  return clampTitle(clauses.join(" | "));
}
