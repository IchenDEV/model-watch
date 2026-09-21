"use client";

import { useMemo, useState } from "react";
import { releasedLabel, seenLabel } from "@/lib/time";
import { displayName, type ModelEvent } from "@/lib/types";

export default function TimelineClient({
  events,
}: {
  events: ModelEvent[];
}) {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const sources = useMemo(
    () => Array.from(new Set(events.map((e) => e.source))).sort(),
    [events]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        displayName(e).toLowerCase().includes(q) ||
        e.externalId.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.provider.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q)
      );
    });
  }, [events, sourceFilter, query]);

  async function copyRss() {
    const url = `${window.location.origin}/feed.xml`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        >
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models…"
          className="w-56 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
        />
        <button
          onClick={copyRss}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm hover:border-zinc-500"
        >
          {copied ? "Copied!" : "Copy RSS link"}
        </button>
        <span className="text-sm text-zinc-500">
          {filtered.length} / {events.length} events
        </span>
      </div>

      <ol className="relative border-l border-zinc-800">
        {filtered.map((e) => (
          <li key={e.id} className="mb-8 ml-6">
            <span className="absolute -left-1.5 mt-2 h-3 w-3 rounded-full bg-zinc-600" />
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={e.url}
                target="_blank"
                rel="noreferrer"
                className="font-mono font-medium text-zinc-100 hover:underline"
              >
                {displayName(e)}
              </a>
              {e.sources.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400"
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              {e.title} · {e.provider} · {releasedLabel(e)} · {seenLabel(e.detectedAt)}
            </div>
            {e.summary && (
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                {e.summary}
              </p>
            )}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="ml-6 text-sm text-zinc-500">No events found.</li>
        )}
      </ol>
    </div>
  );
}
