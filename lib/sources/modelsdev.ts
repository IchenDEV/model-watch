import type { SourceAdapter, SourceItem } from "../types";
import { fetchWithTimeout } from "../fetch";
import { inferFamilyVendor, parseReleaseDate } from "../dedupe";

interface ModelsDevModel {
  id?: string;
  name?: string;
  url?: string;
  family?: string;
  release_date?: string;
}

function inferVendor(family: string | undefined, modelKey: string): string | undefined {
  const slug = modelKey.split("/").pop() ?? modelKey;
  return inferFamilyVendor(family) ?? inferFamilyVendor(slug);
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
        const release = parseReleaseDate(model.release_date);
        items.push({
          source: `models.dev/${providerKey}`,
          vendor: inferVendor(model.family, modelKey),
          externalId: `${providerKey}/${modelKey}`,
          title: model.name || modelKey,
          provider: providerKey,
          url: model.url || provider.url || `https://models.dev/`,
          summary: "",
          tags: [],
          publishedAt: release.at,
          publishedAtPrecision: release.precision,
        });
      }
    }
    return items;
  },
};
