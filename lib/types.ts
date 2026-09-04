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
