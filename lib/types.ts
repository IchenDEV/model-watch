export interface ModelEvent {
  id: string; // sha1(source + ":" + externalId)
  source: string;
  externalId: string;
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
