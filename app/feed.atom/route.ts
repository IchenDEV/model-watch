import { getCachedFeed } from "@/lib/cached-events";
import { renderAtom } from "@/lib/feeds";

export const dynamic = "force-dynamic";

export async function GET() {
  const events = await getCachedFeed();
  return new Response(renderAtom(events), {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
