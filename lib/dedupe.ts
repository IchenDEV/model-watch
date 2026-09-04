import { createHash } from "crypto";
import type { ModelEvent, SourceItem } from "./types";

export function eventId(source: string, externalId: string): string {
  return createHash("sha1").update(`${source}:${externalId}`).digest("hex");
}

export function toEvent(
  source: string,
  item: SourceItem,
  detectedAt: number
): ModelEvent {
  const src = item.source ?? source;
  return {
    id: eventId(src, item.externalId),
    source: src,
    externalId: item.externalId,
    canonical: "", // 由 refresh 流程填入
    title: item.title,
    provider: item.provider,
    url: item.url,
    summary: item.summary,
    tags: item.tags,
    sources: [item.source ?? source],
    detectedAt,
    publishedAt: item.publishedAt,
  };
}

const VENDOR_ALIASES: Record<string, string> = {
  "z-ai": "zhipu",
  "zai-org": "zhipu",
  zhipu: "zhipu",
  moonshotai: "moonshot",
  "bytedance-seed": "bytedance",
  "meta-llama": "meta",
  qwen: "alibaba",
  "google-vertex": "google",
  "google-vertex-anthropic": "anthropic",
};

// models.dev bedrock-style keys: "us.anthropic.claude-3-5-sonnet-..." —
// take the last "." segment when the first segment looks like a vendor prefix.
const BEDROCK_PREFIXES = new Set([
  "us",
  "anthropic",
  "amazon",
  "ai21",
  "cohere",
  "meta",
  "mistral",
  "openai",
  "deepseek",
  "stability",
  "writer",
  "google",
  "luma",
  "twelvelabs",
]);

export function canonicalKey(
  source: string,
  externalId: string,
  vendorHint?: string
): string {
  // 博客文章是公告而非模型清单，不参与跨源合并，按文章链接去重即可
  if (source === "blogs") return `blogs:${externalId}`;

  const segments = externalId.split("/");
  const vendorRaw = (vendorHint ?? segments[0] ?? "")
    .toLowerCase()
    .replace(/^~/, "");
  const vendor = VENDOR_ALIASES[vendorRaw] ?? vendorRaw;

  let name = segments[segments.length - 1] || "";
  if (source.startsWith("models.dev") && name.includes(".")) {
    const first = name.split(".")[0].toLowerCase();
    if (BEDROCK_PREFIXES.has(first)) {
      name = name.split(".").pop()!;
    }
  }
  name = name
    .toLowerCase()
    .replace(/@.*$/, "") // region 后缀：gemini-3.7-flash@eu
    .replace(/:(batch|free)$/, "") // openrouter 端点变体：claude-fable-5.1:batch
    .replace(/_/g, "-")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-\d{8}$/, "");
  return `${vendor}:${name}`;
}
