import { XMLParser } from "fast-xml-parser";
import type { SourceAdapter, SourceItem } from "../types";
import { fetchWithTimeout } from "../fetch";

const FEEDS = [
  { provider: "openai", url: "https://openai.com/news/rss.xml" },
  { provider: "deepmind", url: "https://deepmind.google/blog/rss.xml" },
];

const KEYWORD_RE = /introduc|announc|unveil|launching|now available/i;

const parser = new XMLParser({ ignoreAttributes: true });

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
}

function itemsOf(xml: string): RssItem[] {
  const doc = parser.parse(xml) as {
    rss?: { channel?: { item?: RssItem | RssItem[] } };
  };
  const item = doc.rss?.channel?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export const blogs: SourceAdapter = {
  name: "blogs",
  async fetch(): Promise<SourceItem[]> {
    const items: SourceItem[] = [];
    for (const feed of FEEDS) {
      try {
        const res = await fetchWithTimeout(feed.url);
        const xml = await res.text();
        for (const entry of itemsOf(xml)) {
          const title = (entry.title || "").trim();
          const link = (entry.link || "").trim();
          if (!title || !link) continue;
          const summary = (entry.description || "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 300);
          if (!KEYWORD_RE.test(title)) continue;
          items.push({
            externalId: link,
            title,
            provider: feed.provider,
            url: link,
            summary,
            tags: ["blog"],
            publishedAt: entry.pubDate
              ? Date.parse(entry.pubDate) || undefined
              : undefined,
          });
        }
      } catch (err) {
        console.error(`blogs: feed ${feed.url} failed:`, err);
      }
    }
    return items;
  },
};
