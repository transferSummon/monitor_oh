import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const lifecycleStatusEnum = pgEnum("lifecycle_status", ["new", "active", "removed", "changed"]);
export const capabilityModuleEnum = pgEnum("capability_module", ["ads", "offers", "marketing"]);
export const capabilityStateEnum = pgEnum("capability_state", ["enabled", "in_progress", "blocked"]);
export const alertTypeEnum = pgEnum("alert_type", ["new_offer", "updated_offer", "removed_offer"]);
export const jobTypeEnum = pgEnum("job_type", ["offers_sync", "marketing_sync", "ads_sync"]);
export const jobStatusEnum = pgEnum("job_status", ["running", "success", "partial", "blocked", "failed"]);

export const competitors = pgTable(
  "competitors",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    websiteUrl: varchar("website_url", { length: 500 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugKey: uniqueIndex("competitors_slug_key").on(table.slug),
  }),
);

export const destinations = pgTable("destinations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  country: varchar("country", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }),
  parentId: integer("parent_id").references((): any => destinations.id),
  destinationType: varchar("destination_type", { length: 50 }).notNull().default("country"),
  isOlympic: boolean("is_olympic").notNull().default(false),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const keywords = pgTable("keywords", {
  id: serial("id").primaryKey(),
  keyword: varchar("keyword", { length: 255 }).notNull(),
  destinationId: integer("destination_id").references(() => destinations.id),
  competitorId: integer("competitor_id").references(() => competitors.id),
});

export const competitorCapabilities = pgTable(
  "competitor_capabilities",
  {
    id: serial("id").primaryKey(),
    competitorId: integer("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    module: capabilityModuleEnum("module").notNull(),
    state: capabilityStateEnum("state").notNull(),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    competitorModuleKey: uniqueIndex("competitor_capabilities_competitor_module_key").on(
      table.competitorId,
      table.module,
    ),
  }),
);

export const ads = pgTable(
  "ads",
  {
    id: serial("id").primaryKey(),
    creativeId: varchar("creative_id", { length: 255 }).notNull(),
    competitorId: integer("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    advertiserId: varchar("advertiser_id", { length: 255 }),
    mediaFormat: varchar("media_format", { length: 100 }),
    firstSeenGlobal: timestamp("first_seen_global", { withTimezone: true }),
    lastSeenGlobal: timestamp("last_seen_global", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    creativeIdKey: uniqueIndex("ads_creative_id_key").on(table.creativeId),
  }),
);

export const adSnapshots = pgTable(
  "ad_snapshots",
  {
    id: serial("id").primaryKey(),
    adId: integer("ad_id")
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    regions: jsonb("regions"),
    image: jsonb("image"),
    videos: jsonb("videos"),
    metadata: jsonb("metadata"),
    snapshotHash: varchar("snapshot_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    adSnapshotDateKey: uniqueIndex("ad_snapshots_ad_snapshot_date_key").on(table.adId, table.snapshotDate),
  }),
);

export const adStatus = pgTable(
  "ad_status",
  {
    id: serial("id").primaryKey(),
    adId: integer("ad_id")
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    status: lifecycleStatusEnum("status").notNull(),
    becameNewDate: date("became_new_date"),
    becameRemovedDate: date("became_removed_date"),
    changedDate: date("changed_date"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    adStatusAdIdKey: uniqueIndex("ad_status_ad_id_key").on(table.adId),
  }),
);

export const aiClassification = pgTable("ai_classification", {
  id: serial("id").primaryKey(),
  adId: integer("ad_id")
    .notNull()
    .references(() => ads.id, { onDelete: "cascade" }),
  destinationId: integer("destination_id").references(() => destinations.id),
  tourType: varchar("tour_type", { length: 255 }),
  seasonality: varchar("seasonality", { length: 255 }),
  confidenceScore: doublePrecision("confidence_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adDestinations = pgTable(
  "ad_destinations",
  {
    id: serial("id").primaryKey(),
    adId: integer("ad_id")
      .notNull()
      .references(() => ads.id, { onDelete: "cascade" }),
    destinationId: integer("destination_id")
      .notNull()
      .references(() => destinations.id),
    role: varchar("role", { length: 32 }).notNull(),
    confidenceScore: doublePrecision("confidence_score"),
    source: varchar("source", { length: 32 }).notNull().default("keyword"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    adDestinationKey: uniqueIndex("ad_destinations_ad_id_destination_id_key").on(table.adId, table.destinationId),
  }),
);

export const scrapedOffers = pgTable(
  "scraped_offers",
  {
    id: serial("id").primaryKey(),
    competitorId: integer("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 255 }).notNull(),
    offerTitle: varchar("offer_title", { length: 500 }).notNull(),
    offerUrl: varchar("offer_url", { length: 1000 }).notNull(),
    priceText: varchar("price_text", { length: 255 }).notNull(),
    priceNumeric: varchar("price_numeric", { length: 64 }),
    currency: varchar("currency", { length: 32 }).notNull(),
    durationDays: integer("duration_days"),
    departureDate: date("departure_date"),
    imageUrl: varchar("image_url", { length: 1000 }),
    description: text("description"),
    rawData: jsonb("raw_data").notNull(),
    scrapedDate: date("scraped_date").notNull(),
    snapshotHash: varchar("snapshot_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    competitorExternalIdKey: uniqueIndex("scraped_offers_competitor_external_id_key").on(
      table.competitorId,
      table.externalId,
    ),
  }),
);

export const offerStatus = pgTable(
  "offer_status",
  {
    id: serial("id").primaryKey(),
    offerId: integer("offer_id")
      .notNull()
      .references(() => scrapedOffers.id, { onDelete: "cascade" }),
    status: lifecycleStatusEnum("status").notNull(),
    firstSeenDate: date("first_seen_date"),
    lastSeenDate: date("last_seen_date"),
    becameNewDate: date("became_new_date"),
    becameRemovedDate: date("became_removed_date"),
    changedDate: date("changed_date"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    offerStatusOfferIdKey: uniqueIndex("offer_status_offer_id_key").on(table.offerId),
  }),
);

export const offerChanges = pgTable("offer_changes", {
  id: serial("id").primaryKey(),
  offerId: integer("offer_id")
    .notNull()
    .references(() => scrapedOffers.id, { onDelete: "cascade" }),
  changeType: varchar("change_type", { length: 50 }).notNull(),
  changeDate: date("change_date").notNull(),
  previousSnapshot: jsonb("previous_snapshot"),
  newSnapshot: jsonb("new_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offerClassification = pgTable(
  "offer_classification",
  {
    id: serial("id").primaryKey(),
    offerId: integer("offer_id")
      .notNull()
      .references(() => scrapedOffers.id, { onDelete: "cascade" }),
    destinationId: integer("destination_id").references(() => destinations.id),
    tourType: varchar("tour_type", { length: 255 }),
    seasonality: varchar("seasonality", { length: 255 }),
    confidenceScore: doublePrecision("confidence_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    offerClassificationOfferIdKey: uniqueIndex("offer_classification_offer_id_key").on(table.offerId),
  }),
);

export const offerDestinations = pgTable(
  "offer_destinations",
  {
    id: serial("id").primaryKey(),
    offerId: integer("offer_id")
      .notNull()
      .references(() => scrapedOffers.id, { onDelete: "cascade" }),
    destinationId: integer("destination_id")
      .notNull()
      .references(() => destinations.id),
    role: varchar("role", { length: 32 }).notNull(),
    confidenceScore: doublePrecision("confidence_score"),
    source: varchar("source", { length: 32 }).notNull().default("keyword"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    offerDestinationKey: uniqueIndex("offer_destinations_offer_id_destination_id_key").on(
      table.offerId,
      table.destinationId,
    ),
  }),
);

export const marketingOffers = pgTable(
  "marketing_offers",
  {
    id: serial("id").primaryKey(),
    competitorId: integer("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    sourceKey: varchar("source_key", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    url: varchar("url", { length: 1000 }),
    ctaText: varchar("cta_text", { length: 255 }),
    validity: varchar("validity", { length: 255 }),
    rawText: text("raw_text"),
    rawData: jsonb("raw_data").notNull(),
    snapshotHash: varchar("snapshot_hash", { length: 255 }).notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    competitorSourceKeyKey: uniqueIndex("marketing_offers_competitor_source_key_key").on(
      table.competitorId,
      table.sourceKey,
    ),
  }),
);

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  adId: integer("ad_id").references(() => ads.id, { onDelete: "cascade" }),
  offerId: integer("offer_id").references(() => scrapedOffers.id, { onDelete: "cascade" }),
  marketingOfferId: integer("marketing_offer_id").references(() => marketingOffers.id, {
    onDelete: "cascade",
  }),
  type: alertTypeEnum("type").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobBatches = pgTable(
  "job_batches",
  {
    id: serial("id").primaryKey(),
    batchRunId: varchar("batch_run_id", { length: 255 }).notNull(),
    status: jobStatusEnum("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    summary: jsonb("summary"),
  },
  (table) => ({
    batchRunIdKey: uniqueIndex("job_batches_batch_run_id_key").on(table.batchRunId),
  }),
);

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id", { length: 255 }).notNull(),
  batchRunId: varchar("batch_run_id", { length: 255 }).references(() => jobBatches.batchRunId, {
    onDelete: "set null",
  }),
  jobType: jobTypeEnum("job_type").notNull(),
  competitorId: integer("competitor_id").references(() => competitors.id),
  status: jobStatusEnum("status").notNull(),
  recordsSeen: integer("records_seen").notNull().default(0),
  recordsChanged: integer("records_changed").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorSummary: text("error_summary"),
});

export const jobErrors = pgTable("job_errors", {
  id: serial("id").primaryKey(),
  jobRunId: integer("job_run_id")
    .notNull()
    .references(() => jobRuns.id, { onDelete: "cascade" }),
  errorCode: varchar("error_code", { length: 100 }).notNull(),
  message: text("message").notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
