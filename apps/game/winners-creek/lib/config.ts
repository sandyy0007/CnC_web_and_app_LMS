import { z } from "zod";

/**
 * Central env config. Everything that gates an optional adapter (cloud AI,
 * LibreOffice binary path, storage root) is read here once so the rest of
 * the codebase never touches process.env directly.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgresql://winnerscreek:winnerscreek_dev@localhost:5432/winnerscreek"),
  SESSION_SECRET: z.string().default("dev-only-insecure-secret-change-me"),
  STORAGE_ROOT: z.string().default(".data/storage"),
  LIBREOFFICE_BIN: z.string().default("soffice"),
  ANTHROPIC_API_KEY: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

export const config = EnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  STORAGE_ROOT: process.env.STORAGE_ROOT,
  LIBREOFFICE_BIN: process.env.LIBREOFFICE_BIN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  NODE_ENV: process.env.NODE_ENV,
});

export const aiEnabled = Boolean(config.ANTHROPIC_API_KEY);
