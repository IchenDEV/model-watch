import { getCachedFeed } from "@/lib/cached-events";
import { renderRss } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET() {
  const events = await getCachedFeed();
  return new Response(renderRss(events), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
