import { getStore } from "@/lib/store";
import TimelineClient from "./timeline-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const events = await getStore().listEvents(200);
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
