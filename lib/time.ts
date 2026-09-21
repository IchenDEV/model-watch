import { precisionOf } from "./dedupe";
import type { ModelEvent } from "./types";

export function relativeTime(ts: number, now = Date.now()): string {
  const minutes = Math.floor((now - ts) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

export function releasedLabel(
  event: Pick<ModelEvent, "publishedAt" | "publishedAtPrecision">,
  now = Date.now()
): string {
  if (event.publishedAt == null) return "Release date unknown";
  const precision = precisionOf(event.publishedAt, event.publishedAtPrecision);
  if (precision === "day") {
    return `Released ${new Date(event.publishedAt).toISOString().slice(0, 10)}`;
  }
  return `Released ${relativeTime(event.publishedAt, now)}`;
}

export function seenLabel(detectedAt: number, now = Date.now()): string {
  return `Seen ${relativeTime(detectedAt, now)}`;
}

export function compareEvents(a: ModelEvent, b: ModelEvent): number {
  const pa = a.publishedAt ?? 0;
  const pb = b.publishedAt ?? 0;
  if (pb !== pa) return pb - pa;
  return b.detectedAt - a.detectedAt;
}
