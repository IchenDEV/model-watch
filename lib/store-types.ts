import type { ModelEvent } from "./types";

export interface Store {
  getSnapshot(source: string): Promise<string[] | null>;
  setSnapshot(source: string, ids: string[]): Promise<void>;
  addEventNX(event: ModelEvent): Promise<boolean>;
  getEvent(id: string): Promise<ModelEvent | null>;
  updateEventSources(id: string, sources: string[]): Promise<void>;
  listEvents(limit: number, before?: number): Promise<ModelEvent[]>;
  setCanonicalNX(canonicalKey: string, eventId: string): Promise<boolean>;
  getCanonical(canonicalKey: string): Promise<string | null>;
  pruneEvents(olderThanMs: number): Promise<void>;
}
