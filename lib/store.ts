import { promises as fs } from "fs";
import path from "path";
import type { ModelEvent } from "./types";
import type { Store } from "./store-types";

interface FileData {
  snapshots: Record<string, string[]>;
  events: Record<string, ModelEvent>;
  canonical: Record<string, string>;
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
        this.data = { snapshots: {}, events: {}, canonical: {} };
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

  async listEvents(limit: number, before?: number): Promise<ModelEvent[]> {
    const d = await this.load();
    return Object.values(d.events)
      .filter((e) => before === undefined || e.detectedAt < before)
      .sort((a, b) => b.detectedAt - a.detectedAt)
      .slice(0, limit);
  }

  async setCanonicalNX(canonicalKey: string, eventId: string): Promise<boolean> {
    const d = await this.load();
    if (d.canonical[canonicalKey]) return false;
    d.canonical[canonicalKey] = eventId;
    await this.save();
    return true;
  }

  async getCanonical(canonicalKey: string): Promise<string | null> {
    const d = await this.load();
    return d.canonical[canonicalKey] ?? null;
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
      this.clientPromise = import("@upstash/redis").then(({ Redis }) =>
        Redis.fromEnv()
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
    const added = await redis.zadd(
      "events",
      { nx: true },
      { score: event.detectedAt, member: event.id }
    );
    if (added !== 1) return false;
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
    const rows = (await pipe.exec()) as (Record<string, string> | null)[];
    return rows
      .filter((r): r is Record<string, string> => !!r && !!r.id)
      .map(deserializeEvent);
  }

  async setCanonicalNX(canonicalKey: string, eventId: string): Promise<boolean> {
    const redis = await this.client();
    const res = await redis.set(`canonical:${canonicalKey}`, eventId, {
      nx: true,
    });
    return res === "OK";
  }

  async getCanonical(canonicalKey: string): Promise<string | null> {
    const redis = await this.client();
    return redis.get<string>(`canonical:${canonicalKey}`);
  }

  async pruneEvents(olderThanMs: number): Promise<void> {
    const redis = await this.client();
    const cutoff = Date.now() - olderThanMs;
    const ids = await redis.zrange<string[]>("events", "-inf", cutoff, {
      byScore: true,
    });
    if (!ids || ids.length === 0) return;
    const pipe = redis.pipeline();
    for (const id of ids) {
      pipe.zrem("events", id);
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
    title: e.title,
    provider: e.provider,
    url: e.url,
    summary: e.summary,
    tags: JSON.stringify(e.tags),
    sources: JSON.stringify(e.sources),
    detectedAt: String(e.detectedAt),
    publishedAt: e.publishedAt === undefined ? "" : String(e.publishedAt),
  };
}

function deserializeEvent(r: Record<string, string>): ModelEvent {
  return {
    id: r.id,
    source: r.source,
    externalId: r.externalId,
    title: r.title,
    provider: r.provider,
    url: r.url,
    summary: r.summary,
    tags: JSON.parse(r.tags || "[]"),
    sources: JSON.parse(r.sources || "[]"),
    detectedAt: Number(r.detectedAt),
    publishedAt: r.publishedAt ? Number(r.publishedAt) : undefined,
  };
}

let instance: Store | null = null;

export function getStore(): Store {
  if (!instance) {
    const useRedis =
      !!process.env.UPSTASH_REDIS_REST_URL &&
      !!process.env.UPSTASH_REDIS_REST_TOKEN;
    instance = useRedis ? new RedisStore() : new FileStore();
  }
  return instance;
}
