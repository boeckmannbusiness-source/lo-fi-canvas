/**
 * Focused checks for the shared "send to mobile" delivery flow.
 *
 * The React UI is browser-only, so these checks drive the same controller the
 * UI uses (`createMobileDelivery`) headlessly with Bun and an injected upload
 * stub — no DOM, no network:
 *   bun scripts/send-to-mobile-check.ts
 *
 * Covers:
 *   Case A - the converted MP4 blob is what reaches the existing upload
 *   Case B - an already-compatible original is uploaded unchanged
 *   Case C - an upload failure never throws and keeps state usable
 *   Case D - double clicks never start parallel uploads
 * plus static guards that the converter reuses the shared flow instead of
 * duplicating Cloudinary code.
 */
import { ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CLOUDINARY_NOT_CONFIGURED_MESSAGE,
  type CloudinaryConfig,
  type CloudinaryUploadResult,
} from "../src/lib/cloudinary.ts";
import {
  createMobileDelivery,
  pickMobileUpload,
  SEND_TO_MOBILE_FALLBACK_ERROR,
} from "../src/lib/send-to-mobile.ts";

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}\n       ${(error as Error).message}`);
  }
}

const CONFIG: CloudinaryConfig = { cloudName: "demo-cloud", uploadPreset: "unsigned_video" };

type UploadCall = { blob: Blob; filename: string | undefined };

/** Records the blobs that reach the (existing) upload function. */
function recorder(impl: () => Promise<CloudinaryUploadResult>) {
  const calls: UploadCall[] = [];
  const upload = async (
    blob: Blob,
    options: { config: CloudinaryConfig; filename?: string },
  ): Promise<CloudinaryUploadResult> => {
    calls.push({ blob, filename: options.filename });
    return impl();
  };
  return { calls, upload };
}

const srcPath = (relative: string) => fileURLToPath(new URL(`../src/${relative}`, import.meta.url));
const readSrc = (relative: string) => readFileSync(srcPath(relative), "utf8");

/* Unhandled rejections are a bug: the flow must swallow upload failures. */
const unhandled: unknown[] = [];
process.on("unhandledRejection", (reason) => unhandled.push(reason));

console.log("\nsource selection");

await check("Case A: the converted MP4 is preferred over the original", () => {
  const converted = new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" });
  const original = new File(["original"], "clip.mp4", { type: "video/mp4" });
  const source = pickMobileUpload({
    converted: { blob: converted, filename: "clip-tiktok.mp4" },
    original,
    alreadyCompatible: true,
  });
  strictEqual(source?.blob, converted, "converted blob wins");
  strictEqual(source?.filename, "clip-tiktok.mp4", "converted filename is kept");
});

await check("Case B: an already-compatible original is used unchanged", () => {
  const original = new File(["original"], "original.mp4", { type: "video/mp4" });
  const source = pickMobileUpload({ converted: null, original, alreadyCompatible: true });
  strictEqual(source?.blob, original, "the original File is uploaded as-is");
  strictEqual(source?.filename, "original.mp4", "the original filename is kept");
});

await check("nothing is uploaded before a usable source exists", () => {
  const original = new File(["x"], "x.mp4", { type: "video/mp4" });
  strictEqual(pickMobileUpload({ converted: null, original, alreadyCompatible: false }), null);
  strictEqual(pickMobileUpload({ converted: null, original: null, alreadyCompatible: true }), null);
});

console.log("\nCase A: converted blob reaches the existing upload");

await check("the exact converted Blob is passed to the upload", async () => {
  const converted = new Blob([new Uint8Array([4, 5, 6])], { type: "video/mp4" });
  const source = pickMobileUpload({
    converted: { blob: converted, filename: "song-tiktok.mp4" },
    original: new File(["original"], "song.mp4", { type: "video/mp4" }),
    alreadyCompatible: false,
  });
  const { calls, upload } = recorder(async () => ({
    secureUrl: "https://res.cloudinary.com/demo/video/upload/v1/song.mp4",
    publicId: "song",
  }));
  const delivery = createMobileDelivery({ readConfig: () => CONFIG, upload });

  const snapshot = await delivery.send(source!.blob, source!.filename);

  strictEqual(snapshot.status, "ready");
  strictEqual(snapshot.secureUrl, "https://res.cloudinary.com/demo/video/upload/v1/song.mp4");
  strictEqual(calls.length, 1);
  strictEqual(calls[0]!.blob, converted, "identity preserved: no re-encode");
  strictEqual(calls[0]!.filename, "song-tiktok.mp4");
});

console.log("\nCase B: already compatible stays un-re-encoded");

await check("the original File identity reaches the upload", async () => {
  const original = new File([new Uint8Array([9, 8, 7])], "original.mp4", { type: "video/mp4" });
  const source = pickMobileUpload({ converted: null, original, alreadyCompatible: true });
  const { calls, upload } = recorder(async () => ({
    secureUrl: "https://res.cloudinary.com/demo/video/upload/v1/original.mp4",
    publicId: "original",
  }));
  const delivery = createMobileDelivery({ readConfig: () => CONFIG, upload });

  const snapshot = await delivery.send(source!.blob, source!.filename);

  strictEqual(snapshot.status, "ready");
  strictEqual(calls.length, 1);
  strictEqual(calls[0]!.blob, original, "identity preserved: the source is uploaded as-is");
  strictEqual(calls[0]!.filename, "original.mp4");
});

console.log("\nCase C: upload errors never throw");

await check("a rejected upload resolves to an error snapshot", async () => {
  const { upload } = recorder(async () => {
    throw new Error("Cloudinary upload failed (400): Invalid upload preset");
  });
  const delivery = createMobileDelivery({ readConfig: () => CONFIG, upload });

  let snapshot;
  try {
    snapshot = await delivery.send(new Blob(["x"]), "x.mp4");
  } catch {
    ok(false, "send() must not reject");
  }

  strictEqual(snapshot!.status, "error");
  ok(snapshot!.error!.includes("Invalid upload preset"), snapshot!.error!);
  strictEqual(snapshot!.secureUrl, null);
  strictEqual(delivery.getSnapshot().status, "error");
});

await check("a message-less error uses the friendly fallback", async () => {
  const { upload } = recorder(async () => {
    throw new Error("   ");
  });
  const delivery = createMobileDelivery({ readConfig: () => CONFIG, upload });
  const snapshot = await delivery.send(new Blob(["x"]), "x.mp4");
  strictEqual(snapshot.status, "error");
  strictEqual(snapshot.error, SEND_TO_MOBILE_FALLBACK_ERROR);
});

await check("missing config reports a setup error and uploads nothing", async () => {
  const { calls, upload } = recorder(async () => ({ secureUrl: "https://res/x", publicId: "x" }));
  const delivery = createMobileDelivery({ readConfig: () => null, upload });
  const snapshot = await delivery.send(new Blob(["x"]), "x.mp4");
  strictEqual(snapshot.status, "error");
  strictEqual(snapshot.error, CLOUDINARY_NOT_CONFIGURED_MESSAGE);
  strictEqual(calls.length, 0, "no request is attempted without config");
});

console.log("\nCase D: concurrency");

await check("two immediate clicks share one upload", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { calls, upload } = recorder(async () => {
    await gate;
    return {
      secureUrl: "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
      publicId: "clip",
    };
  });
  const delivery = createMobileDelivery({ readConfig: () => CONFIG, upload });
  const blob = new Blob(["x"], { type: "video/mp4" });

  const first = delivery.send(blob, "clip.mp4");
  const second = delivery.send(blob, "clip.mp4");
  strictEqual(first, second, "the second click reuses the in-flight upload");

  release();
  const [a, b] = await Promise.all([first, second]);

  strictEqual(a.status, "ready");
  strictEqual(b.secureUrl, "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4");
  strictEqual(calls.length, 1, "exactly one upload was started");
  strictEqual(calls[0]!.blob, blob);
});

await check("a new upload is allowed after the first finishes", async () => {
  const { calls, upload } = recorder(async () => ({ secureUrl: "https://res/x", publicId: "x" }));
  const delivery = createMobileDelivery({ readConfig: () => CONFIG, upload });
  await delivery.send(new Blob(["a"]), "a.mp4");
  await delivery.send(new Blob(["b"]), "b.mp4");
  strictEqual(calls.length, 2);
});

await check("reset() discards a late result from a previous source", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { upload } = recorder(async () => {
    await gate;
    return { secureUrl: "https://res/x", publicId: "x" };
  });
  const delivery = createMobileDelivery({ readConfig: () => CONFIG, upload });
  const pending = delivery.send(new Blob(["x"]), "x.mp4");
  delivery.reset();
  release();
  const snapshot = await pending;
  strictEqual(snapshot.status, "ready", "caller still gets its result");
  strictEqual(delivery.getSnapshot().status, "idle", "but the stale result is not applied");
});

console.log("\nreuse / no parallel implementation");

await check("the converter reuses the shared mobile flow", () => {
  const converter = readSrc("components/visualizer/TikTokConverter.tsx");
  ok(/SendToMobile/.test(converter), "uses the shared SendToMobile component");
  ok(/pickMobileUpload/.test(converter), "selects the converted/original source");
  ok(
    !/uploadVideoToCloudinary|api\.cloudinary\.com|cloudinaryUploadUrl/.test(converter),
    "no direct Cloudinary upload in the converter",
  );
  ok(!/FormData|XMLHttpRequest/.test(converter), "no ad-hoc upload transport");
});

await check("the shared UI uploads through the shared controller", () => {
  const ui = readSrc("components/visualizer/SendToMobile.tsx");
  ok(/createMobileDelivery/.test(ui), "uses createMobileDelivery");
  ok(!/fetch\(/.test(ui), "no direct fetch");
  ok(!/FormData/.test(ui), "no multipart plumbing in the UI");
});

await check("the export panel reuses the same component", () => {
  const studio = readSrc("components/visualizer/Studio.tsx");
  ok(/<SendToMobile/.test(studio), "studio renders the shared component");
  ok(!/uploadVideoToCloudinary/.test(studio), "studio no longer owns the upload");
});

await new Promise((resolve) => setTimeout(resolve, 20));
await check("no unhandled promise rejections occurred", () => {
  strictEqual(unhandled.length, 0, `unhandled: ${unhandled.map(String).join(", ")}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
