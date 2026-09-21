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
    const raw = await redis.get<string>(`snapshot:${source}`);
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as string[]) : raw;
  }

  async setSnapshot(source: string, ids: string[]): Promise<void> {
    const redis = await this.client();
    await redis.set(`snapshot:${source}`, JSON.stringify(ids));
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
    await redis.zadd(
      "events_detected",
      { nx: true },
      { score: event.detectedAt, member: event.id }
    );
    await redis.hset(`event:${event.id}`, serializeEvent(event));
    return true;
  }

  async getEvent(id: string): Promise<ModelEvent | null> {
    const redis = await this.client();
    const raw = await redis.hgetall<Record<string, string>>(`event:${id}`);
    if (!raw || !raw.id) return null;
    return deserializeEvent(raw);
  }

  async updateEventSources(id: string, sources: string[]): Promise<void> {
    const redis = await this.client();
    await redis.hset(`event:${id}`, { sources: JSON.stringify(sources) });
  }

  async writeEvents(events: ModelEvent[]): Promise<void> {
    const redis = await this.client();
    for (let i = 0; i < events.length; i += 100) {
      const pipe = redis.pipeline();
      for (const event of events.slice(i, i + 100)) {
        pipe.hset(`event:${event.id}`, serializeEvent(event));
        pipe.zadd("events", {
          score: event.publishedAt ?? event.detectedAt,
          member: event.id,
        });
      }
      await pipe.exec();
    }
  }

  async deleteEvents(ids: string[]): Promise<void> {
    const redis = await this.client();
    for (let i = 0; i < ids.length; i += 100) {
      const pipe = redis.pipeline();
      for (const id of ids.slice(i, i + 100)) {
        pipe.zrem("events", id);
        pipe.zrem("events_detected", id);
        pipe.del(`event:${id}`);
      }
      await pipe.exec();
    }
  }

  async listEvents(limit: number, before?: number): Promise<ModelEvent[]> {
    const redis = await this.client();
    const max: "+inf" | `(${number}` =
      before === undefined ? "+inf" : `(${before}`;
    const ids = await redis.zrange<string[]>("events", max, "-inf", {
      byScore: true,
      rev: true,
      offset: 0,
      count: limit,
    });
    if (!ids || ids.length === 0) return [];
    const pipe = redis.pipeline();
    for (const id of ids) pipe.hgetall(`event:${id}`);
    const rows = (await pipe.exec()) as (Record<string, unknown> | null)[];
    return rows
      .filter((r): r is Record<string, unknown> => !!r && !!r.id)
      .map(deserializeEvent)
      .sort(compareEvents);
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
    const pipe = redis.pipeline();
    for (const id of ids) {
      pipe.zrem("events", id);
      pipe.zrem("events_detected", id);
      pipe.del(`event:${id}`);
    }
    await pipe.exec();
  }
}

function serializeEvent(e: ModelEvent): Record<string, string> {
  return {
    id: e.id,
    source: e.source,
    externalId: e.externalId,
    canonical: e.canonical,
    title: e.title,
    provider: e.provider,
    url: e.url,
    summary: e.summary,
    tags: JSON.stringify(e.tags),
    sources: JSON.stringify(e.sources),
    detectedAt: String(e.detectedAt),
    publishedAt: e.publishedAt === undefined ? "" : String(e.publishedAt),
    publishedAtPrecision: e.publishedAtPrecision ?? "",
    publishedOrigin: e.publishedOrigin ? "1" : "0",
  };
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
