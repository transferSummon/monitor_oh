import type { CreativeRecord } from "@/types/snapshot";

const parseRegionsFromUnknown = (value: unknown): string[] => {
  if (!value) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        return parseRegionsFromUnknown(JSON.parse(trimmed) as unknown);
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const candidate = obj.location_name ?? obj.country ?? obj.region ?? obj.code ?? obj.value ?? obj.name;
          return typeof candidate === "string" ? candidate : null;
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.regions)) return parseRegionsFromUnknown(obj.regions);
    if (typeof obj.location_name === "string") return [obj.location_name];
    if (typeof obj.country === "string") return [obj.country];
    if (typeof obj.region === "string") return [obj.region];
    if (Array.isArray(obj.code)) return parseRegionsFromUnknown(obj.code);
    if (typeof obj.code === "string") return [obj.code];
    if (typeof obj.value === "string") return [obj.value];
    if (typeof obj.name === "string") return [obj.name];
  }

  return [];
};

export const formatRegions = (ad: CreativeRecord): string => {
  const direct = parseRegionsFromUnknown(ad.regions);
  if (direct.length > 0) return direct.join(", ");

  const metadataRegions = (ad.metadata as { ad_information?: { regions?: unknown } } | null)
    ?.ad_information?.regions;
  const fromMetadata = parseRegionsFromUnknown(metadataRegions);
  if (fromMetadata.length > 0) return fromMetadata.join(", ");

  const legacyMetadataRegions = parseRegionsFromUnknown(ad.metadata?.regions);
  if (legacyMetadataRegions.length > 0) return legacyMetadataRegions.join(", ");

  return ad.region ?? "Unknown";
};

export const formatDestination = (ad: CreativeRecord): string => {
  if (ad.destinations && ad.destinations.length > 0) {
    return ad.destinations.map((destination) => destination.name).join(", ");
  }

  const name =
    typeof ad.destination_name === "string" && ad.destination_name.trim().length > 0
      ? ad.destination_name
      : "Unknown";
  return ad.destination_country ? `${name} (${ad.destination_country})` : name;
};

export const getDestinationLabels = (ad: CreativeRecord): string[] => {
  if (ad.destinations && ad.destinations.length > 0) {
    return ad.destinations.map((destination) => destination.name);
  }

  return [formatDestination(ad)];
};

export const getImageFromAd = (ad: CreativeRecord): string | null => {
  if (typeof ad.image === "string" && ad.image.trim().length > 0) {
    return ad.image;
  }

  const mediaImage = ad.media?.image?.url;
  if (typeof mediaImage === "string" && mediaImage.trim().length > 0) {
    return mediaImage;
  }

  const variationImage = (
    ad.metadata as { variations?: Array<{ image?: unknown }> } | null
  )?.variations?.[0]?.image;

  if (typeof variationImage === "string" && variationImage.trim().length > 0) {
    return variationImage;
  }

  const rawPreviewImage = (
    ad.metadata as { raw?: { preview_image?: { url?: unknown } } } | null
  )?.raw?.preview_image?.url;

  if (typeof rawPreviewImage === "string" && rawPreviewImage.trim().length > 0) {
    return rawPreviewImage;
  }

  return null;
};

export const getVideoUrlsFromAd = (ad: CreativeRecord): string[] => {
  const asStringArray = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[")) {
        try {
          return asStringArray(JSON.parse(trimmed) as unknown);
        } catch {
          return [];
        }
      }
      return [trimmed];
    }
    return [];
  };

  const topLevelVideos = asStringArray(ad.videos);
  if (topLevelVideos.length > 0) return topLevelVideos;

  const singleVideo = asStringArray(ad.video);
  if (singleVideo.length > 0) return singleVideo;

  if (Array.isArray(ad.media?.videos)) {
    const mediaVideos = ad.media.videos.filter((item): item is string => typeof item === "string");
    if (mediaVideos.length > 0) return mediaVideos;
  }

  const mediaPreviewUrl = ad.media?.video?.previewUrl;
  if (typeof mediaPreviewUrl === "string" && mediaPreviewUrl.trim().length > 0) {
    return [mediaPreviewUrl];
  }

  return [];
};
