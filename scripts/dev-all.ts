/**
 * One command for local development:
 *   starts Postgres (docker compose) → runs migrations → seeds if empty → next dev
 */
import { spawn, spawnSync } from "node:child_process";

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n✖ ${cmd} ${args.join(" ")} failed. Is Docker running?`);
    process.exit(r.status ?? 1);
  }
}

run("docker", ["compose", "up", "-d", "--wait", "db"]);
run("npx", ["tsx", "scripts/migrate.ts"]);
run("npx", ["tsx", "scripts/seed.ts", "--if-empty"]);

const dev = spawn("npx", ["next", "dev"], { stdio: "inherit" });
dev.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => dev.kill(sig));
