export interface AdImageMedia {
  url: string;
  width: number | null;
  height: number | null;
}

export interface AdVideoMedia {
  previewUrl: string | null;
  previewImageUrl: string | null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const candidate = asString(value);
    if (candidate) return candidate;
  }

  return null;
}

function rawPreviewImage(metadata: Record<string, unknown> | null) {
  return asObject(asObject(metadata?.raw)?.preview_image);
}

export function extractAdImageMedia(image: unknown, metadata: Record<string, unknown> | null): AdImageMedia | null {
  if (typeof image === "string") {
    const url = asString(image);
    return url ? { url, width: null, height: null } : null;
  }

  const imageObj = asObject(image);
  const rawImage = rawPreviewImage(metadata);
  const url = firstString(imageObj?.url, imageObj?.src, rawImage?.url);

  if (!url) return null;

  return {
    url,
    width: asNumber(imageObj?.width) ?? asNumber(rawImage?.width),
    height: asNumber(imageObj?.height) ?? asNumber(rawImage?.height),
  };
}

export function extractAdVideoMedia(videos: unknown, metadata: Record<string, unknown> | null): AdVideoMedia | null {
  if (typeof videos === "string") {
    const previewUrl = asString(videos);
    return previewUrl ? { previewUrl, previewImageUrl: null } : null;
  }

  const videoObj = asObject(videos);
  const raw = asObject(metadata?.raw);
  const previewUrl = firstString(videoObj?.preview_url, videoObj?.previewUrl, videoObj?.url, raw?.preview_url);
  const explicitPreviewImageUrl = firstString(videoObj?.preview_image_url, videoObj?.previewImageUrl);
  const previewImageUrl = explicitPreviewImageUrl ?? (previewUrl ? firstString(rawPreviewImage(metadata)?.url) : null);

  if (!previewUrl && !previewImageUrl) return null;

  return {
    previewUrl,
    previewImageUrl,
  };
}
