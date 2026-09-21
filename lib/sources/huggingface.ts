import type { SourceAdapter, SourceItem } from "../types";
import { fetchWithTimeout } from "../fetch";

const MAJOR_AUTHORS = new Set([
  "openai",
  "meta-llama",
  "google",
  "mistralai",
  "qwen",
  "deepseek-ai",
  "zai-org",
  "moonshotai",
  "microsoft",
  "amazon",
  "nvidia",
  "apple",
  "aliyun",
  "tencent",
  "baichuan-inc",
  "01-ai",
  "stepfun-ai",
  "minimaxai",
  "inclusionai",
  "internlm",
  "thudm",
]);

interface HfModel {
  id: string;
  author?: string;
  createdAt?: string;
  tags?: string[];
  likes?: number;
}

export const huggingface: SourceAdapter = {
  name: "huggingface",
  async fetch(): Promise<SourceItem[]> {
    const res = await fetchWithTimeout(
      "https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=100&full=false"
    );
    const models = (await res.json()) as HfModel[];
    return models
      .filter((m) => {
        const likes = m.likes ?? 0;
        const author = (m.author || m.id.split("/")[0] || "").toLowerCase();
        return likes >= 5 || MAJOR_AUTHORS.has(author);
      })
      .map((m) => ({
        externalId: m.id,
        title: m.id,
        provider: m.author || m.id.split("/")[0] || "unknown",
        url: `https://huggingface.co/${m.id}`,
        summary: "",
        tags: (m.tags ?? []).slice(0, 8),
        publishedAt: m.createdAt ? Date.parse(m.createdAt) || undefined : undefined,
        publishedAtPrecision: m.createdAt ? "instant" : undefined,
      }));
  },
};
