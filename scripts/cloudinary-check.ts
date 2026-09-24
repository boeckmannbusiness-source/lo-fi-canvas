/**
 * Checks for the Cloudinary mobile-download helper.
 *
 * Runs headlessly with Bun (no browser, no network) by injecting a stub fetch:
 *   bun scripts/cloudinary-check.ts
 *
 * Covers config parsing, endpoint construction, the multipart upload contract,
 * error handling, portrait-only gating, and a static guard that no API secret
 * ever appears in client code.
 */
import { ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  cloudinaryUploadUrl,
  isMobileDownloadSupported,
  parseCloudinaryConfig,
  uploadVideoToCloudinary,
} from "../src/lib/cloudinary.ts";
import { EXPORT_FORMATS } from "../src/lib/viz/format.ts";

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

/** A `fetch` stub that records calls and returns a scripted response. */
function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    return handler(url, requestInit);
  }) as typeof fetch;
  return { fn, calls };
}

const CONFIG = { cloudName: "demo-cloud", uploadPreset: "unsigned_video" };

console.log("\nconfig");

await check("missing env yields null", () => {
  strictEqual(parseCloudinaryConfig({}), null);
  strictEqual(parseCloudinaryConfig({ VITE_CLOUDINARY_CLOUD_NAME: "demo-cloud" }), null);
  strictEqual(parseCloudinaryConfig({ VITE_CLOUDINARY_UPLOAD_PRESET: "unsigned_video" }), null);
});

await check("blank env values are rejected", () => {
  strictEqual(
    parseCloudinaryConfig({
      VITE_CLOUDINARY_CLOUD_NAME: "   ",
      VITE_CLOUDINARY_UPLOAD_PRESET: "\t",
    }),
    null,
  );
});

await check("valid env values are trimmed into a config", () => {
  strictEqual(
    JSON.stringify(
      parseCloudinaryConfig({
        VITE_CLOUDINARY_CLOUD_NAME: "  demo-cloud ",
        VITE_CLOUDINARY_UPLOAD_PRESET: " unsigned_video\n",
      }),
    ),
    JSON.stringify(CONFIG),
  );
});

console.log("\nendpoint");

await check("video upload endpoint is https and cloud-encoded", () => {
  strictEqual(
    cloudinaryUploadUrl("demo-cloud"),
    "https://api.cloudinary.com/v1_1/demo-cloud/video/upload",
  );
  strictEqual(
    cloudinaryUploadUrl("a b/c"),
    "https://api.cloudinary.com/v1_1/a%20b%2Fc/video/upload",
  );
});

console.log("\nupload");

await check("uploads the blob as multipart with the unsigned preset", async () => {
  const { fn, calls } = stubFetch(
    () =>
      new Response(
        JSON.stringify({
          secure_url: "https://res.cloudinary.com/demo-cloud/video/upload/v1/clip.mp4",
          public_id: "clip",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );

  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" });
  const result = await uploadVideoToCloudinary(blob, {
    config: CONFIG,
    filename: "clip.mp4",
    fetchImpl: fn,
  });

  strictEqual(result.secureUrl, "https://res.cloudinary.com/demo-cloud/video/upload/v1/clip.mp4");
  strictEqual(result.publicId, "clip");
  strictEqual(calls.length, 1);
  strictEqual(calls[0]!.url, "https://api.cloudinary.com/v1_1/demo-cloud/video/upload");
  strictEqual(calls[0]!.init.method, "POST");

  const body = calls[0]!.init.body as FormData;
  ok(body instanceof FormData, "body is FormData");
  strictEqual(body.get("upload_preset"), "unsigned_video");
  const file = body.get("file");
  ok(file instanceof Blob, "file part is a Blob");
  strictEqual((file as File).name, "clip.mp4");
});

await check("a failed upload throws with status and detail", async () => {
  const { fn } = stubFetch(() => new Response("Invalid upload preset", { status: 400 }));
  let message = "";
  try {
    await uploadVideoToCloudinary(new Blob(["x"]), {
      config: CONFIG,
      fetchImpl: fn,
    });
  } catch (error) {
    message = (error as Error).message;
  }
  ok(message.includes("400"), `status surfaced (got: ${message})`);
  ok(message.includes("Invalid upload preset"), `detail surfaced (got: ${message})`);
});

await check("a response without secure_url throws", async () => {
  const { fn } = stubFetch(
    () => new Response(JSON.stringify({ public_id: "clip" }), { status: 200 }),
  );
  let message = "";
  try {
    await uploadVideoToCloudinary(new Blob(["x"]), {
      config: CONFIG,
      fetchImpl: fn,
    });
  } catch (error) {
    message = (error as Error).message;
  }
  ok(message.includes("secure_url"), `got: ${message}`);
});

console.log("\nscope / safety");

await check("the mobile action is only supported for portrait", () => {
  ok(isMobileDownloadSupported("portrait"));
  ok(!isMobileDownloadSupported("landscape"));
  strictEqual(EXPORT_FORMATS.portrait.width, 1080);
  strictEqual(EXPORT_FORMATS.portrait.height, 1920);
});

await check("client upload code contains no API secret", () => {
  const path = fileURLToPath(new URL("../src/lib/cloudinary.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  ok(!/api[_-]?secret/i.test(source), "no api_secret reference");
  ok(!/CLOUDINARY_API_SECRET/.test(source), "no CLOUDINARY_API_SECRET");
  ok(!/signature|timestamp/i.test(source), "no signed-upload params");
  ok(source.includes("VITE_CLOUDINARY_CLOUD_NAME"), "reads cloud name from env");
  ok(source.includes("VITE_CLOUDINARY_UPLOAD_PRESET"), "reads preset from env");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
