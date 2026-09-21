import { createHash } from "crypto";
import type { ModelEvent, SourceItem, TimePrecision } from "./types";

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
    canonical: "",
    title: item.title,
    provider: item.provider,
    url: item.url,
    summary: item.summary,
    tags: item.tags,
    sources: [item.source ?? source],
    detectedAt,
    publishedAt: item.publishedAt,
    publishedAtPrecision: item.publishedAtPrecision,
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
  xai: "x-ai",
  spacexai: "x-ai",
  "x-ai": "x-ai",
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  amazon: "amazon",
  meta: "meta",
  mistral: "mistral",
  cohere: "cohere",
  deepseek: "deepseek",
  ai21: "ai21",
  nvidia: "nvidia",
  microsoft: "microsoft",
  stability: "stability",
  writer: "writer",
  luma: "luma",
  twelvelabs: "twelvelabs",
};

const REGION_PREFIXES = new Set([
  "us",
  "eu",
  "jp",
  "ap",
  "sa",
  "ca",
  "au",
  "global",
]);

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
  [/^fugu/, "sakana"],
];

export function aliasVendor(raw: string | undefined): string {
  if (!raw) return "";
  const v = raw.toLowerCase().replace(/^~/, "");
  return VENDOR_ALIASES[v] ?? v;
}

export function inferFamilyVendor(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const slug = name.toLowerCase().split("/").pop() ?? "";
  for (const [re, vendor] of FAMILY_VENDOR) {
    if (re.test(slug)) return vendor;
  }
  return undefined;
}

// Region labels only. Vendor tokens stay in the id so they can be recovered.
export function stripBedrockPrefixes(name: string): string {
  const parts = name.split(".");
  while (parts.length > 1 && REGION_PREFIXES.has(parts[0])) parts.shift();
  return parts.join(".");
}

function normalizeSlug(name: string): string {
  const slug = stripBedrockPrefixes(name.toLowerCase().replace(/^~/, ""));
  return slug
    .replace(/@.*$/, "")
    .replace(/:(batch|free|thinking)$/, "")
    .replace(/_/g, "-")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-\d{8}$/, "");
}

function peelVendorPrefix(slug: string): { vendor?: string; slug: string } {
  const dot = slug.indexOf(".");
  if (dot <= 0) return { slug };
  const head = slug.slice(0, dot);
  if (!(head in VENDOR_ALIASES)) return { slug };
  return { vendor: VENDOR_ALIASES[head], slug: slug.slice(dot + 1) };
}

export interface Identity {
  key: string;
  slug: string;
  vendor: string;
  origin: boolean;
}

function isOrigin(source: string, host: string, vendor: string): boolean {
  if (source === "openrouter") return false;
  if (source.startsWith("direct/")) return true;
  if (source === "huggingface" || source.startsWith("models.dev/")) {
    return aliasVendor(host) === vendor;
  }
  return aliasVendor(host) === vendor;
}

// Gateway catalogs store the upstream org inside the model id
// (`kilo/prism-ml/ternary-bonsai-2-27b`). The org is the vendor; the host is not.
export function identify(
  source: string,
  externalId: string,
  vendorHint?: string
): Identity {
  if (source === "blogs") {
    return {
      key: `blogs:${externalId}`,
      slug: externalId,
      vendor: "blogs",
      origin: false,
    };
  }

  const segments = externalId.split("/").filter(Boolean);
  let host = "";
  let modelParts = segments;

  if (source.startsWith("models.dev/") || source.startsWith("direct/")) {
    host = source.startsWith("models.dev/")
      ? source.slice("models.dev/".length)
      : source.slice("direct/".length);
    if (segments[0] === host) modelParts = segments.slice(1);
  } else if (source === "huggingface") {
    host = segments[0] ?? source;
  } else if (source === "openrouter") {
    host = source;
  } else {
    host = segments[0] ?? source;
  }

  const org = modelParts.length >= 2 ? modelParts[0] : undefined;
  let slug = normalizeSlug(modelParts[modelParts.length - 1] ?? externalId);
  const peeled = peelVendorPrefix(slug);
  slug = peeled.slug;

  const orgVendor = aliasVendor(org || peeled.vendor || "");
  const hinted = vendorHint ? aliasVendor(vendorHint) : "";
  const fromSlug = inferFamilyVendor(slug) ?? "";
  const vendor = orgVendor || hinted || fromSlug || aliasVendor(host || "unknown");

  return {
    key: `${vendor}:${slug}`,
    slug,
    vendor,
    origin: isOrigin(source, host, vendor),
  };
}

export function canonicalKey(
  source: string,
  externalId: string,
  vendorHint?: string
): string {
  return identify(source, externalId, vendorHint).key;
}

export interface PublishedMark {
  at?: number;
  precision: TimePrecision;
  origin: boolean;
}

export function precisionOf(
  at: number | undefined,
  explicit?: TimePrecision
): TimePrecision {
  if (explicit) return explicit;
  if (at == null || !Number.isFinite(at)) return "day";
  const d = new Date(at);
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return "day";
  }
  return "instant";
}

function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

// Vendor release dates win across days. A clock time only refines the same day,
// so a gateway's later "added on" timestamp cannot move the release.
export function betterPublished(
  current: PublishedMark,
  incoming: PublishedMark
): PublishedMark {
  if (incoming.at == null || !Number.isFinite(incoming.at)) return current;
  if (current.at == null || !Number.isFinite(current.at)) return incoming;

  const sameDay = utcDay(current.at) === utcDay(incoming.at);
  if (sameDay && current.precision !== incoming.precision) {
    const instant = current.precision === "instant" ? current : incoming;
    const dated = current.precision === "day" ? current : incoming;
    return {
      at: instant.at,
      precision: "instant",
      origin: dated.origin || instant.origin,
    };
  }

  if (!sameDay && current.origin !== incoming.origin) {
    return incoming.origin ? incoming : current;
  }
  if (incoming.at < current.at) return incoming;
  if (incoming.at > current.at) return current;
  return incoming.origin ? incoming : current;
}

export function parseReleaseDate(raw: string | undefined): {
  at?: number;
  precision?: TimePrecision;
} {
  if (!raw) return {};
  const trimmed = raw.trim();
  const at = Date.parse(trimmed);
  if (!Number.isFinite(at)) return {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { at, precision: "day" };
  return { at, precision: precisionOf(at) };
}
