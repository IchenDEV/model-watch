import type { ModelEvent, SourceItem } from "./types";
import type { Store } from "./store-types";
import { getStore } from "./store";
import { getSources } from "./sources";
import { getDirectProviders, fetchDirectProvider } from "./sources/direct";
import {
  betterPublished,
  collapseKeys,
  identify,
  precisionOf,
  preferCanonical,
  toEvent,
  type PublishedMark,
} from "./dedupe";
import { notifyFeishu } from "./notify";

const BOOTSTRAP_COUNT = 20;
const PRUNE_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const RECONCILE_EVERY_MS = 12 * 60 * 60 * 1000;
const RECONCILE_VERSION = "7";

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
    const idn = identify(event.source, event.externalId, item.vendor);
    event.canonical = idn.key;
    event.publishedAtPrecision = precisionOf(
      event.publishedAt,
      item.publishedAtPrecision
    );
    event.publishedOrigin = idn.origin;
    const wonCanonical = await store.setCanonicalNX(idn.key, event.id);
    if (!wonCanonical) {
      const winnerId = await store.getCanonical(idn.key);
      if (winnerId) {
        const existing = await store.getEvent(winnerId);
        if (existing) {
          const next = betterPublished(markOf(existing), markOf(event));
          const sources = existing.sources.includes(event.source)
            ? existing.sources
            : [...existing.sources, event.source];
          const changed =
            next.at !== existing.publishedAt ||
            next.precision !== existing.publishedAtPrecision ||
            next.origin !== existing.publishedOrigin ||
            sources.length !== existing.sources.length;
          if (changed) {
            const updated: ModelEvent = {
              ...existing,
              canonical: preferCanonical(existing.canonical, idn.key),
              publishedAt: next.at,
              publishedAtPrecision: next.at == null ? undefined : next.precision,
              publishedOrigin: next.origin,
              sources,
            };
            await store.writeEvents([updated]);
            const queued = toNotify.find((entry) => entry.id === existing.id);
            if (queued) Object.assign(queued, updated);
          }
          continue;
        }
        // 赢家事件已被清理，让位给当前事件
        await store.setCanonical(idn.key, event.id);
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

  const catalog = new Map<string, PublishedMark>();
  for (let i = 0; i < jobs.length; i++) {
    const outcome = settled[i];
    if (outcome.status !== "fulfilled") continue;
    for (const item of outcome.value.items) {
      const source = item.source ?? jobs[i].name;
      const idn = identify(source, item.externalId, item.vendor);
      const mark: PublishedMark = {
        at: item.publishedAt,
        precision: precisionOf(item.publishedAt, item.publishedAtPrecision),
        origin: idn.origin,
      };
      const prev = catalog.get(idn.key);
      catalog.set(idn.key, prev ? betterPublished(prev, mark) : mark);
    }
  }

  let removed = new Set<string>();
  try {
    removed = await reconcileIfDue(getStore(), catalog);
  } catch (err) {
    console.error("reconcile failed:", err);
  }

  const toSend = notifyQueue.filter((event) => !removed.has(event.id));
  if (toSend.length > 0) {
    await notifyFeishu(toSend);
  }

  try {
    await getStore().pruneEvents(PRUNE_AGE_MS);
  } catch (err) {
    console.error("prune failed:", err);
  }

  const ok = Object.values(sources).some((s) => s.errors.length === 0);
  return { ok, sources, notified: toSend.length };
}

function markOf(event: ModelEvent): PublishedMark {
  const origin = event.publishedAtPrecision
    ? Boolean(event.publishedOrigin)
    : identify(event.source, event.externalId).origin;
  return {
    at: event.publishedAt,
    precision: precisionOf(event.publishedAt, event.publishedAtPrecision),
    origin,
  };
}

async function reconcileIfDue(
  store: Store,
  catalog: Map<string, PublishedMark>
): Promise<Set<string>> {
  const version = await store.getMeta("catalog-reconcile-version");
  const last = await store.getMeta("catalog-reconcile-at");
  const due =
    version !== RECONCILE_VERSION ||
    !last ||
    Date.now() - Number(last) > RECONCILE_EVERY_MS;
  if (!due) return new Set();
  const removed = await reconcileEvents(store, catalog);
  await store.setMeta("catalog-reconcile-version", RECONCILE_VERSION);
  await store.setMeta("catalog-reconcile-at", String(Date.now()));
  return removed;
}

function listingRank(event: ModelEvent, targetKey: string): number {
  const id = identify(event.source, event.externalId);
  if (id.key === targetKey && id.origin) return 3;
  if (id.key === targetKey) return 2;
  if (id.origin) return 1;
  return 0;
}

const REDIRECT_SUMMARY = /always redirects to the latest/i;

function preferSummary(
  current: string | undefined,
  currentRank: number,
  incoming: string | undefined,
  incomingRank: number
): { summary: string | undefined; rank: number } {
  const kept = current?.trim();
  const next = incoming?.trim();
  if (!next) return { summary: kept, rank: currentRank };
  if (!kept) return { summary: next, rank: incomingRank };
  const keptRedirect = REDIRECT_SUMMARY.test(kept);
  const nextRedirect = REDIRECT_SUMMARY.test(next);
  if (keptRedirect !== nextRedirect) {
    return nextRedirect
      ? { summary: kept, rank: currentRank }
      : { summary: next, rank: incomingRank };
  }
  if (incomingRank !== currentRank) {
    return incomingRank > currentRank
      ? { summary: next, rank: incomingRank }
      : { summary: kept, rank: currentRank };
  }
  return next.length > kept.length
    ? { summary: next, rank: incomingRank }
    : { summary: kept, rank: currentRank };
}

async function reconcileEvents(
  store: Store,
  catalog: Map<string, PublishedMark>
): Promise<Set<string>> {
  const events = await store.listEvents(10000);
  const initial = new Map<string, ModelEvent[]>();
  for (const event of events) {
    const key = identify(event.source, event.externalId).key;
    const list = initial.get(key) ?? [];
    list.push(event);
    initial.set(key, list);
  }
  const aliases = new Set<string>(catalog.keys());
  for (const list of initial.values()) {
    for (const event of list) {
      if (event.canonical) aliases.add(event.canonical);
    }
  }
  const collapsed = collapseKeys([...initial.keys(), ...aliases]);
  const groups = new Map<string, ModelEvent[]>();
  for (const [key, list] of initial) {
    const target = collapsed.get(key) ?? key;
    const dest = groups.get(target) ?? [];
    dest.push(...list);
    groups.set(target, dest);
  }

  const writes: ModelEvent[] = [];
  const deletions: string[] = [];
  const canonicals: [string, string][] = [];

  for (const [key, group] of groups) {
    group.sort((a, b) => a.detectedAt - b.detectedAt);
    const winner = group[0];
    let mark = markOf(winner);
    for (const other of group.slice(1)) mark = betterPublished(mark, markOf(other));
    for (const [sourceKey, mapped] of collapsed) {
      if (mapped !== key) continue;
      const fromCatalog = catalog.get(sourceKey);
      if (fromCatalog) mark = betterPublished(mark, fromCatalog);
    }

    const sources = new Set<string>();
    let summary: string | undefined;
    let summaryRank = -1;
    let url = winner.url;
    let title = winner.title;
    let provider = winner.provider;
    let listing = -1;
    for (const other of group) {
      for (const source of other.sources) sources.add(source);
      const rank = listingRank(other, key);
      const picked = preferSummary(summary, summaryRank, other.summary, rank);
      summary = picked.summary;
      summaryRank = picked.rank;
      if (rank > listing && other.title) {
        listing = rank;
        title = other.title;
        if (other.url) url = other.url;
        if (other.provider) provider = other.provider;
      }
    }
    const sourceList = [...sources];
    const next: ModelEvent = {
      ...winner,
      canonical: key,
      title,
      provider,
      url,
      summary: summary ?? "",
      sources: sourceList,
      publishedAt: mark.at,
      publishedAtPrecision: mark.at == null ? undefined : mark.precision,
      publishedOrigin: mark.origin,
    };
    const changed =
      next.canonical !== winner.canonical ||
      next.publishedAt !== winner.publishedAt ||
      next.publishedAtPrecision !== winner.publishedAtPrecision ||
      Boolean(next.publishedOrigin) !== Boolean(winner.publishedOrigin) ||
      next.url !== winner.url ||
      next.title !== winner.title ||
      next.summary !== winner.summary ||
      sourceList.length !== winner.sources.length ||
      sourceList.some((source) => !winner.sources.includes(source));
    if (changed) writes.push(next);
    canonicals.push([key, winner.id]);
    for (const [sourceKey, mapped] of collapsed) {
      if (mapped === key) canonicals.push([sourceKey, winner.id]);
    }
    for (const other of group.slice(1)) deletions.push(other.id);
  }

  await store.writeEvents(writes);
  await store.deleteEvents(deletions);
  await store.setCanonicalMany(canonicals);
  return new Set(deletions);
}
