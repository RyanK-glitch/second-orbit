/**
 * Minimal forward-only migration runner: applies db/migrations/*.sql in order,
 * each in its own transaction, recording them in schema_migrations.
 */
import "./_env";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "../src/lib/db";
import { isMain } from "./_main";

export async function migrate() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const dir = path.resolve("db/migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`applied ${file}`);
  }
}

if (isMain(import.meta.url)) {
  migrate()
    .then(() => console.log("migrations up to date"))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
