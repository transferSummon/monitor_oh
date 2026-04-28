"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CompetitorSlug } from "@/lib/probes/types";

interface RunControlsProps {
  competitorSlug?: CompetitorSlug;
}

type PendingMode = "all" | "promotions" | "live_prices" | "competitor" | null;

export function RunControls({ competitorSlug }: RunControlsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingMode>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function trigger(mode: PendingMode) {
    if (!mode) return;

    setPending(mode);
    setMessage(null);

    try {
      const response = await fetch("/api/probes/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(
          mode === "competitor"
            ? { mode, competitor: competitorSlug }
            : { mode },
        ),
      });

      const payload = (await response.json()) as { runId?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Probe run failed.");
      }

      setMessage(payload.runId ? `Completed run ${payload.runId}` : "Probe run completed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Probe run failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="stack">
      <div className="button-row">
        {!competitorSlug ? (
          <>
            <button
              className="button primary"
              onClick={() => void trigger("all")}
              disabled={pending !== null}
            >
              {pending === "all" ? "Running all probes..." : "Run All"}
            </button>
            <button
              className="button"
              onClick={() => void trigger("promotions")}
              disabled={pending !== null}
            >
              {pending === "promotions" ? "Running promotions..." : "Run Promotions"}
            </button>
            <button
              className="button"
              onClick={() => void trigger("live_prices")}
              disabled={pending !== null}
            >
              {pending === "live_prices" ? "Running live prices..." : "Run Live Prices"}
            </button>
          </>
        ) : (
          <button
            className="button primary"
            onClick={() => void trigger("competitor")}
            disabled={pending !== null}
          >
            {pending === "competitor" ? "Running competitor..." : "Run This Competitor"}
          </button>
        )}
      </div>
      {message ? <p className="muted small">{message}</p> : null}
    </div>
  );
}
