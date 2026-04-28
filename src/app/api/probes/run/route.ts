import { NextResponse } from "next/server";

import { runProbeBatch } from "@/lib/probes/run";
import { COMPETITORS, type CompetitorSlug, type ProbeType } from "@/lib/probes/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RunBody {
  mode?: "all" | "promotions" | "live_prices" | "competitor";
  competitor?: CompetitorSlug;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RunBody;
    const validCompetitors = new Set(COMPETITORS.map((competitor) => competitor.slug));

    let competitors: CompetitorSlug[] | undefined;
    let probeTypes: ProbeType[] | undefined;

    switch (body.mode) {
      case "promotions":
        probeTypes = ["promotions"];
        break;
      case "live_prices":
        probeTypes = ["live_prices"];
        break;
      case "competitor":
        if (!body.competitor || !validCompetitors.has(body.competitor)) {
          return NextResponse.json({ error: "Unknown competitor." }, { status: 400 });
        }
        competitors = [body.competitor];
        break;
      case "all":
      default:
        break;
    }

    const artifact = await runProbeBatch({ competitors, probeTypes });
    return NextResponse.json({
      ok: true,
      runId: artifact.runId,
      resultCount: artifact.results.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Probe run failed." },
      { status: 500 },
    );
  }
}
