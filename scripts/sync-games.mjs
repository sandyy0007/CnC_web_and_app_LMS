#!/usr/bin/env node
/**
 * Winners Creek LMS — Game Plugin Auto-Discovery & Validation Engine.
 *
 * Automatically scans `apps/game/*` for game folders containing:
 * - game.manifest.ts
 * - Game.tsx
 *
 * Validates contracts, detects duplicates, enforces security constraints,
 * and generates the unified, code-split `generated_plugins.ts` registry.
 *
 * Adding a new game requires ONLY creating `apps/game/<new-slug>/` with
 * `game.manifest.ts` and `Game.tsx`. ZERO existing files need to be edited!
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const GAMES_DIR = path.resolve(REPO_ROOT, 'apps', 'game');
const OUTPUT_FILE = path.resolve(GAMES_DIR, 'generated_plugins.ts');

const FORBIDDEN_CODE_PATTERNS = [
  { pattern: /import\s+.*from\s+['"](?:pg|mysql|sqlite|mongodb|prisma|@prisma)['"]/, reason: 'Direct database drivers forbidden in frontend game plugin' },
  { pattern: /window\.location\.href\s*=/, reason: 'Direct window navigation forbidden; use completeGame() instead' },
  { pattern: /router\.push\(/, reason: 'Direct router navigation forbidden; use completeGame() instead' },
  { pattern: /process\.env\.DATABASE_URL/, reason: 'Exposing backend database credentials forbidden' },
];

const IGNORED_DIRS = new Set([
  '_shared',
  '_sdk',
  '_template',
  'node_modules',
  '.git',
  '.next',
  'email-games',
  'games',
  'Listening skills',
  'pubspeak',
  'winners-creek',
]);

function extractManifestFields(content) {
  const getField = (regex, fallback = '') => {
    const match = content.match(regex);
    return match ? match[1].trim() : fallback;
  };

  const id = getField(/id:\s*['"]([^'"]+)['"]/);
  const slug = getField(/slug:\s*['"]([^'"]+)['"]/);
  const name = getField(/name:\s*['"]([^'"]+)['"]/);
  const version = getField(/version:\s*['"]([^'"]+)['"]/, '1.0.0');
  const description = getField(/description:\s*['"]([^'"]+)['"]/);
  const category = getField(/category:\s*['"]([^'"]+)['"]/, 'Critical Thinking');
  const defaultDifficulty = getField(/defaultDifficulty:\s*['"]([^'"]+)['"]/, 'BEGINNER');
  const themeColor = getField(/themeColor:\s*['"]([^'"]+)['"]/, '#6366f1');
  const badgeTone = getField(/badgeTone:\s*['"]([^'"]+)['"]/, 'indigo');
  const durationMatch = content.match(/durationMinutes:\s*(\d+)/);
  const durationMinutes = durationMatch ? parseInt(durationMatch[1], 10) : 10;
  const xpMatch = content.match(/xpReward:\s*(\d+)/);
  const xpReward = xpMatch ? parseInt(xpMatch[1], 10) : 150;

  // Extract array of strings for supportedParameters
  const paramsMatch = content.match(/supportedParameters:\s*\[([\s\S]*?)\]/);
  const supportedParameters = paramsMatch
    ? paramsMatch[1]
        .split(',')
        .map((s) => s.replace(/['"\s]/g, ''))
        .filter(Boolean)
    : ['COM01'];

  // Extract array of strings for instructionSteps
  const stepsMatch = content.match(/instructionSteps:\s*\[([\s\S]*?)\]/);
  const instructionSteps = stepsMatch
    ? stepsMatch[1]
        .split('\n')
        .map((s) => s.replace(/^[,\s'"]+|[,\s'"]+$/g, '').trim())
        .filter(Boolean)
    : ['Complete all challenge objectives.'];

  return {
    id: id || slug,
    slug: slug || id,
    name: name || slug,
    version,
    description: description || `Interactive game module: ${name || slug}`,
    category,
    defaultDifficulty,
    supportedParameters,
    themeColor,
    badgeTone,
    durationMinutes,
    xpReward,
    instructionSteps,
  };
}

export function scanAndValidatePlugins() {
  console.log(`\n🔍 [GamePlugin Discovery] Scanning ${GAMES_DIR} ...\n`);

  if (!fs.existsSync(GAMES_DIR)) {
    console.error(`❌ [GamePlugin Discovery] Games directory does not exist: ${GAMES_DIR}`);
    return { success: false, discovered: [] };
  }

  const entries = fs.readdirSync(GAMES_DIR, { withFileTypes: true });
  const discovered = [];
  const seenSlugs = new Map();
  const errors = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (IGNORED_DIRS.has(entry.name)) continue;

    const folderPath = path.join(GAMES_DIR, entry.name);
    const manifestPath = path.join(folderPath, 'game.manifest.ts');
    const componentPath = path.join(folderPath, 'Game.tsx');

    // 1. Structural checks
    if (!fs.existsSync(manifestPath)) {
      errors.push(`[${entry.name}] Missing required manifest: game.manifest.ts`);
      continue;
    }

    if (!fs.existsSync(componentPath)) {
      errors.push(`[${entry.name}] Missing required component entry point: Game.tsx`);
      continue;
    }

    // 2. Parse manifest
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const meta = extractManifestFields(manifestContent);

    if (!meta.slug) {
      errors.push(`[${entry.name}] Manifest must define a non-empty 'slug' property`);
      continue;
    }

    if (seenSlugs.has(meta.slug)) {
      errors.push(`[${entry.name}] Slug conflict: '${meta.slug}' was already defined by folder '${seenSlugs.get(meta.slug)}'`);
      continue;
    }
    seenSlugs.set(meta.slug, entry.name);

    // 3. Security AST scan on Game.tsx
    const componentContent = fs.readFileSync(componentPath, 'utf-8');
    for (const rule of FORBIDDEN_CODE_PATTERNS) {
      if (rule.pattern.test(componentContent)) {
        errors.push(`[${entry.name}] Security violation in Game.tsx: ${rule.reason}`);
      }
    }

    discovered.push({
      folder: entry.name,
      meta,
    });
  }

  if (errors.length > 0) {
    console.error(`❌ [GamePlugin Discovery] Encountered ${errors.length} validation error(s):`);
    for (const err of errors) {
      console.error(`  • ${err}`);
    }
    return { success: false, discovered };
  }

  console.log(`✅ [GamePlugin Discovery] Successfully discovered & validated ${discovered.length} game plugins:`);
  for (const p of discovered) {
    console.log(`  • [${p.meta.slug}] ${p.meta.name} (v${p.meta.version}) -> ${p.meta.category}`);
  }

  return { success: true, discovered };
}

export function generatePluginsRegistry(discovered) {
  const fileLines = [
    '/**',
    ' * THIS FILE IS AUTOMATICALLY GENERATED BY `npm run game:sync`.',
    ' * DO NOT EDIT MANUALLY.',
    ' *',
    ' * Central Drop-In Game Plugin Registry for Winners Creek LMS.',
    ' * Automatically discovers all games adhering to `apps/game/[slug]/game.manifest.ts`.',
    ' */',
    "import * as React from 'react';",
    "import type { GamePlugin, GamePluginManifest } from './_shared/types';",
    '',
  ];

  // Dynamic lazy component loaders
  fileLines.push('// Dynamically lazy-loaded game components for isolated bundling');
  for (const p of discovered) {
    const compVar = p.meta.slug.replace(/[^a-zA-Z0-9]/g, '_') + '_Component';
    fileLines.push(`const ${compVar} = React.lazy(() => import('./${p.folder}/Game'));`);
  }
  fileLines.push('');

  // Registry map
  fileLines.push('export const DISCOVERED_PLUGINS: Record<string, GamePlugin> = {');
  for (const p of discovered) {
    const compVar = p.meta.slug.replace(/[^a-zA-Z0-9]/g, '_') + '_Component';
    fileLines.push(`  '${p.meta.slug}': {`);
    fileLines.push(`    id: ${JSON.stringify(p.meta.id)},`);
    fileLines.push(`    slug: ${JSON.stringify(p.meta.slug)},`);
    fileLines.push(`    name: ${JSON.stringify(p.meta.name)},`);
    fileLines.push(`    version: ${JSON.stringify(p.meta.version)},`);
    fileLines.push(`    description: ${JSON.stringify(p.meta.description)},`);
    fileLines.push(`    category: ${JSON.stringify(p.meta.category)},`);
    fileLines.push(`    defaultDifficulty: ${JSON.stringify(p.meta.defaultDifficulty)},`);
    fileLines.push(`    supportedParameters: ${JSON.stringify(p.meta.supportedParameters)},`);
    fileLines.push(`    themeColor: ${JSON.stringify(p.meta.themeColor)},`);
    fileLines.push(`    badgeTone: ${JSON.stringify(p.meta.badgeTone)},`);
    fileLines.push(`    durationMinutes: ${p.meta.durationMinutes},`);
    fileLines.push(`    xpReward: ${p.meta.xpReward},`);
    fileLines.push(`    instructionSteps: ${JSON.stringify(p.meta.instructionSteps)},`);
    fileLines.push(`    capabilities: { hasTimer: true, hasLives: true, supportsPause: true, supportsAdaptiveLevels: true },`);
    fileLines.push(`    component: ${compVar},`);
    fileLines.push(`  },`);
  }
  fileLines.push('};');
  fileLines.push('');
  fileLines.push('export function getDiscoveredPlugin(codeOrSlug: string): GamePlugin | undefined {');
  fileLines.push("  const normalized = (codeOrSlug || '').toLowerCase().trim();");
  fileLines.push('  if (DISCOVERED_PLUGINS[normalized]) return DISCOVERED_PLUGINS[normalized];');
  fileLines.push('  for (const [key, plugin] of Object.entries(DISCOVERED_PLUGINS)) {');
  fileLines.push('    if (normalized.includes(key) || key.includes(normalized) || plugin.id === normalized) {');
  fileLines.push('      return plugin;');
  fileLines.push('    }');
  fileLines.push('  }');
  fileLines.push('  return undefined;');
  fileLines.push('}');
  fileLines.push('');
  fileLines.push('export function getAllDiscoveredPlugins(): GamePlugin[] {');
  fileLines.push('  return Object.values(DISCOVERED_PLUGINS);');
  fileLines.push('}');
  fileLines.push('');

  fs.writeFileSync(OUTPUT_FILE, fileLines.join('\n'), 'utf-8');
  console.log(`\n📦 [GamePlugin Registry] Written generated registry -> ${OUTPUT_FILE}\n`);
}

// Execute if run from CLI
const result = scanAndValidatePlugins();
if (!result.success) {
  process.exit(1);
}
generatePluginsRegistry(result.discovered);

