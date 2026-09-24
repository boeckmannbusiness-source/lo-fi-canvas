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
  CLOUDINARY_SYNC_PROCESSING_LIMIT_MB,
  CLOUDINARY_VIDEO_RESOURCE_TYPE,
  cloudinaryErrorMessage,
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
  strictEqual(CLOUDINARY_VIDEO_RESOURCE_TYPE, "video");
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

console.log("\ntransform-free contract");

await check("the only multipart fields are file and upload_preset", async () => {
  const { fn, calls } = stubFetch(
    () =>
      new Response(JSON.stringify({ secure_url: "https://res.example/clip.mp4" }), { status: 200 }),
  );
  await uploadVideoToCloudinary(new Blob(["x"], { type: "video/mp4" }), {
    config: CONFIG,
    filename: "clip.mp4",
    fetchImpl: fn,
  });

  const body = calls[0]!.init.body as FormData;
  strictEqual(JSON.stringify([...body.keys()].sort()), JSON.stringify(["file", "upload_preset"]));
  for (const forbidden of [
    "format",
    "transformation",
    "eager",
    "eager_async",
    "resource_type",
    "type",
    "context",
    "tags",
    "public_id",
    "async",
    "notification_url",
    "eager_notification_url",
  ]) {
    strictEqual(body.get(forbidden), null, `unexpected "${forbidden}" field`);
  }
  strictEqual(calls[0]!.url, "https://api.cloudinary.com/v1_1/demo-cloud/video/upload");
});

console.log("\nlarge uploads");

await check("a video larger than 40 MB is sent unchanged (no client-side cap)", async () => {
  const { fn, calls } = stubFetch(
    () =>
      new Response(
        JSON.stringify({
          secure_url: "https://res.cloudinary.com/demo-cloud/video/upload/v1/big.mp4",
          public_id: "big",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
  const big = new Blob([new Uint8Array(CLOUDINARY_SYNC_PROCESSING_LIMIT_MB * 1024 * 1024 + 1)], {
    type: "video/mp4",
  });
  ok(big.size > CLOUDINARY_SYNC_PROCESSING_LIMIT_MB * 1024 * 1024, "fixture exceeds the limit");

  const result = await uploadVideoToCloudinary(big, {
    config: CONFIG,
    filename: "big.mp4",
    fetchImpl: fn,
  });

  strictEqual(result.secureUrl, "https://res.cloudinary.com/demo-cloud/video/upload/v1/big.mp4");
  const body = calls[0]!.init.body as FormData;
  const sent = body.get("file");
  ok(sent instanceof Blob, "file part is a Blob");
  strictEqual((sent as Blob).size, big.size, "bytes are forwarded unchanged");
});

console.log("\nerror messages");

await check("the synchronous-processing error is explained, not dumped as JSON", () => {
  const raw =
    '{"error":{"message":"Video is too large to process synchronously, please use an eager transformation with eager_async=true to resolve"}}';
  const message = cloudinaryErrorMessage(400, raw);
  ok(message.includes("400"), message);
  ok(new RegExp(`${CLOUDINARY_SYNC_PROCESSING_LIMIT_MB} MB`, "i").test(message), message);
  ok(/preset/i.test(message), message);
  ok(!message.includes("{"), `raw JSON leaked: ${message}`);
});

await check("the sync-processing message never suggests eager_async", () => {
  const raw =
    '{"error":{"message":"Video is too large to process synchronously, please use an eager transformation with eager_async=true to resolve"}}';
  const message = cloudinaryErrorMessage(400, raw);
  ok(!/eager_async=true/.test(message), message);
});

await check("unknown errors keep the status and the server detail", () => {
  const message = cloudinaryErrorMessage(400, "Invalid upload preset");
  ok(message.includes("400"), message);
  ok(message.includes("Invalid upload preset"), message);
});

await check("JSON error envelopes are unwrapped", () => {
  const message = cloudinaryErrorMessage(400, '{"error":{"message":"Bad request"}}');
  ok(message.includes("Bad request"), message);
  ok(!message.includes("{"), `raw JSON leaked: ${message}`);
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

await check("client never appends a transformation parameter", () => {
  const path = fileURLToPath(new URL("../src/lib/cloudinary.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  for (const param of [
    "format",
    "transformation",
    "eager",
    "eager_async",
    "resource_type",
    "async",
  ]) {
    ok(
      !new RegExp(`append\\(\\s*["'\`]${param}["'\`]`).test(source),
      `no "${param}" field is appended`,
    );
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
