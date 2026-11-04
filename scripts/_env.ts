import { existsSync } from "node:fs";

// Load .env for CLI scripts (Next.js does this itself for the app). Existing env vars win.
if (existsSync(".env")) process.loadEnvFile(".env");
