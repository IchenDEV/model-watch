export function displayName(e: {
  canonical?: string;
  externalId: string;
}): string {
  return e.canonical ? e.canonical.replace(/^([^:]+):/, "$1/") : e.externalId;
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
}

export interface SourceAdapter {
  name: string;
  fetch(): Promise<SourceItem[]>;
}
