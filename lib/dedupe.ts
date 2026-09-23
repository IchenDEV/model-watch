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
  zai: "zhipu",
  "z-ai": "zhipu",
  "zai-org": "zhipu",
  zhipu: "zhipu",
  zhipuai: "zhipu",
  bigmodel: "zhipu",
  thudm: "zhipu",
  moonshotai: "moonshot",
  moonshot: "moonshot",
  "bytedance-seed": "bytedance",
  bytedance: "bytedance",
  "meta-llama": "meta",
  qwen: "alibaba",
  aliyun: "alibaba",
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
  "deepseek-ai": "deepseek",
  deepseek: "deepseek",
  ai21: "ai21",
  nvidia: "nvidia",
  microsoft: "microsoft",
  stability: "stability",
  writer: "writer",
  luma: "luma",
  twelvelabs: "twelvelabs",
  "typesafe-ai": "typesafe",
  "alibaba-cn": "alibaba",
  xiaomi: "xiaomi",
  mimo: "xiaomi",
  minimaxai: "minimax",
  minimax: "minimax",
  "stepfun-ai": "stepfun",
  stepfun: "stepfun",
  "baichuan-inc": "baichuan",
  baichuan: "baichuan",
  internlm: "internlm",
  "xiaomi-token-plan-cn": "xiaomi",
  "xiaomi-token-plan-ams": "xiaomi",
  "xiaomi-token-plan-sgp": "xiaomi",
};

// Hosts that resell someone else's model. They must not become the vendor.
const GATEWAYS = new Set([
  "openrouter",
  "kilo",
  "nano-gpt",
  "vercel",
  "requesty",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "cloudflare",
  "@cf",
  "together",
  "groq",
  "deepinfra",
  "azure",
  "amazon-bedrock",
  "google-vertex",
  "vertex",
  "github-copilot",
  "opencode",
  "opencode-go",
  "llmgateway",
  "llmgateway-providers",
  "poe",
  "abacus",
  "302ai",
  "aihubmix",
  "anyapi",
  "fastrouter",
  "helicone",
  "edenai",
  "crossmodel",
  "daoxe",
  "frogbot",
  "impossibl",
  "jiekou",
  "kenari",
  "merge-gateway",
  "ofox",
  "opper",
  "orcarouter",
  "perplexity-agent",
  "pioneer",
  "qiniu-ai",
  "venice",
  "zenmux",
  "oci",
  "neon",
  "empiriolabs",
  "vivgrid",
  "stealth",
  "consensusprotocol",
  "fireworks",
  "fireworks-ai",
  "accounts",
  "tee",
  "novita",
  "bailian",
  "gonka24",
  "infer",
  "chutes",
  "regolo-ai",
  "hyper",
  "tensorx",
  "crof",
  "berget",
  "cortecs",
  "runinfra",
  "aiand",
  "evroc",
  "wandb",
  "kosmik",
  "iteracompute",
  "thinkingmachines",
  "cline-pass",
  "cline",
  "digitalocean",
  "vultr",
  "snowflake-cortex",
  "above",
  "ambient",
  "agentrouter",
  "meganova",
  "inferx",
  "nan",
  "gitlab",
  "azure-cognitive-services",
  "databricks",
]);

// Stealth listings that were later revealed as an existing model.
const SLUG_ALIASES: Record<string, string> = {
  "union-alpha": "pareto",
  "gpt-56-luna": "gpt-5.6-luna",
  "gpt-56-sol": "gpt-5.6-sol",
  "gpt-56-terra": "gpt-5.6-terra",
  "gpt-56-luna-pro": "gpt-5.6-luna-pro",
  "gpt-56-sol-pro": "gpt-5.6-sol-pro",
  "gpt-56-terra-pro": "gpt-5.6-terra-pro",
};

const REGION_PREFIXES = new Set([
  "us",
  "eu",
  "jp",
  "ap",
  "sa",
  "ca",
  "au",
  "in",
  "global",
]);

const FAMILY_VENDOR: [RegExp, string][] = [
  [/^mimo/, "xiaomi"],
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
  [/^baichuan/, "baichuan"],
  [/^internlm/, "internlm"],
  [/^command/, "cohere"],
  [/^(solar|solar-mini|solar-pro)/, "upstage"],
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

const EXCLUSIVE_FAMILIES = new Set([
  "xiaomi",
  "zhipu",
  "alibaba",
  "anthropic",
  "openai",
  "google",
  "x-ai",
  "deepseek",
  "moonshot",
  "bytedance",
  "minimax",
  "stepfun",
  "cohere",
  "upstage",
]);

const CLOUD_RESELLERS = new Set([
  "tencent",
  "ovhcloud",
  "azure",
  "amazon",
  "google-vertex",
]);

// Region labels only. Vendor tokens stay in the id so they can be recovered.
export function stripBedrockPrefixes(name: string): string {
  const parts = name.split(".");
  while (parts.length > 1 && REGION_PREFIXES.has(parts[0])) parts.shift();
  return parts.join(".");
}

function normalizeSlug(name: string): string {
  let slug = stripBedrockPrefixes(name.toLowerCase().replace(/^~/, ""))
    .replace(/@.*$/, "")
    .replace(/:(batch|free|thinking|official|online)$/i, "")
    .replace(/-(free|thinking|batch|official|online|contributor-free)$/i, "")
    .replace(/_/g, "-")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-\d{8}$/, "");

  let prev = "";
  while (prev !== slug) {
    prev = slug;
    slug = slug
      .replace(/:(batch|free|thinking|official|online)$/i, "")
      .replace(/-(free|thinking|batch|official|online|contributor-free)$/i, "");
  }
  slug = slug.replace(/^gpt-56-/i, "gpt-5.6-");
  return SLUG_ALIASES[slug] ?? slug;
}

export function looseSlug(slug: string): string {
  return slug
    .replace(/^gpt-56-/i, "gpt-5-6-")
    .replace(/(\d)\.(\d)/g, "$1-$2")
    .replace(/(\d)p(\d)/g, "$1-$2");
}

function peelVendorPrefix(slug: string): { vendor?: string; slug: string } {
  const dot = slug.indexOf(".");
  if (dot > 0) {
    const head = slug.slice(0, dot);
    if (head in VENDOR_ALIASES) {
      return { vendor: VENDOR_ALIASES[head], slug: slug.slice(dot + 1) };
    }
  }
  const dash = slug.indexOf("-");
  if (dash > 0) {
    const head = slug.slice(0, dash);
    if (head in VENDOR_ALIASES) {
      const rest = slug.slice(dash + 1);
      if (inferFamilyVendor(rest)) {
        return { vendor: VENDOR_ALIASES[head], slug: rest };
      }
    }
  }
  return { slug };
}

export interface Identity {
  key: string;
  slug: string;
  vendor: string;
  origin: boolean;
}

function isOrigin(source: string, host: string, vendor: string, slug: string): boolean {
  if (slug.endsWith("-latest")) return false;
  if (source === "openrouter" || source === "opencode") return false;
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

  const rawOrg = org || peeled.vendor || "";
  const orgVendor = aliasVendor(rawOrg);
  const orgIsGateway = !orgVendor || GATEWAYS.has(orgVendor);
  const hinted = vendorHint ? aliasVendor(vendorHint) : "";
  const fromSlug = inferFamilyVendor(slug) ?? "";
  const hostVendor = aliasVendor(host || "unknown");

  let vendor = "";
  if (
    fromSlug &&
    EXCLUSIVE_FAMILIES.has(fromSlug) &&
    (orgIsGateway || CLOUD_RESELLERS.has(orgVendor) || (GATEWAYS.has(hostVendor) && orgVendor === hostVendor))
  ) {
    vendor = fromSlug;
  } else if (!orgIsGateway) {
    vendor = orgVendor;
  } else {
    vendor = hinted || fromSlug || (GATEWAYS.has(hostVendor) ? "model" : hostVendor);
  }

  return {
    key: `${vendor}:${slug}`,
    slug,
    vendor,
    origin: isOrigin(source, host, vendor, slug),
  };
}

export function vendorOf(key: string): string {
  return key.slice(0, key.indexOf(":"));
}

export function slugOf(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}

function isReseller(vendor: string): boolean {
  return vendor === "model" || GATEWAYS.has(vendor);
}

export function preferCanonical(current: string, incoming: string): string {
  if (!current) return incoming;
  const currentReseller = isReseller(vendorOf(current));
  const incomingReseller = isReseller(vendorOf(incoming));
  if (currentReseller && !incomingReseller) return incoming;
  if (!currentReseller && incomingReseller) return current;
  return current;
}

// Fold gateway copies, dotted/dashed version spellings, and `-latest` aliases
// onto one key. Two different makers with the same slug stay separate.
export function collapseKeys(keys: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const buckets = new Map<string, string[]>();
  for (const key of keys) {
    const loose = looseSlug(slugOf(key));
    const list = buckets.get(loose) ?? [];
    list.push(key);
    buckets.set(loose, list);
  }

  const looseTarget = new Map<string, string>();
  for (const [loose, list] of buckets) {
    const real = [
      ...new Set(list.map(vendorOf).filter((vendor) => !isReseller(vendor))),
    ];
    const dotted = list.map(slugOf).find((slug) => /\d\.\d/.test(slug));
    const slug = dotted ?? slugOf(list[0]);
    if (real.length === 1) {
      looseTarget.set(loose, `${real[0]}:${slug}`);
      for (const key of list) out.set(key, `${real[0]}:${slug}`);
    } else if (real.length === 0) {
      looseTarget.set(loose, `model:${slug}`);
      for (const key of list) out.set(key, `model:${slug}`);
    } else {
      const family = inferFamilyVendor(slug);
      const preferred = family && real.includes(family) ? `${family}:${slug}` : "";
      for (const key of list) {
        const vendor = vendorOf(key);
        if (!isReseller(vendor)) out.set(key, key);
        else if (preferred) out.set(key, preferred);
        else out.set(key, `model:${slugOf(key)}`);
      }
    }
  }

  const GENERAL_PREFIXES = new Set([
    "gpt",
    "glm",
    "claude",
    "gemini",
    "deepseek",
    "qwen",
    "mimo",
    "kimi",
    "meta",
    "llama",
    "mistral",
  ]);

  const targetsByVendor = new Map<string, { key: string; slug: string }[]>();
  for (const targetKey of new Set(out.values())) {
    const v = vendorOf(targetKey);
    const s = slugOf(targetKey);
    if (s.endsWith("-latest")) continue;
    const list = targetsByVendor.get(v) || [];
    list.push({ key: targetKey, slug: s });
    targetsByVendor.set(v, list);
  }

  for (const key of keys) {
    const slug = slugOf(key);
    if (!slug.endsWith("-latest")) continue;
    const v = vendorOf(out.get(key) ?? key);
    const base = looseSlug(slug.slice(0, -"-latest".length));
    const baseTarget = looseTarget.get(base);
    if (baseTarget && !baseTarget.endsWith("-latest")) {
      out.set(key, baseTarget);
      continue;
    }

    const candidates = targetsByVendor.get(v) || [];
    const tokens = base.split("-").filter((t) => t && !GENERAL_PREFIXES.has(t));
    if (tokens.length === 0) tokens.push(base);

    const matches = candidates.filter((c) =>
      tokens.every((tok) => c.slug.includes(tok))
    );

    if (matches.length > 0) {
      const VARIANT_SUFFIX = /-(fast|preview|mini|thinking|pro|online|batch|beta|exp)/i;
      matches.sort((a, b) => {
        const aVar = VARIANT_SUFFIX.test(a.slug);
        const bVar = VARIANT_SUFFIX.test(b.slug);
        if (aVar !== bVar) return aVar ? 1 : -1;
        const aDot = /\d\.\d/.test(a.slug);
        const bDot = /\d\.\d/.test(b.slug);
        if (aDot !== bDot) return aDot ? -1 : 1;
        return b.slug.localeCompare(a.slug);
      });
      out.set(key, matches[0].key);
    }
  }
  return out;
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
