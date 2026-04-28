export type SearchParamsValue = string | string[] | undefined;
export type PageSearchParams = Record<string, SearchParamsValue>;

function splitValue(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function resolveSearchParams(
  input?: Promise<PageSearchParams> | PageSearchParams,
): Promise<PageSearchParams> {
  if (!input) return {};
  return await input;
}

export function getManyParams(params: PageSearchParams, key: string) {
  const raw = params[key];

  if (Array.isArray(raw)) {
    return raw.flatMap((item) => splitValue(item));
  }

  if (typeof raw === "string") {
    return splitValue(raw);
  }

  return [];
}

export function getFirstParam(params: PageSearchParams, key: string) {
  return getManyParams(params, key)[0];
}

export function toUrlSearchParams(params: PageSearchParams) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item) continue;
        searchParams.append(key, item);
      }
      continue;
    }

    if (typeof value === "string" && value) {
      searchParams.set(key, value);
    }
  }

  return searchParams;
}

export function withSearchParams(
  path: string,
  params: PageSearchParams,
  updates: Record<string, string | number | string[] | null | undefined>,
) {
  const searchParams = toUrlSearchParams(params);

  for (const [key, value] of Object.entries(updates)) {
    searchParams.delete(key);

    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) searchParams.append(key, item);
      }
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}
