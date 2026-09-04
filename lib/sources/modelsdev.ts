import type { SourceAdapter, SourceItem } from "../types";
import { fetchWithTimeout } from "../fetch";

interface ModelsDevModel {
  id?: string;
  name?: string;
  url?: string;
  family?: string;
  release_date?: string;
}

const FAMILY_VENDOR: [RegExp, string][] = [
  [/^(gemini|gemma)/, "google"],
  [/^(gpt|chatgpt|o\d)/, "openai"],
  [/^claude/, "anthropic"],
  [/^(glm|chatglm)/, "zhipu"],
  [/^kimi/, "moonshot"],
  [/^(qwen|qwq)/, "alibaba"],
  [/^deepseek/, "deepseek"],
  [/^(llama|muse|codellama)/, "meta"],
  [/^(mistral|magistral|pixtral|codestral|ministral)/, "mistralai"],
  [/^grok/, "x-ai"],
  [/^granite/, "ibm-granite"],
  [/^mercury/, "inception"],
  [/^(ling|bailing)/, "inclusionai"],
  [/^(hunyuan|hy[-\d])/, "tencent"],
  [/^(doubao|seed)/, "bytedance"],
  [/^minimax|^abab/, "minimax"],
  [/^step/, "stepfun"],
  [/^command/, "cohere"],
  [/^(nova|titan)/, "amazon"],
  [/^phi/, "microsoft"],
  [/^nemotron/, "nvidia"],
  [/^(ernie|wenxin)/, "baidu"],
];

function inferVendor(family: string | undefined, modelKey: string): string | undefined {
  for (const probe of [family, modelKey]) {
    if (!probe) continue;
    const p = probe.toLowerCase().split("/").pop()!.split(".").pop()!;
    for (const [re, vendor] of FAMILY_VENDOR) {
      if (re.test(p)) return vendor;
    }
  }
  return undefined;
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
          vendor: inferVendor(model.family, modelKey),
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
