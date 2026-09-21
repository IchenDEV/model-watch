import type { SourceAdapter, SourceItem } from "../types";
import { fetchWithTimeout } from "../fetch";

interface OpenRouterModel {
  id: string;
  name?: string;
  created?: number;
  description?: string;
}

export const openrouter: SourceAdapter = {
  name: "openrouter",
  async fetch(): Promise<SourceItem[]> {
    const res = await fetchWithTimeout("https://openrouter.ai/api/v1/models");
    const json = (await res.json()) as { data?: OpenRouterModel[] };
    return (json.data ?? []).map((m) => ({
      externalId: m.id,
      title: m.name || m.id,
      provider: m.id.split("/")[0] || "unknown",
      url: `https://openrouter.ai/${m.id}`,
      summary: (m.description || "").slice(0, 300),
      tags: [],
      publishedAt: m.created ? m.created * 1000 : undefined,
      publishedAtPrecision: m.created ? "instant" : undefined,
    }));
  },
};
