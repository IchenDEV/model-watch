import { unstable_cache } from "next/cache";
import { getStore } from "./store";

/** Next.js data-cache wrapper so Upstash POST calls are not made on every hit. */
export const getCachedTimeline = unstable_cache(
  async () => getStore().listEvents(200),
  ["timeline-events"],
  { revalidate: 60, tags: ["events"] }
);

export const getCachedFeed = unstable_cache(
  async () => getStore().listEvents(50),
  ["feed-events"],
  { revalidate: 300, tags: ["events"] }
);
