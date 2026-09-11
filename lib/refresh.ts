import type { ModelEvent, SourceItem } from "./types";
import { getStore } from "./store";
import { getSources } from "./sources";
import { getDirectProviders, fetchDirectProvider } from "./sources/direct";
import { canonicalKey, toEvent } from "./dedupe";
import { notifyFeishu } from "./notify";

const BOOTSTRAP_COUNT = 20;
const PRUNE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface SourceResult {
  fetched: number;
  new: number;
  errors: string[];
}

export interface RefreshResult {
  ok: boolean;
  sources: Record<string, SourceResult>;
  notified: number;
}

async function processItems(
  sourceName: string,
  items: SourceItem[]
): Promise<{ result: SourceResult; toNotify: ModelEvent[] }> {
  const store = getStore();
  const result: SourceResult = { fetched: items.length, new: 0, errors: [] };
  const toNotify: ModelEvent[] = [];
  const now = Date.now();

  const previous = await store.getSnapshot(sourceName);
  const bootstrap = previous === null;
  const prevSet = new Set(previous ?? []);
  await store.setSnapshot(sourceName, items.map((i) => i.externalId));

  let candidates: { item: SourceItem; notify: boolean }[];
  if (bootstrap) {
    const sorted = [...items].sort(
      (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0)
    );
    candidates = sorted
      .slice(0, BOOTSTRAP_COUNT)
      .map((item) => ({ item, notify: false }));
  } else {
    candidates = items
      .filter((i) => !prevSet.has(i.externalId))
      .map((item) => ({ item, notify: true }));
  }

  for (const { item, notify } of candidates) {
    const event = toEvent(sourceName, item, now);
    const key = canonicalKey(event.source, event.externalId, item.vendor);
    event.canonical = key;
    const wonCanonical = await store.setCanonicalNX(key, event.id);
    if (!wonCanonical) {
      const winnerId = await store.getCanonical(key);
      if (winnerId) {
        const existing = await store.getEvent(winnerId);
        if (existing) {
          if (!existing.sources.includes(event.source)) {
            await store.updateEventSources(winnerId, [
              ...existing.sources,
              event.source,
            ]);
          }
          continue;
        }
        // 赢家事件已被清理，让位给当前事件
        await store.setCanonical(key, event.id);
      }
    }
    const added = await store.addEventNX(event);
    if (!added) continue;
    result.new += 1;
    if (notify) toNotify.push(event);
  }

  return { result, toNotify };
}

export async function runRefresh(): Promise<RefreshResult> {
  const sources: Record<string, SourceResult> = {};
  const notifyQueue: ModelEvent[] = [];

  const jobs: { name: string; run: () => Promise<SourceItem[]> }[] =
    getSources().map((s) => ({ name: s.name, run: () => s.fetch() }));
  for (const p of getDirectProviders()) {
    jobs.push({ name: `direct/${p.name}`, run: () => fetchDirectProvider(p) });
  }

  const settled = await Promise.allSettled(
    jobs.map(async (job) => {
      const items = await job.run();
      return { job, items };
    })
  );

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
      console.error(`source ${job.name} failed:`, outcome.reason);
      sources[job.name] = { fetched: 0, new: 0, errors: [message] };
      continue;
    }
    try {
      const { result, toNotify } = await processItems(
        job.name,
        outcome.value.items
      );
      sources[job.name] = result;
      notifyQueue.push(...toNotify);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`source ${job.name} processing failed:`, err);
      sources[job.name] = {
        fetched: outcome.value.items.length,
        new: 0,
        errors: [message],
      };
    }
  }

  if (notifyQueue.length > 0) {
    await notifyFeishu(notifyQueue);
  }

  try {
    await getStore().pruneEvents(PRUNE_AGE_MS);
  } catch (err) {
    console.error("prune failed:", err);
  }

  const ok = Object.values(sources).some((s) => s.errors.length === 0);
  return { ok, sources, notified: notifyQueue.length };
}
