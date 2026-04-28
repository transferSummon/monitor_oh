import { NextRequest, NextResponse } from "next/server";
import { runRequestedJob } from "@olympic/worker";

import { parseJobRunRequest } from "@/lib/server/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidSecret(request: NextRequest) {
  const expected = process.env.INTERNAL_JOB_SECRET;

  if (!expected) return true;

  const supplied = request.headers.get("x-internal-secret");
  return supplied === expected;
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const payload = parseJobRunRequest(body);
    const result = await runRequestedJob(payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job run failed." },
      { status: 400 },
    );
  }
}
