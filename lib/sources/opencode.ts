import type { SourceAdapter, SourceItem } from "../types";
import { fetchWithTimeout } from "../fetch";
import { inferFamilyVendor } from "../dedupe";

interface OpenCodeModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export const opencode: SourceAdapter = {
  name: "opencode",
  async fetch(): Promise<SourceItem[]> {
    const res = await fetchWithTimeout("https://opencode.ai/zen/v1/models");
    const json = (await res.json()) as { data?: OpenCodeModel[] };
    return (json.data ?? []).map((m) => {
      const vendor = inferFamilyVendor(m.id) || m.owned_by;
      return {
        externalId: m.id,
        title: m.id,
        provider: "opencode",
        vendor,
        url: `https://opencode.ai/docs/zen/`,
        summary: `OpenCode Zen model: ${m.id}`,
        tags: ["opencode"],
        publishedAt: m.created ? m.created * 1000 : undefined,
        publishedAtPrecision: m.created ? "instant" : undefined,
      };
    });
  },
};
