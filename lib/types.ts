export type TimePrecision = "day" | "instant";

export function displayName(e: {
  canonical?: string;
  externalId: string;
}): string {
  if (!e.canonical) return e.externalId;
  const idx = e.canonical.indexOf(":");
  if (idx < 0) return e.canonical;
  return `${e.canonical.slice(0, idx)}/${e.canonical.slice(idx + 1)}`;
}

export interface ModelEvent {
  id: string; // sha1(source + ":" + externalId)
  source: string;
  externalId: string;
  canonical: string; // "vendor:model-name"，跨源去重键，也用于统一展示
  title: string;
  provider: string;
  url: string;
  summary: string;
  tags: string[];
  sources: string[];
  detectedAt: number;
  publishedAt?: number;
  publishedAtPrecision?: TimePrecision;
  // True when publishedAt came from the maker's own catalog, not a reseller.
  publishedOrigin?: boolean;
}

export interface SourceItem {
  source?: string; // overrides adapter name (e.g. models.dev/<providerKey>)
  vendor?: string; // model vendor hint for cross-source dedup (e.g. google, meta)
  externalId: string;
  title: string;
  provider: string;
  url: string;
  summary: string;
  tags: string[];
  publishedAt?: number;
  publishedAtPrecision?: TimePrecision;
}

export interface SourceAdapter {
  name: string;
  fetch(): Promise<SourceItem[]>;
}
