import type { SourceItem } from "../types";
import { fetchWithTimeout } from "../fetch";

export interface DirectProvider {
  name: string;
  base: string;
  key: string;
  style?: "google" | "openai";
}

export function getDirectProviders(): DirectProvider[] {
  const raw = process.env.DIRECT_PROVIDERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is DirectProvider =>
        p && typeof p.name === "string" && typeof p.base === "string"
    );
  } catch (err) {
    console.error("direct: failed to parse DIRECT_PROVIDERS:", err);
    return [];
  }
}

export async function fetchDirectProvider(
  provider: DirectProvider
): Promise<SourceItem[]> {
  const style = provider.style === "google" ? "google" : "openai";
  const url =
    style === "google"
      ? `${provider.base}/models?key=${provider.key}`
      : `${provider.base}/models`;
  const headers: Record<string, string> =
    style === "google"
      ? {}
      : { Authorization: `Bearer ${provider.key}` };
  const res = await fetchWithTimeout(url, { headers });
  const json = (await res.json()) as {
    data?: { id: string; name?: string }[];
    models?: { name: string; displayName?: string; description?: string }[];
  };
  if (style === "google") {
    return (json.models ?? []).map((m) => {
      const id = m.name.replace(/^models\//, "");
      return {
        externalId: `${provider.name}/${id}`,
        title: m.displayName || id,
        provider: provider.name,
        url: `https://ai.google.dev/gemini-api/docs/models`,
        summary: (m.description || "").slice(0, 300),
        tags: ["direct"],
      };
    });
  }
  return (json.data ?? []).map((m) => ({
    externalId: `${provider.name}/${m.id}`,
    title: m.name || m.id,
    provider: provider.name,
    url: provider.base,
    summary: "",
    tags: ["direct"],
  }));
}
