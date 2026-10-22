import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "@/lib/config";

/**
 * Local-filesystem storage adapter. Swap this module for the real Winners
 * Creek object storage (S3/GCS/whatever it already uses) when integrating —
 * every caller goes through `putObject` / `getObject` / `deleteObject`, so
 * this is the only file that needs to change.
 */

function resolveKey(key: string): string {
  // STORAGE_ROOT is operator-configured, not user input, and always a small
  // fixed subfolder — safe to exclude from Turbopack's output file tracing.
  return join(/* turbopackIgnore: true */ process.cwd(), config.STORAGE_ROOT, key);
}

export async function putObject(bytes: Uint8Array, opts: { prefix: string; ext: string }): Promise<string> {
  const key = `${opts.prefix}/${randomUUID()}.${opts.ext}`;
  const fullPath = resolveKey(key);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
  return key;
}

export async function getObject(key: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolveKey(key)));
}

export async function deleteObject(key: string): Promise<void> {
  await unlink(resolveKey(key)).catch(() => undefined);
}

export function storageKeyToServeUrl(key: string): string {
  const cleanKey = key.replace(/^\/+/, "");
  return `/api/media/${cleanKey}`;
}
