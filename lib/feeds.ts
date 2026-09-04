import { displayName, type ModelEvent } from "./types";

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function renderRss(events: ModelEvent[]): string {
  const base = siteUrl();
  const items = events
    .map((e) => {
      const date = new Date(e.publishedAt ?? e.detectedAt).toUTCString();
      return `    <item>
      <title>${escapeXml(displayName(e))}</title>
      <link>${escapeXml(e.url)}</link>
      <guid isPermaLink="false">${escapeXml(e.id)}</guid>
      <pubDate>${date}</pubDate>
      <description>${escapeXml(e.summary || `${e.title} (${e.provider})`)}</description>
      <category>${escapeXml(e.provider)}</category>
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Model Watch</title>
    <link>${escapeXml(base)}</link>
    <description>New AI model releases across providers</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

export function renderAtom(events: ModelEvent[]): string {
  const base = siteUrl();
  const updated = new Date(
    events[0]?.detectedAt ?? Date.now()
  ).toISOString();
  const entries = events
    .map((e) => {
      const date = new Date(e.publishedAt ?? e.detectedAt).toISOString();
      return `  <entry>
    <title>${escapeXml(displayName(e))}</title>
    <link href="${escapeXml(e.url)}"/>
    <id>urn:model-watch:${escapeXml(e.id)}</id>
    <updated>${date}</updated>
    <summary>${escapeXml(e.summary || `${e.title} (${e.provider})`)}</summary>
    <author><name>${escapeXml(e.provider)}</name></author>
  </entry>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Model Watch</title>
  <link href="${escapeXml(base)}"/>
  <link rel="self" href="${escapeXml(base)}/feed.atom"/>
  <id>${escapeXml(base)}/</id>
  <updated>${updated}</updated>
${entries}
</feed>
`;
}
