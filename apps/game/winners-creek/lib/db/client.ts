import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "@/lib/config";
import * as schema from "./schema";

// A single pooled connection, reused across hot-reloads in dev (Next.js
// re-evaluates modules on every route change without this guard).
declare global {
  var __wcPool: Pool | undefined;
}

const pool =
  globalThis.__wcPool ??
  new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
  });

if (config.NODE_ENV !== "production") {
  globalThis.__wcPool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
