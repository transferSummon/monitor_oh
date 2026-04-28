import Link from "next/link";
import { notFound } from "next/navigation";

import { RunControls } from "@/components/RunControls";
import { readAllRunArtifacts } from "@/lib/probes/storage";
import { COMPETITORS, type ProbeResult } from "@/lib/probes/types";

export const dynamic = "force-dynamic";

function SampleView({ result }: { result: ProbeResult }) {
  return (
    <section className="card stack">
      <div className="card-header">
        <div>
          <h2>{result.probeType === "promotions" ? "Promotions" : "Live Prices"}</h2>
          <p className="muted small">{result.sourceUrl}</p>
        </div>
        <div className="pill-row">
          <span className={`pill status-${result.status}`}>{result.status}</span>
          <span className="pill">{result.method}</span>
        </div>
      </div>

      {result.screenshotPath ? (
        <div className="image-frame">
          <img
            src={`/api/artifacts/${result.screenshotPath}`}
            alt={`${result.probeType} screenshot`}
          />
        </div>
      ) : null}

      {result.notes.length > 0 ? (
        <div className="stack">
          <h3>Notes</h3>
          <ul className="list">
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.blockers.length > 0 ? (
        <div className="stack">
          <h3>Blockers</h3>
          <ul className="list">
            {result.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="stack">
        <h3>Samples</h3>
        {result.samples.length > 0 ? (
          <div className="sample-list">
            {result.probeType === "promotions"
              ? result.samples.map((sample, index) => (
                  <article key={`${result.probeType}-${index}`} className="sample-card">
                    <h4>{sample.title}</h4>
                    <pre className="code-block">{JSON.stringify(sample, null, 2)}</pre>
                  </article>
                ))
              : result.samples.map((sample, index) => (
                  <article key={`${result.probeType}-${index}`} className="sample-card">
                    <h4>{sample.propertyName}</h4>
                    <pre className="code-block">{JSON.stringify(sample, null, 2)}</pre>
                  </article>
                ))}
          </div>
        ) : (
          <p className="muted small">No samples captured in the latest run.</p>
        )}
      </div>

      {result.htmlSnippet ? (
        <div className="stack">
          <h3>HTML Snippet</h3>
          <pre className="code-block">{result.htmlSnippet}</pre>
        </div>
      ) : null}
    </section>
  );
}

export default async function CompetitorDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const competitor = COMPETITORS.find((entry) => entry.slug === slug);

  if (!competitor) {
    notFound();
  }

  const artifacts = await readAllRunArtifacts();
  const artifact = artifacts.find((entry) =>
    entry.results.some((result) => result.competitor === competitor.slug),
  );
  const results = artifact?.results.filter((result) => result.competitor === competitor.slug) ?? [];

  return (
    <main className="shell grid">
      <Link href="/" className="top-link">
        ← Back to dashboard
      </Link>

      <section className="hero">
        <div className="stack">
          <p className="muted small">Competitor detail</p>
          <h1 className="page-title">{competitor.name}</h1>
          <p>{competitor.siteUrl}</p>
        </div>
        <RunControls competitorSlug={competitor.slug} />
      </section>

      {artifact ? (
        <section className="card stack">
          <h2>Latest artifact</h2>
          <pre className="code-block">
            {JSON.stringify(
              {
                runId: artifact.runId,
                finishedAt: artifact.finishedAt,
                resultCount: results.length,
              },
              null,
              2,
            )}
          </pre>
        </section>
      ) : null}

      {results.length > 0 ? (
        <div className="grid">
          {results.map((result) => (
            <SampleView key={`${result.competitor}-${result.probeType}`} result={result} />
          ))}
        </div>
      ) : (
        <section className="card">
          <p className="muted">No results yet for this competitor. Run the competitor probe to generate them.</p>
        </section>
      )}
    </main>
  );
}
