/**
 * Font loading system for Canvas rendering.
 * Loads Google Fonts via FontFace API so canvas.fillText renders them consistently.
 */

type FontFamilyKey =
  | "Inter"
  | "Space Grotesk"
  | "Oswald"
  | "IBM Plex Mono"
  | "Playfair Display"
  | "Bebas Neue";

const FONT_URLS: Record<FontFamilyKey, string> = {
  Inter: "https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap",
  "Space Grotesk": "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap",
  Oswald: "https://fonts.googleapis.com/css2?family=Oswald:wght@200;300;400;500;600;700&display=swap",
  "IBM Plex Mono": "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@100;200;300;400;500;600;700&display=swap",
  "Playfair Display": "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800;900&display=swap",
  "Bebas Neue": "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap",
};

/** Available weights per custom font family. */
const FONT_WEIGHTS: Record<FontFamilyKey, number[]> = {
  Inter: [100, 200, 300, 400, 500, 600, 700, 800, 900],
  "Space Grotesk": [300, 400, 500, 600, 700],
  Oswald: [200, 300, 400, 500, 600, 700],
  "IBM Plex Mono": [100, 200, 300, 400, 500, 600, 700],
  "Playfair Display": [400, 500, 600, 700, 800, 900],
  "Bebas Neue": [400],
};

let fontsLoaded = false;
let fontsPromise: Promise<void> | null = null;

/** Check if a font family is one of our bundled custom fonts. */
export function isCustomFont(family: string): boolean {
  return family in FONT_URLS;
}

/** Resolve the closest available weight for a given font family. */
export function resolveWeight(family: string, desired: number): number {
  if (!isCustomFont(family)) return desired;
  const available = FONT_WEIGHTS[family as FontFamilyKey];
  if (!available) return desired;
  if (available.includes(desired)) return desired;
  // Find closest
  let best = available[0]!;
  let bestDiff = Math.abs(desired - best);
  for (const w of available) {
    const diff = Math.abs(desired - w);
    if (diff < bestDiff) {
      best = w;
      bestDiff = diff;
    }
  }
  return best;
}

/** Build a canvas font-family CSS string for the given family key. */
export function resolveFontFamily(family: string): string {
  if (isCustomFont(family)) {
    return `'${family}', sans-serif`;
  }
  // System fonts
  const systemMap: Record<string, string> = {
    "System Sans": "Arial, Helvetica, sans-serif",
    "System Serif": "Georgia, 'Times New Roman', serif",
    "System Mono": "'Courier New', Courier, monospace",
  };
  return systemMap[family] || `${family}, sans-serif`;
}

/** Fetch and register a Google Font for Canvas use. */
async function loadGoogleFont(family: FontFamilyKey): Promise<void> {
  try {
    const url = FONT_URLS[family];
    const res = await fetch(url);
    const css = await res.text();
    // Parse @font-face blocks to extract font URLs
    const fontFaceRegex = /@font-face\s*\{[^}]*src:\s*url\(([^)]+)\)/g;
    let match;
    while ((match = fontFaceRegex.exec(css)) !== null) {
      const fontUrl = match[1];
      if (!fontUrl) continue;
      // Determine weight from the CSS block
      const block = css.substring(match.index, css.indexOf("}", match.index));
      const weightMatch = block.match(/font-weight:\s*(\d+)/);
      const weight = weightMatch?.[1] ? parseInt(weightMatch[1], 10) : 400;
      const fontFace = new FontFace(family, `url(${fontUrl})`, {
        weight: String(weight),
        style: "normal",
      });
      await fontFace.load();
      document.fonts.add(fontFace);
    }
  } catch {
    // Graceful degradation — system fonts will be used as fallback
    console.warn(`Failed to load font: ${family}`);
  }
}

/** Load all custom fonts. Safe to call multiple times. */
export async function loadFonts(): Promise<void> {
  if (fontsLoaded) return;
  if (fontsPromise) return fontsPromise;

  fontsPromise = (async () => {
    const families = Object.keys(FONT_URLS) as FontFamilyKey[];
    await Promise.allSettled(families.map(loadGoogleFont));
    fontsLoaded = true;
  })();

  return fontsPromise;
}

/** Check if fonts have been loaded. */
export function areFontsLoaded(): boolean {
  return fontsLoaded;
}
