import type { ModelEvent } from "./types";

export interface Store {
  getSnapshot(source: string): Promise<string[] | null>;
  setSnapshot(source: string, ids: string[]): Promise<void>;
  addEventNX(event: ModelEvent): Promise<boolean>;
  getEvent(id: string): Promise<ModelEvent | null>;
  updateEventSources(id: string, sources: string[]): Promise<void>;
  writeEvents(events: ModelEvent[]): Promise<void>;
  deleteEvents(ids: string[]): Promise<void>;
  listEvents(limit: number, before?: number): Promise<ModelEvent[]>;
  setCanonicalNX(canonicalKey: string, eventId: string): Promise<boolean>;
  setCanonical(canonicalKey: string, eventId: string): Promise<void>;
  setCanonicalMany(entries: [string, string][]): Promise<void>;
  getCanonical(canonicalKey: string): Promise<string | null>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  pruneEvents(olderThanMs: number): Promise<void>;
}
