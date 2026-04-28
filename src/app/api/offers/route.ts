import { NextRequest, NextResponse } from "next/server";

import { listOffers } from "@/lib/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return NextResponse.json(await listOffers(request.nextUrl.searchParams));
}
