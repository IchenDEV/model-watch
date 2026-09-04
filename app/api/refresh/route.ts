import { NextRequest, NextResponse } from "next/server";
import { runRefresh } from "@/lib/refresh";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const query = request.nextUrl.searchParams.get("secret");
    if (auth !== `Bearer ${secret}` && query !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await runRefresh();
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
