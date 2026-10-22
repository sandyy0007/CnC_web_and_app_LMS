import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://winnerscreek:winnerscreek_dev@localhost:5432/winnerscreek",
  },
  strict: true,
  verbose: true,
});
