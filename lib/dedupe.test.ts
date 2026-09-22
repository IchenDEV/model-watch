import assert from "node:assert/strict";
import { betterPublished, collapseKeys, identify, preferCanonical } from "./dedupe";

const kilo = identify(
  "models.dev/kilo",
  "kilo/prism-ml/ternary-bonsai-2-27b"
);
const openrouter = identify(
  "models.dev/openrouter",
  "openrouter/prism-ml/ternary-bonsai-2-27b"
);
const nano = identify(
  "models.dev/nano-gpt",
  "nano-gpt/prism-ml/ternary-bonsai-2-27b"
);
assert.equal(kilo.key, "prism-ml:ternary-bonsai-2-27b");
assert.equal(kilo.key, openrouter.key);
assert.equal(openrouter.key, nano.key);
assert.equal(kilo.origin, false);

const xai = identify("models.dev/xai", "xai/grok-4.7", "x-ai");
const listed = identify("openrouter", "x-ai/grok-4.7");
const vercel = identify(
  "models.dev/vercel",
  "vercel/spacexai/grok-4.7",
  "x-ai"
);
assert.equal(xai.key, "x-ai:grok-4.7");
assert.equal(xai.origin, true);
assert.equal(listed.key, xai.key);
assert.equal(listed.origin, false);
assert.equal(vercel.key, xai.key);
assert.equal(vercel.origin, false);

const bedrock = identify(
  "models.dev/amazon-bedrock",
  "amazon-bedrock/global.xai.grok-4.6",
  "x-ai"
);
assert.equal(bedrock.key, "x-ai:grok-4.6");

const claude = identify(
  "models.dev/amazon-bedrock",
  "amazon-bedrock/us.anthropic.claude-sonnet-4.5"
);
assert.equal(claude.key, "anthropic:claude-sonnet-4.5");

const qwen = identify("models.dev/alibaba", "alibaba/qwen3.8-27b", "alibaba");
assert.equal(qwen.key, "alibaba:qwen3.8-27b");

const day = Date.parse("2026-09-21T00:00:00.000Z");
const clock = Date.parse("2026-09-21T16:19:01.000Z");
const august = Date.parse("2026-08-12T00:00:00.000Z");

const refined = betterPublished(
  { at: day, precision: "day", origin: true },
  { at: clock, precision: "instant", origin: false }
);
assert.equal(refined.at, clock);
assert.equal(refined.precision, "instant");
assert.equal(refined.origin, true);

const stealth = identify("models.dev/stealth", "stealth/union-alpha");
const opencode = identify("models.dev/opencode", "opencode/union-alpha");
assert.equal(stealth.key, "model:pareto");
assert.equal(opencode.key, stealth.key);

const pareto = identify(
  "models.dev/kilo",
  "kilo/unbiased/pareto"
);
assert.equal(pareto.key, "unbiased:pareto");
assert.equal(preferCanonical("model:pareto", "unbiased:pareto"), "unbiased:pareto");
assert.equal(preferCanonical("unbiased:pareto", "model:pareto"), "unbiased:pareto");

const collapsed = collapseKeys([stealth.key, pareto.key]);
assert.equal(collapsed.get("model:pareto"), "unbiased:pareto");
assert.equal(collapsed.get("unbiased:pareto"), "unbiased:pareto");

const dotted = identify("models.dev/alibaba", "alibaba/qwen3.8-omni-flash", "alibaba");
const dashed = identify("models.dev/empiriolabs", "empiriolabs/qwen3-8-omni-flash", "alibaba");
assert.equal(dotted.key, "alibaba:qwen3.8-omni-flash");
assert.equal(dashed.key, "alibaba:qwen3-8-omni-flash");
const spellings = collapseKeys([dotted.key, dashed.key]);
assert.equal(spellings.get(dotted.key), "alibaba:qwen3.8-omni-flash");
assert.equal(spellings.get(dashed.key), "alibaba:qwen3.8-omni-flash");

const jev = identify("models.dev/typesafe", "typesafe/jev");
const jevGateway = identify("models.dev/vivgrid", "vivgrid/jev");
const jevLatest = identify("models.dev/typesafe", "typesafe/jev-latest");
assert.equal(jev.key, "typesafe:jev");
assert.equal(jevGateway.key, "model:jev");
const qwenBase = identify("models.dev/ovhcloud", "ovhcloud/qwen3.8-27b", "alibaba");
const qwenReseller = identify(
  "models.dev/llmgateway-providers",
  "llmgateway-providers/consensusprotocol/qwen3.8-27b"
);
assert.equal(qwenBase.key, "alibaba:qwen3.8-27b");
assert.equal(qwenReseller.key, "alibaba:qwen3.8-27b");
const bailian = identify(
  "models.dev/ofox",
  "ofox/bailian/qwen3.8-27b",
  "alibaba"
);
assert.equal(bailian.key, "alibaba:qwen3.8-27b");
const lab = identify(
  "models.dev/nano-gpt",
  "nano-gpt/slowburn/gemma4-31b-splituntied",
  "google"
);
assert.equal(lab.key, "slowburn:gemma4-31b-splituntied");
const qwenCollapsed = collapseKeys([
  qwenBase.key,
  "consensusprotocol:qwen3.8-27b",
  "bailian:qwen3.8-27b",
  "model:qwen3.8-27b",
]);
assert.equal(qwenCollapsed.get(qwenBase.key), "alibaba:qwen3.8-27b");
assert.equal(qwenCollapsed.get("consensusprotocol:qwen3.8-27b"), "alibaba:qwen3.8-27b");
assert.equal(qwenCollapsed.get("model:qwen3.8-27b"), "alibaba:qwen3.8-27b");
assert.equal(qwenCollapsed.get("bailian:qwen3.8-27b"), "alibaba:qwen3.8-27b");

const jevKeys = collapseKeys([jev.key, jevGateway.key, jevLatest.key]);
assert.equal(jevKeys.get(jev.key), "typesafe:jev");
assert.equal(jevKeys.get(jevGateway.key), "typesafe:jev");
assert.equal(jevKeys.get(jevLatest.key), "typesafe:jev");

// Xiaomi MiMo tests: free vs paid and gateway reselling
const mimoOfficial = identify("openrouter", "xiaomi/mimo-v2.6-flash");
const mimoFree = identify("models.dev/opencode", "opencode/mimo-v2.6-flash-free");
assert.equal(mimoOfficial.key, "xiaomi:mimo-v2.6-flash");
assert.equal(mimoFree.key, "xiaomi:mimo-v2.6-flash");

const mimoTencent = identify(
  "models.dev/llmgateway-providers",
  "llmgateway-providers/tencent/mimo-v2.5-pro"
);
assert.equal(mimoTencent.key, "xiaomi:mimo-v2.5-pro");

// Mode suffixes (-thinking, -free, -batch)
const glmFree = identify("models.dev/orcarouter", "orcarouter/zhipu/glm-5.3-flash-free");
const glmBase = identify("models.dev/zhipu", "zhipu/glm-5.3-flash");
assert.equal(glmFree.key, "zhipu:glm-5.3-flash");
assert.equal(glmBase.key, "zhipu:glm-5.3-flash");

const claudeThinking = identify("models.dev/302ai", "302ai/anthropic/claude-opus-5-thinking");
const claudeBase = identify("models.dev/anthropic", "anthropic/claude-opus-5");
assert.equal(claudeThinking.key, "anthropic:claude-opus-5");
assert.equal(claudeBase.key, "anthropic:claude-opus-5");

// Version notation collapse: 5p3 -> 5.3
const pSpelling = collapseKeys(["zhipu:glm-5.3-fast", "zhipu:glm-5p3-fast"]);
assert.equal(pSpelling.get("zhipu:glm-5p3-fast"), "zhipu:glm-5.3-fast");

// OpenAI latest pointers: gpt-*-latest collapse to actual model releases
const openaiTestKeys = [
  "openai:gpt-6-astra",
  "openai:gpt-6-astra-fast",
  "openai:gpt-5.6-sol",
  "openai:gpt-5.6-terra",
  "openai:gpt-5.6-luna",
  "openai:gpt-astra-latest",
  "openai:gpt-sol-latest",
  "openai:gpt-terra-latest",
  "openai:gpt-luna-latest",
];
const openaiCollapsed = collapseKeys(openaiTestKeys);
assert.equal(openaiCollapsed.get("openai:gpt-astra-latest"), "openai:gpt-6-astra");
assert.equal(openaiCollapsed.get("openai:gpt-sol-latest"), "openai:gpt-5.6-sol");
assert.equal(openaiCollapsed.get("openai:gpt-terra-latest"), "openai:gpt-5.6-terra");
assert.equal(openaiCollapsed.get("openai:gpt-luna-latest"), "openai:gpt-5.6-luna");

// Origin of -latest pointer must never be true
const astraLatestIdn = identify("models.dev/openai", "openai/gpt-astra-latest");
assert.equal(astraLatestIdn.origin, false);

const kept = betterPublished(
  { at: august, precision: "day", origin: true },
  { at: clock, precision: "instant", origin: false }
);
assert.equal(kept.at, august);
assert.equal(kept.precision, "day");
assert.equal(kept.origin, true);

console.log("dedupe tests ok");
