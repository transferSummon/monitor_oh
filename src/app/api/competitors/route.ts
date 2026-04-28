import { NextResponse } from "next/server";

import { listCompetitors } from "@/lib/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listCompetitors());
}
