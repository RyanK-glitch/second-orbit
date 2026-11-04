/** Drops and recreates the schema, then migrates and seeds. Local databases only. */
import "./_env";
import { config } from "../src/lib/env";
import { sql } from "../src/lib/db";
import { migrate } from "./migrate";
import { seed } from "./seed";
import { isMain } from "./_main";

export async function reset() {
  const host = new URL(config.databaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "db"].includes(host) && process.env.ALLOW_DB_RESET !== "1") {
    throw new Error(`Refusing to reset non-local database at ${host}. Set ALLOW_DB_RESET=1 if you really mean it.`);
  }
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate();
  await seed();
}

if (isMain(import.meta.url)) {
  reset()
    .then(() => console.log("database reset"))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
