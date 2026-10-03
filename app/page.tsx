import { getCachedTimeline } from "@/lib/cached-events";
import TimelineClient from "./timeline-client";

// Render at request time (no Redis access during build); Redis reads are
// de-duplicated by unstable_cache in getCachedTimeline.
export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await getCachedTimeline();
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Model Watch</h1>
        <p className="mt-1 text-sm text-zinc-500">
          New AI model releases across providers. Subscribe via{" "}
          <a href="/feed.xml" className="underline">
            RSS
          </a>{" "}
          or{" "}
          <a href="/feed.atom" className="underline">
            Atom
          </a>
          .
        </p>
      </header>
      <TimelineClient events={events} />
    </main>
  );
}
