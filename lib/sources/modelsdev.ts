import type { SourceAdapter, SourceItem } from "../types";
import { fetchWithTimeout } from "../fetch";

interface ModelsDevModel {
  id?: string;
  name?: string;
  url?: string;
  release_date?: string;
}

interface ModelsDevProvider {
  name?: string;
  url?: string;
  models?: Record<string, ModelsDevModel>;
}

export const modelsdev: SourceAdapter = {
  name: "modelsdev",
  async fetch(): Promise<SourceItem[]> {
    const res = await fetchWithTimeout("https://models.dev/api.json");
    const json = (await res.json()) as Record<string, ModelsDevProvider>;
    const items: SourceItem[] = [];
    for (const [providerKey, provider] of Object.entries(json)) {
      const models = provider?.models ?? {};
      for (const [modelKey, model] of Object.entries(models)) {
        items.push({
          source: `models.dev/${providerKey}`,
          externalId: `${providerKey}/${modelKey}`,
          title: model.name || modelKey,
          provider: providerKey,
          url: model.url || provider.url || `https://models.dev/`,
          summary: "",
          tags: [],
          publishedAt: model.release_date
            ? Date.parse(model.release_date) || undefined
            : undefined,
        });
      }
    }
    return items;
  },
};
