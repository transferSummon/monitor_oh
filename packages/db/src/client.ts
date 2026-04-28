import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type OlympicDatabase = PostgresJsDatabase<typeof schema>;

let cachedDb: OlympicDatabase | null = null;
let cachedSql: postgres.Sql | null = null;

export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? null;
}

export function hasDatabase() {
  return Boolean(getDatabaseUrl());
}

export function getDb() {
  if (cachedDb) return cachedDb;

  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return null;
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });

  cachedSql = sql;
  cachedDb = drizzle(sql, { schema });
  return cachedDb;
}

export async function closeDb() {
  const sql = cachedSql;

  cachedDb = null;
  cachedSql = null;

  if (sql) {
    await sql.end({ timeout: 5 });
  }
}
