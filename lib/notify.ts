import { createHmac } from "crypto";
import type { ModelEvent } from "./types";

const MAX_LINES = 10;

function sign(secret: string, timestamp: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac("sha256", stringToSign).update("").digest("base64");
}

export async function notifyFeishu(events: ModelEvent[]): Promise<void> {
  const webhook = process.env.FEISHU_WEBHOOK_URL;
  if (!webhook || events.length === 0) return;
  const siteUrl = process.env.SITE_URL || "http://localhost:3000";

  const lines = events.slice(0, MAX_LINES).map(
    (e) => `[${e.source}] ${e.externalId}\n${e.url}`
  );
  let text = `🆕 发现 ${events.length} 个新模型\n${lines.join("\n")}`;
  if (events.length > MAX_LINES) {
    text += `\n…还有 ${events.length - MAX_LINES} 条，见 ${siteUrl}`;
  }

  const body: Record<string, unknown> = {
    msg_type: "text",
    content: { text },
  };
  const secret = process.env.FEISHU_WEBHOOK_SECRET;
  if (secret) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    body.timestamp = timestamp;
    body.sign = sign(secret, timestamp);
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`feishu notify failed: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("feishu notify failed:", err);
  }
}
