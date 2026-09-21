import assert from "node:assert/strict";
import { betterPublished, identify } from "./dedupe";

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

const kept = betterPublished(
  { at: august, precision: "day", origin: true },
  { at: clock, precision: "instant", origin: false }
);
assert.equal(kept.at, august);
assert.equal(kept.precision, "day");
assert.equal(kept.origin, true);

console.log("dedupe tests ok");
