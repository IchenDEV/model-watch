import { promises as fs } from "fs";
import path from "path";
import type { ModelEvent } from "./types";
import type { Store } from "./store-types";
import { compareEvents } from "./time";

interface FileData {
  snapshots: Record<string, string[]>;
  events: Record<string, ModelEvent>;
  canonical: Record<string, string>;
  meta?: Record<string, string>;
}

const DATA_FILE = path.join(process.cwd(), ".data", "store.json");

class FileStore implements Store {
  private data: FileData | null = null;
  private mtime = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  private async load(): Promise<FileData> {
    try {
      const stat = await fs.stat(DATA_FILE);
      if (this.data && this.mtime === stat.mtimeMs) return this.data;
      this.mtime = stat.mtimeMs;
      this.data = JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as FileData;
    } catch {
      if (!this.data) {
        this.data = { snapshots: {}, events: {}, canonical: {}, meta: {} };
      }
    }
    return this.data!;
  }

  private async save(): Promise<void> {
    const snapshot = this.data;
    if (!snapshot) return;
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
      await fs.writeFile(DATA_FILE, JSON.stringify(snapshot, null, 2));
      this.mtime = (await fs.stat(DATA_FILE)).mtimeMs;
    });
    return this.writeQueue;
  }

  async getSnapshot(source: string): Promise<string[] | null> {
    const d = await this.load();
    return d.snapshots[source] ?? null;
  }

  async setSnapshot(source: string, ids: string[]): Promise<void> {
    const d = await this.load();
    d.snapshots[source] = ids;
    await this.save();
  }

  async addEventNX(event: ModelEvent): Promise<boolean> {
    const d = await this.load();
    if (d.events[event.id]) return false;
    d.events[event.id] = event;
    await this.save();
    return true;
  }

  async getEvent(id: string): Promise<ModelEvent | null> {
    const d = await this.load();
    return d.events[id] ?? null;
  }

  async updateEventSources(id: string, sources: string[]): Promise<void> {
    const d = await this.load();
    const ev = d.events[id];
    if (!ev) return;
    ev.sources = sources;
    await this.save();
  }

  async writeEvents(events: ModelEvent[]): Promise<void> {
    if (events.length === 0) return;
    const d = await this.load();
    for (const event of events) {
      if (!d.events[event.id]) continue;
      d.events[event.id] = event;
    }
    await this.save();
  }

  async deleteEvents(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const d = await this.load();
    const drop = new Set(ids);
    for (const id of ids) delete d.events[id];
    for (const [key, eventId] of Object.entries(d.canonical)) {
      if (drop.has(eventId)) delete d.canonical[key];
    }
    await this.save();
  }

  async listEvents(limit: number, before?: number): Promise<ModelEvent[]> {
    const d = await this.load();
    const sortKey = (e: ModelEvent) => e.publishedAt ?? e.detectedAt;
    return Object.values(d.events)
      .filter((e) => before === undefined || sortKey(e) < before)
      .sort(compareEvents)
      .slice(0, limit);
  }

  async setCanonicalNX(canonicalKey: string, eventId: string): Promise<boolean> {
    const d = await this.load();
    if (d.canonical[canonicalKey]) return false;
    d.canonical[canonicalKey] = eventId;
    await this.save();
    return true;
  }

  async setCanonical(canonicalKey: string, eventId: string): Promise<void> {
    const d = await this.load();
    d.canonical[canonicalKey] = eventId;
    await this.save();
  }

  async setCanonicalMany(entries: [string, string][]): Promise<void> {
    if (entries.length === 0) return;
    const d = await this.load();
    for (const [key, eventId] of entries) d.canonical[key] = eventId;
    await this.save();
  }

  async getCanonical(canonicalKey: string): Promise<string | null> {
    const d = await this.load();
    return d.canonical[canonicalKey] ?? null;
  }

  async getMeta(key: string): Promise<string | null> {
    const d = await this.load();
    return d.meta?.[key] ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    const d = await this.load();
    d.meta ??= {};
    d.meta[key] = value;
    await this.save();
  }

  async pruneEvents(olderThanMs: number): Promise<void> {
    const d = await this.load();
    const cutoff = Date.now() - olderThanMs;
    let changed = false;
    for (const [id, ev] of Object.entries(d.events)) {
      if (ev.detectedAt < cutoff) {
        delete d.events[id];
        changed = true;
      }
    }
    if (changed) await this.save();
  }
}

/** Hot-path list cache size (covers page 200 + feeds 50). */
const TIMELINE_CACHE_KEY = "cache:timeline";
const TIMELINE_CACHE_LIMIT = 250;
/** Batch size for MGET / pipeline writes (keeps REST payload bounded). */
const EVENT_BATCH = 100;

class RedisStore implements Store {
  private clientPromise: Promise<import("@upstash/redis").Redis> | null = null;

  private client(): Promise<import("@upstash/redis").Redis> {
    if (!this.clientPromise) {
      const url =
        process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
      const token =
        process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
      this.clientPromise = import("@upstash/redis").then(
        ({ Redis }) => new Redis({ url: url!, token: token! })
      );
    }
    return this.clientPromise;
  }

  async getSnapshot(source: string): Promise<string[] | null> {
    const redis = await this.client();
    const raw = await redis.get<string | string[]>(`snapshot:${source}`);
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as string[]) : raw;
  }

  async setSnapshot(source: string, ids: string[]): Promise<void> {
    const redis = await this.client();
    await redis.set(`snapshot:${source}`, ids);
  }

  async addEventNX(event: ModelEvent): Promise<boolean> {
    const redis = await this.client();
    // 展示排序按发布时间；events_detected 按检测时间，供 90 天清理用
    const added = await redis.zadd(
      "events",
      { nx: true },
      { score: event.publishedAt ?? event.detectedAt, member: event.id }
    );
    if (added !== 1) return false;
    const pipe = redis.pipeline();
    pipe.zadd(
      "events_detected",
      { nx: true },
      { score: event.detectedAt, member: event.id }
    );
    pipe.set(`event:${event.id}`, event);
    pipe.del(TIMELINE_CACHE_KEY);
    await pipe.exec();
    return true;
  }

  async getEvent(id: string): Promise<ModelEvent | null> {
    const redis = await this.client();
    // Prefer JSON string keys; GET errors with WRONGTYPE on legacy hashes.
    try {
      const raw = await redis.get<unknown>(`event:${id}`);
      const fromJson = parseStoredEvent(raw);
      if (fromJson) return fromJson;
    } catch {
      // fall through to hash read
    }

    try {
      const hash = await redis.hgetall<Record<string, unknown>>(`event:${id}`);
      if (!hash || !hash.id) return null;
      const event = deserializeEvent(hash);
      // Migrate so future listEvents can MGET in one command.
      await redis.set(`event:${id}`, event);
      return event;
    } catch {
      return null;
    }
  }

  async updateEventSources(id: string, sources: string[]): Promise<void> {
    const existing = await this.getEvent(id);
    if (!existing) return;
    await this.writeEvents([{ ...existing, sources }]);
  }

  async writeEvents(events: ModelEvent[]): Promise<void> {
    if (events.length === 0) return;
    const redis = await this.client();
    for (let i = 0; i < events.length; i += EVENT_BATCH) {
      const pipe = redis.pipeline();
      for (const event of events.slice(i, i + EVENT_BATCH)) {
        pipe.set(`event:${event.id}`, event);
        pipe.zadd("events", {
          score: event.publishedAt ?? event.detectedAt,
          member: event.id,
        });
      }
      if (i === 0) pipe.del(TIMELINE_CACHE_KEY);
      await pipe.exec();
    }
  }

  async deleteEvents(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const redis = await this.client();
    for (let i = 0; i < ids.length; i += EVENT_BATCH) {
      const pipe = redis.pipeline();
      for (const id of ids.slice(i, i + EVENT_BATCH)) {
        pipe.zrem("events", id);
        pipe.zrem("events_detected", id);
        pipe.del(`event:${id}`);
      }
      if (i === 0) pipe.del(TIMELINE_CACHE_KEY);
      await pipe.exec();
    }
  }

  async listEvents(limit: number, before?: number): Promise<ModelEvent[]> {
    const redis = await this.client();
    const useTimelineCache =
      before === undefined && limit <= TIMELINE_CACHE_LIMIT;

    // Common path (home / feeds): 1 GET against a denormalized cache.
    if (useTimelineCache) {
      const cached = await redis.get<ModelEvent[] | string>(TIMELINE_CACHE_KEY);
      const list = parseTimelineCache(cached);
      if (list) return list.slice(0, limit);
    }

    const fetchLimit = useTimelineCache ? TIMELINE_CACHE_LIMIT : limit;
    const events = await this.loadEventsByScore(redis, fetchLimit, before);

    if (useTimelineCache) {
      await redis.set(TIMELINE_CACHE_KEY, events);
    }

    return events.slice(0, limit);
  }

  private async loadEventsByScore(
    redis: import("@upstash/redis").Redis,
    limit: number,
    before?: number
  ): Promise<ModelEvent[]> {
    const max: "+inf" | `(${number}` =
      before === undefined ? "+inf" : `(${before}`;
    const ids = await redis.zrange<string[]>("events", max, "-inf", {
      byScore: true,
      rev: true,
      offset: 0,
      count: limit,
    });
    if (!ids || ids.length === 0) return [];

    // MGET is one billable command for the whole batch (vs N HGETALL).
    const events: ModelEvent[] = [];
    const missing: string[] = [];
    for (let i = 0; i < ids.length; i += EVENT_BATCH) {
      const chunk = ids.slice(i, i + EVENT_BATCH);
      const rows = await redis.mget<(unknown | null)[]>(
        ...chunk.map((id) => `event:${id}`)
      );
      for (let j = 0; j < chunk.length; j++) {
        const parsed = parseStoredEvent(rows?.[j] ?? null);
        if (parsed) events.push(parsed);
        else missing.push(chunk[j]);
      }
    }

    if (missing.length > 0) {
      const migrated = await this.hydrateLegacyHashes(redis, missing);
      events.push(...migrated);
    }

    return events.sort(compareEvents);
  }

  private async hydrateLegacyHashes(
    redis: import("@upstash/redis").Redis,
    ids: string[]
  ): Promise<ModelEvent[]> {
    const out: ModelEvent[] = [];
    for (let i = 0; i < ids.length; i += EVENT_BATCH) {
      const chunk = ids.slice(i, i + EVENT_BATCH);
      const pipe = redis.pipeline();
      for (const id of chunk) pipe.hgetall(`event:${id}`);
      const rows = (await pipe.exec()) as (Record<string, unknown> | null)[];
      const migrate = redis.pipeline();
      let migrateCount = 0;
      for (let j = 0; j < chunk.length; j++) {
        const row = rows[j];
        if (!row || !row.id) continue;
        const event = deserializeEvent(row);
        out.push(event);
        migrate.set(`event:${chunk[j]}`, event);
        migrateCount += 1;
      }
      if (migrateCount > 0) await migrate.exec();
    }
    return out;
  }

  async setCanonicalNX(canonicalKey: string, eventId: string): Promise<boolean> {
    const redis = await this.client();
    const res = await redis.set(`canonical:${canonicalKey}`, eventId, {
      nx: true,
    });
    return res === "OK";
  }

  async setCanonical(canonicalKey: string, eventId: string): Promise<void> {
    const redis = await this.client();
    await redis.set(`canonical:${canonicalKey}`, eventId);
  }

  async setCanonicalMany(entries: [string, string][]): Promise<void> {
    if (entries.length === 0) return;
    const redis = await this.client();
    for (let i = 0; i < entries.length; i += 200) {
      const pipe = redis.pipeline();
      for (const [key, eventId] of entries.slice(i, i + 200)) {
        pipe.set(`canonical:${key}`, eventId);
      }
      await pipe.exec();
    }
  }

  async getCanonical(canonicalKey: string): Promise<string | null> {
    const redis = await this.client();
    return redis.get<string>(`canonical:${canonicalKey}`);
  }

  async getMeta(key: string): Promise<string | null> {
    const redis = await this.client();
    return redis.get<string>(`meta:${key}`);
  }

  async setMeta(key: string, value: string): Promise<void> {
    const redis = await this.client();
    await redis.set(`meta:${key}`, value);
  }

  async pruneEvents(olderThanMs: number): Promise<void> {
    const redis = await this.client();
    const cutoff = Date.now() - olderThanMs;
    const ids = await redis.zrange<string[]>("events_detected", "-inf", cutoff, {
      byScore: true,
    });
    if (!ids || ids.length === 0) return;
    for (let i = 0; i < ids.length; i += EVENT_BATCH) {
      const pipe = redis.pipeline();
      for (const id of ids.slice(i, i + EVENT_BATCH)) {
        pipe.zrem("events", id);
        pipe.zrem("events_detected", id);
        pipe.del(`event:${id}`);
      }
      if (i === 0) pipe.del(TIMELINE_CACHE_KEY);
      await pipe.exec();
    }
  }
}

function parseTimelineCache(
  raw: ModelEvent[] | string | null | undefined
): ModelEvent[] | null {
  if (!raw) return null;
  const list =
    typeof raw === "string" ? (JSON.parse(raw) as ModelEvent[]) : raw;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list;
}

function parseStoredEvent(raw: unknown): ModelEvent | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return parseStoredEvent(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // JSON blob written by SET (preferred) — fields are native types.
  if (typeof r.detectedAt === "number" && typeof r.id === "string") {
    return {
      id: r.id,
      source: String(r.source ?? ""),
      externalId: String(r.externalId ?? ""),
      canonical: String(r.canonical ?? ""),
      title: String(r.title ?? ""),
      provider: String(r.provider ?? ""),
      url: String(r.url ?? ""),
      summary: String(r.summary ?? ""),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      sources: Array.isArray(r.sources) ? (r.sources as string[]) : [],
      detectedAt: r.detectedAt,
      publishedAt:
        typeof r.publishedAt === "number" ? r.publishedAt : undefined,
      publishedAtPrecision:
        r.publishedAtPrecision === "day" || r.publishedAtPrecision === "instant"
          ? r.publishedAtPrecision
          : undefined,
      publishedOrigin: Boolean(r.publishedOrigin),
    };
  }
  // Legacy hash field shapes (all strings).
  if (r.id) return deserializeEvent(r);
  return null;
}

function jsonField(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function deserializeEvent(r: Record<string, unknown>): ModelEvent {
  return {
    id: String(r.id),
    source: String(r.source),
    externalId: String(r.externalId),
    canonical: String(r.canonical ?? ""),
    title: String(r.title),
    provider: String(r.provider),
    url: String(r.url),
    summary: String(r.summary ?? ""),
    tags: (jsonField(r.tags) as string[]) ?? [],
    sources: (jsonField(r.sources) as string[]) ?? [],
    detectedAt: Number(r.detectedAt),
    publishedAt: r.publishedAt ? Number(r.publishedAt) : undefined,
    publishedAtPrecision:
      r.publishedAtPrecision === "day" || r.publishedAtPrecision === "instant"
        ? r.publishedAtPrecision
        : undefined,
    publishedOrigin:
      r.publishedOrigin === "1" ||
      r.publishedOrigin === "true" ||
      r.publishedOrigin === 1 ||
      r.publishedOrigin === true,
  };
}

let instance: Store | null = null;

export function getStore(): Store {
  if (!instance) {
    const useRedis =
      !!(process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL) &&
      !!(process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN);
    instance = useRedis ? new RedisStore() : new FileStore();
  }
  return instance;
}
