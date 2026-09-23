/**
 * Focused checks for the user-preset persistence layer.
 *
 * Pure + storage-injectable, so it runs headlessly against a fake storage:
 *   bun scripts/presets-check.ts
 *
 * Covers save / load / list / delete, malformed storage, missing fields,
 * version handling, defaults-on-load, and that loading never mutates
 * `defaultSettings`.
 */
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import {
  DEFAULT_PORTRAIT_DURATION,
  PRESETS_STORAGE_KEY,
  PRESET_VERSION,
  capturePresetSettings,
  deletePreset,
  loadPresets,
  makeStoredPreset,
  parseStoredPresets,
  persistPresets,
  removeStoredPreset,
  sanitizePresetSettings,
  savePreset,
  serializeStoredPresets,
  upsertStoredPreset,
  type PresetStorage,
  type StoredPreset,
} from "../src/lib/presets.ts";
import { defaultSettings, type Settings } from "../src/lib/viz/types.ts";

/** In-memory storage that satisfies the `PresetStorage` contract. */
function fakeStorage(initial?: string): PresetStorage & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  if (initial !== undefined) raw.set(PRESETS_STORAGE_KEY, initial);
  return {
    raw,
    getItem: (key: string) => (raw.has(key) ? raw.get(key)! : null),
    setItem: (key: string, value: string) => {
      raw.set(key, value);
    },
  };
}

/** A distinctive non-default configuration to prove fields survive. */
function colorfulSettings(): Settings {
  const s = defaultSettings();
  s.camera = { move: "zoom-out", amount: 0.05, driftX: 0.33, driftY: 0.11 };
  s.background = { fit: "contain", vignette: 0.2, warmth: 0.3, focusY: 0.25 };
  s.vinyl.enabled = false;
  s.vinyl.position = "top-left";
  s.grain.intensity = 0.19;
  s.rain.enabled = true;
  s.visualizer.enabled = true;
  s.visualizer.type = "stereo";
  s.visualizer.colorPreset = "red";
  s.visualizer.placement = "frame";
  s.visualizer.frameBand = "top";
  s.text.enabled = true;
  s.text.title = "BLACKTOP";
  s.text.fontFamily = "Bebas Neue";
  s.frame.preset = "muted-red";
  s.frame.color = "#8E3B34";
  s.cta.enabled = false;
  s.cta.position = "center";
  s.cta.size = 1.4;
  return s;
}

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}\n       ${(error as Error).message}`);
  }
}

console.log("\nstorage");

check("save preset trims the name and captures format + duration", () => {
  const storage = fakeStorage();
  const captured = capturePresetSettings(colorfulSettings(), "portrait", 45);
  const result = savePreset("  Blacktop – Red Frame  ", captured, storage);
  ok(result, "save returned a result");
  strictEqual(result!.preset.name, "Blacktop – Red Frame");
  strictEqual(result!.preset.settings.formatId, "portrait");
  strictEqual(result!.preset.settings.portraitDuration, 45);
  strictEqual(result!.presets.length, 1);
  ok(result!.preset.createdAt.length > 0 && result!.preset.updatedAt.length > 0);
});

check("list / load preset round-trips every creative field", () => {
  const storage = fakeStorage();
  const captured = capturePresetSettings(colorfulSettings(), "portrait", 45);
  savePreset("Blacktop", captured, storage);

  const loaded = loadPresets(storage);
  strictEqual(loaded.length, 1);
  deepStrictEqual(loaded[0]!.settings, captured);
  strictEqual(loaded[0]!.settings.settings.text.title, "BLACKTOP");
  strictEqual(loaded[0]!.settings.settings.visualizer.frameBand, "top");
});

check("multiple presets are listed in insertion order", () => {
  const storage = fakeStorage();
  savePreset("One", capturePresetSettings(colorfulSettings(), "landscape", 30), storage);
  savePreset("Two", capturePresetSettings(defaultSettings(), "portrait", 15), storage);
  const loaded = loadPresets(storage);
  strictEqual(loaded.length, 2);
  strictEqual(loaded[0]!.name, "One");
  strictEqual(loaded[1]!.name, "Two");
  ok(loaded[0]!.id !== loaded[1]!.id, "ids are unique");
});

check("delete removes only the target preset", () => {
  const storage = fakeStorage();
  const a = savePreset(
    "Keep me",
    capturePresetSettings(defaultSettings(), "landscape", 30),
    storage,
  )!;
  const b = savePreset(
    "Delete me",
    capturePresetSettings(defaultSettings(), "portrait", 20),
    storage,
  )!;
  const next = deletePreset(b.preset.id, storage);
  ok(next, "delete returned the updated list");
  strictEqual(next!.length, 1);
  strictEqual(next![0]!.id, a.preset.id);
  strictEqual(loadPresets(storage).length, 1);
});

check("deleting a missing id is a harmless no-op", () => {
  const storage = fakeStorage();
  savePreset("Only", capturePresetSettings(defaultSettings(), "landscape", 30), storage);
  const next = deletePreset("does-not-exist", storage);
  strictEqual(next!.length, 1);
});

check("blank names are rejected without touching storage", () => {
  const storage = fakeStorage();
  const result = savePreset(
    "   ",
    capturePresetSettings(defaultSettings(), "landscape", 30),
    storage,
  );
  strictEqual(result, null);
  strictEqual(loadPresets(storage).length, 0);
});

check("malformed storage never throws", () => {
  strictEqual(loadPresets(fakeStorage("{ this is not json")).length, 0);
  strictEqual(loadPresets(fakeStorage("42")).length, 0);
  strictEqual(loadPresets(fakeStorage('"a string"')).length, 0);
  strictEqual(loadPresets(fakeStorage("null")).length, 0);
  strictEqual(loadPresets(fakeStorage(JSON.stringify([1, 2, "three", null]))).length, 0);
});

check("unavailable storage degrades gracefully", () => {
  strictEqual(loadPresets(null).length, 0);
  strictEqual(persistPresets([], null), false);
  strictEqual(
    savePreset("Nope", capturePresetSettings(defaultSettings(), "landscape", 30), null),
    null,
  );
  strictEqual(deletePreset("x", null), null);
});

check("an entry without an id or name is dropped", () => {
  const raw = JSON.stringify([
    { id: "", name: "No id", settings: {} },
    { id: "a", name: "   ", settings: {} },
    { id: "b", name: "Valid", settings: {} },
  ]);
  const presets = parseStoredPresets(raw);
  strictEqual(presets.length, 1);
  strictEqual(presets[0]!.name, "Valid");
});

check("a versioned envelope is accepted", () => {
  const raw = JSON.stringify({
    version: 1,
    presets: [{ id: "a", name: "Enveloped", settings: { portraitDuration: 12 } }],
  });
  const presets = parseStoredPresets(raw);
  strictEqual(presets.length, 1);
  strictEqual(presets[0]!.settings.portraitDuration, 12);
});

console.log("\nsettings / fields");

check("saved settings survive a JSON round-trip", () => {
  const captured = capturePresetSettings(colorfulSettings(), "portrait", 45);
  const reparsed = sanitizePresetSettings(JSON.parse(JSON.stringify(captured)));
  deepStrictEqual(reparsed, captured);
});

check("capture returns a deep clone, not live state", () => {
  const source = colorfulSettings();
  const captured = capturePresetSettings(source, "landscape", 30);
  ok(captured.settings !== source, "settings tree is a new object");
  source.text.title = "MUTATED LATER";
  source.camera.amount = 0.99;
  strictEqual(captured.settings.text.title, "BLACKTOP");
  strictEqual(captured.settings.camera.amount, 0.05);
});

check("missing fields fall back to the current defaults", () => {
  const partial = sanitizePresetSettings({
    settings: { camera: { move: "zoom-out" } },
  });
  const defaults = defaultSettings();
  strictEqual(partial.settings.camera.move, "zoom-out", "provided value kept");
  strictEqual(partial.settings.camera.amount, defaults.camera.amount, "missing value defaulted");
  deepStrictEqual(partial.settings.visualizer, defaults.visualizer);
  deepStrictEqual(partial.settings.cta, defaults.cta);
  strictEqual(partial.formatId, "landscape");
  strictEqual(partial.portraitDuration, DEFAULT_PORTRAIT_DURATION);
});

check("a preset with no settings at all becomes the defaults", () => {
  const empty = sanitizePresetSettings({});
  deepStrictEqual(empty.settings, defaultSettings());
  strictEqual(empty.version, PRESET_VERSION);
});

check("invalid enum values fall back instead of reaching the renderer", () => {
  const sanitized = sanitizePresetSettings({
    settings: {
      background: { fit: "banana" },
      visualizer: { colorPreset: "chartreuse", type: "lava" },
      text: { fontFamily: "Comic Sans", positionH: "sideways" },
      cta: { animationStyle: "explode" },
    },
  });
  const defaults = defaultSettings();
  strictEqual(sanitized.settings.background.fit, defaults.background.fit);
  strictEqual(sanitized.settings.visualizer.colorPreset, defaults.visualizer.colorPreset);
  strictEqual(sanitized.settings.visualizer.type, defaults.visualizer.type);
  strictEqual(sanitized.settings.text.fontFamily, defaults.text.fontFamily);
  strictEqual(sanitized.settings.text.positionH, defaults.text.positionH);
  strictEqual(sanitized.settings.cta.animationStyle, defaults.cta.animationStyle);
});

check("invalid numbers, colors and unknown keys are rejected", () => {
  const sanitized = sanitizePresetSettings({
    settings: {
      camera: { amount: "lots" },
      vinyl: { opacity: Number.NaN, size: Number.POSITIVE_INFINITY },
      frame: { color: "not-a-color" },
      text: { titleColor: "#12ab34" },
      somethingUnknown: { futureField: true },
    },
  });
  const defaults = defaultSettings();
  strictEqual(sanitized.settings.camera.amount, defaults.camera.amount);
  strictEqual(sanitized.settings.vinyl.opacity, defaults.vinyl.opacity);
  strictEqual(sanitized.settings.vinyl.size, defaults.vinyl.size);
  strictEqual(sanitized.settings.frame.color, defaults.frame.color);
  strictEqual(sanitized.settings.text.titleColor, "#12AB34", "valid hex normalized");
  ok(!("somethingUnknown" in sanitized.settings), "unknown section dropped");
});

check("format and duration are validated", () => {
  const bad = sanitizePresetSettings({ formatId: "square", portraitDuration: -5 });
  strictEqual(bad.formatId, "landscape");
  strictEqual(bad.portraitDuration, DEFAULT_PORTRAIT_DURATION);

  const good = sanitizePresetSettings({ formatId: "portrait", portraitDuration: 42 });
  strictEqual(good.formatId, "portrait");
  strictEqual(good.portraitDuration, 42);
});

console.log("\nversioning");

check("old and unknown versions are upgraded to the current schema", () => {
  for (const version of [undefined, 0, 1, 99, "2"]) {
    const [preset] = parseStoredPresets(
      JSON.stringify([
        {
          id: "a",
          name: "Versioned",
          settings: { version, settings: { camera: { move: "zoom-out" } }, portraitDuration: 18 },
        },
      ]),
    );
    strictEqual(preset!.settings.version, PRESET_VERSION);
    strictEqual(preset!.settings.settings.camera.move, "zoom-out");
    strictEqual(preset!.settings.portraitDuration, 18);
  }
});

check("future settings receive defaults while known ones are preserved", () => {
  const sanitized = sanitizePresetSettings({
    version: 99,
    settings: { camera: { amount: 0.07 } },
  });
  strictEqual(sanitized.version, PRESET_VERSION);
  strictEqual(sanitized.settings.camera.amount, 0.07);
  strictEqual(sanitized.settings.cta.text, defaultSettings().cta.text);
});

console.log("\nimmutability / helpers");

check("loading a preset never mutates defaultSettings", () => {
  const before = JSON.stringify(defaultSettings());
  const storage = fakeStorage();
  savePreset("Snapshot", capturePresetSettings(colorfulSettings(), "portrait", 45), storage);
  const loaded = loadPresets(storage);
  loaded[0]!.settings.settings.camera.amount = 12345;
  sanitizePresetSettings({ settings: { camera: { amount: 999 } } });
  strictEqual(JSON.stringify(defaultSettings()), before);
});

check("upsert replaces by id and appends otherwise", () => {
  const a = makeStoredPreset("A", capturePresetSettings(defaultSettings(), "landscape", 30));
  const b = makeStoredPreset("B", capturePresetSettings(defaultSettings(), "landscape", 30));
  strictEqual(upsertStoredPreset([a], b).length, 2);
  const updated = { ...a, name: "A2" };
  const next = upsertStoredPreset([a], updated);
  strictEqual(next.length, 1);
  strictEqual(next[0]!.name, "A2");
  strictEqual(removeStoredPreset([a, b], a.id).length, 1);
});

check("serialize -> parse is stable across a storage write", () => {
  const storage = fakeStorage();
  const list = [
    makeStoredPreset("One", capturePresetSettings(colorfulSettings(), "portrait", 20)),
    makeStoredPreset("Two", capturePresetSettings(defaultSettings(), "landscape", 30)),
  ];
  ok(persistPresets(list, storage));
  deepStrictEqual(parseStoredPresets(serializeStoredPresets(list)), list);
  deepStrictEqual(loadPresets(storage), list);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
