import Link from "next/link";

import type { CompetitorDto, CompetitorModule, LifecycleStatus } from "@olympic/contracts";

import { withSearchParams, type PageSearchParams } from "@/lib/server/search-params";

export function formatDateLabel(value: string | null | undefined) {
  if (!value) return "n/a";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function StatusBadge({ status }: { status: LifecycleStatus }) {
  return <span className={`pill status-${status}`}>{status}</span>;
}

function CapabilityBadge({ state }: { state: "enabled" | "in_progress" | "blocked" }) {
  const label = state === "in_progress" ? "in progress" : state;
  return <span className={`pill capability-${state}`}>{label}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="hero-panel">
      <div className="stack">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="page-title">{title}</h2>
        <p className="lead-copy">{description}</p>
      </div>
      {actions ? <div>{actions}</div> : null}
    </section>
  );
}

export function MetricGrid({
  items,
}: {
  items: Array<{ label: string; value: number | string }>;
}) {
  return (
    <section className="metric-grid">
      {items.map((item) => (
        <article key={item.label} className="metric-card">
          <span className="metric-label">{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </section>
  );
}

export function CapabilityMatrix({
  competitors,
  module,
}: {
  competitors: CompetitorDto[];
  module: CompetitorModule;
}) {
  return (
    <section className="monitor-card stack">
      <div className="section-head">
        <div>
          <h2>Competitor rollout</h2>
          <p className="muted small">Capability states come from `competitor_capabilities` rather than hardcoded UI annotations.</p>
        </div>
      </div>

      <div className="capability-grid">
        {competitors.map((competitor) => {
          const capability = competitor.capabilities.find((item) => item.module === module);

          return (
            <article key={`${competitor.id}-${module}`} className="capability-card">
              <div className="stack tight">
                <h3>{competitor.name}</h3>
                <p className="muted small">{competitor.websiteUrl}</p>
              </div>
              <div className="stack tight">
                <CapabilityBadge state={capability?.state ?? "in_progress"} />
                <p className="muted small">{capability?.note ?? "No rollout note yet."}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function FilterPanel({ children }: { children: React.ReactNode }) {
  return (
    <form className="filters-grid" method="GET">
      {children}
      <div className="filter-actions">
        <button className="button primary" type="submit">
          Apply filters
        </button>
      </div>
    </form>
  );
}

export function HiddenQueryFields({
  params,
  exclude = [],
}: {
  params: PageSearchParams;
  exclude?: string[];
}) {
  const hiddenEntries = Object.entries(params).filter(([key]) => !exclude.includes(key));

  return (
    <>
      {hiddenEntries.map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map((item, index) => <input key={`${key}-${item}-${index}`} type="hidden" name={key} value={item} />);
        }

        if (typeof value !== "string" || !value) return null;
        return <input key={key} type="hidden" name={key} value={value} />;
      })}
    </>
  );
}

export function SearchField({
  label,
  name,
  value,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  placeholder: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="text-input" type="search" name={name} defaultValue={value} placeholder={placeholder} />
    </label>
  );
}

export function MultiSelectField({
  label,
  name,
  selected,
  options,
}: {
  label: string;
  name: string;
  selected: string[];
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="multi-select" name={name} multiple defaultValue={selected}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <small className="muted">Hold Cmd/Ctrl to select multiple.</small>
    </label>
  );
}

export function StatusTabs({
  path,
  params,
  current,
  tabs,
  queryKey = "status",
}: {
  path: string;
  params: PageSearchParams;
  current: string;
  tabs: Array<{ value: string; label: string }>;
  queryKey?: string;
}) {
  return (
    <div className="tabs-row">
      {tabs.map((tab) => {
        const href = withSearchParams(path, params, {
          [queryKey]: tab.value === "all" ? null : tab.value,
          limit: null,
        });

        return (
          <Link key={tab.value} className={`tab-link ${current === tab.value ? "active" : ""}`} href={href}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export function LoadMoreLink({
  path,
  params,
  hasNextPage,
  nextLimit,
}: {
  path: string;
  params: PageSearchParams;
  hasNextPage: boolean;
  nextLimit: number;
}) {
  if (!hasNextPage) return null;

  return (
    <div className="load-more-wrap">
      <Link className="button primary" href={withSearchParams(path, params, { limit: nextLimit })}>
        Load more
      </Link>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </section>
  );
}
