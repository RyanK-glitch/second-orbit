import postgres from "postgres";
import { config } from "./env";

/**
 * SQL-first data access with postgres.js. Every query uses tagged templates,
 * so values are always sent as bound parameters, never interpolated.
 */
type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __sql?: Sql };

function create(): Sql {
  return postgres(config.databaseUrl, {
    max: 10,
    idle_timeout: 20,
    transform: { undefined: null },
    onnotice: () => {},
  });
}

// Reuse one pool across hot reloads in development.
export const sql: Sql = globalForDb.__sql ?? create();
if (process.env.NODE_ENV !== "production") globalForDb.__sql = sql;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Tx = postgres.TransactionSql<{}>;
