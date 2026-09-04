import type { SourceAdapter } from "../types";
import { openrouter } from "./openrouter";
import { modelsdev } from "./modelsdev";
import { huggingface } from "./huggingface";

export function getSources(): SourceAdapter[] {
  return [openrouter, modelsdev, huggingface];
}
