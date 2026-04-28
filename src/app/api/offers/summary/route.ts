import { NextRequest, NextResponse } from "next/server";

import { getOffersSummary } from "@/lib/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json(await getOffersSummary(request.nextUrl.searchParams));
}
