import assert from "node:assert/strict";
import test from "node:test";

import { extractAdImageMedia, extractAdVideoMedia } from "../src/lib/server/ad-media";

test("extracts image media from JSONB image payloads", () => {
  assert.deepEqual(
    extractAdImageMedia({ url: "https://example.com/ad.png", width: 300, height: 250 }, null),
    {
      url: "https://example.com/ad.png",
      width: 300,
      height: 250,
    },
  );
});

test("falls back to raw DataForSEO preview image metadata", () => {
  assert.deepEqual(
    extractAdImageMedia(null, {
      raw: {
        preview_image: {
          url: "https://tpc.googlesyndication.com/archive/simgad/123",
          width: 381,
          height: 174,
        },
      },
    }),
    {
      url: "https://tpc.googlesyndication.com/archive/simgad/123",
      width: 381,
      height: 174,
    },
  );
});

test("extracts video preview metadata from JSONB and raw payloads", () => {
  assert.deepEqual(
    extractAdVideoMedia(
      { preview_url: "https://displayads-formats.googleusercontent.com/ads/preview/content.js" },
      {
        raw: {
          preview_image: {
            url: "https://example.com/poster.jpg",
          },
        },
      },
    ),
    {
      previewUrl: "https://displayads-formats.googleusercontent.com/ads/preview/content.js",
      previewImageUrl: "https://example.com/poster.jpg",
    },
  );
});

test("returns null for empty media payloads", () => {
  assert.equal(extractAdImageMedia(null, null), null);
  assert.equal(extractAdVideoMedia(null, null), null);
});
