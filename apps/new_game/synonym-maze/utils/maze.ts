import type { GameDifficultyTier } from '../../_shared/types';
import { LAYOUTS } from './layouts';

export const GRID = 9;
export const CELL_COUNT = GRID * GRID;

/** A cell is its row-major index: row * GRID + column. */
export type Cell = number;
export type Direction = 'up' | 'down' | 'left' | 'right';

/** The player always starts in the middle of the maze. */
export const START: Cell = 4 * GRID + 4;

/** Chamber corners in reading order: top-left, top-right, bottom-left, bottom-right. */
export const CORNERS: readonly Cell[] = [0, GRID - 1, GRID * (GRID - 1), CELL_COUNT - 1];

const DELTAS: Record<Direction, readonly [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

export const rowOf = (cell: Cell): number => Math.floor(cell / GRID);
export const colOf = (cell: Cell): number => cell % GRID;

/* ------------------------------------------------------------------------ */
/* Layout helpers                                                           */
/* ------------------------------------------------------------------------ */

/** True for floor, false for wall. Length is always CELL_COUNT. */
export function parseLayout(rows: readonly string[]): boolean[] {
  const open: boolean[] = [];
  for (let r = 0; r < GRID; r += 1) {
    const line = rows[r] ?? '';
    for (let c = 0; c < GRID; c += 1) open.push(line.charAt(c) === '.');
  }
  return open;
}

export function mirrorRows(rows: readonly string[]): string[] {
  return rows.map((line) => line.split('').reverse().join(''));
}

/** The neighbouring cell in a direction, or null at the edge. Walls are not checked here. */
function neighbour(cell: Cell, direction: Direction): Cell | null {
  const [dr, dc] = DELTAS[direction];
  const r = rowOf(cell) + dr;
  const c = colOf(cell) + dc;
  if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null;
  return r * GRID + c;
}

/** The floor cell reached by stepping one way, or null if a wall or the edge is in the way. */
export function stepFrom(open: readonly boolean[], cell: Cell, direction: Direction): Cell | null {
  const next = neighbour(cell, direction);
  return next !== null && open[next] ? next : null;
}

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export function openNeighbours(open: readonly boolean[], cell: Cell): Cell[] {
  const result: Cell[] = [];
  for (const direction of DIRECTIONS) {
    const next = stepFrom(open, cell, direction);
    if (next !== null) result.push(next);
  }
  return result;
}

/** A junction is a floor cell with three or more ways out. Used to throttle MOVE_MADE events. */
export function isJunction(open: readonly boolean[], cell: Cell): boolean {
  return openNeighbours(open, cell).length >= 3;
}

/* ------------------------------------------------------------------------ */
/* Path finding                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Breadth-first distances from `from`. Cells in `avoid` count as walls, so a
 * route to one chamber never cuts through another. Unreachable cells are -1.
 */
export function distancesFrom(
  open: readonly boolean[],
  from: Cell,
  avoid: ReadonlySet<Cell> = new Set<Cell>(),
): number[] {
  const dist: number[] = new Array<number>(CELL_COUNT).fill(-1);
  dist[from] = 0;
  const queue: Cell[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    for (const next of openNeighbours(open, cell)) {
      if (dist[next] !== -1 || avoid.has(next)) continue;
      dist[next] = dist[cell] + 1;
      queue.push(next);
    }
  }
  return dist;
}

/** Shortest path from `from` to `to`, both included, or null if there is none. */
export function shortestPath(
  open: readonly boolean[],
  from: Cell,
  to: Cell,
  avoid: ReadonlySet<Cell> = new Set<Cell>(),
): Cell[] | null {
  if (from === to) return [from];
  const previous: number[] = new Array<number>(CELL_COUNT).fill(-1);
  const seen: boolean[] = new Array<boolean>(CELL_COUNT).fill(false);
  seen[from] = true;
  const queue: Cell[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    for (const next of openNeighbours(open, cell)) {
      if (seen[next] || (avoid.has(next) && next !== to)) continue;
      seen[next] = true;
      previous[next] = cell;
      if (next === to) {
        const path: Cell[] = [to];
        let walk = cell;
        while (walk !== from) {
          path.push(walk);
          walk = previous[walk];
        }
        path.push(from);
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/* ------------------------------------------------------------------------ */
/* Footprint trail (what the chaser follows)                                */
/* ------------------------------------------------------------------------ */

/**
 * Adds a step to the trail. Walking back onto a cell already in the trail
 * erases the loop, so the trail is always a simple route from the start to the
 * player and the chaser never wanders into dead ends the player has left.
 */
export function advanceTrail(trail: readonly Cell[], next: Cell): Cell[] {
  const at = trail.indexOf(next);
  if (at >= 0) return trail.slice(0, at + 1);
  return [...trail, next];
}

/**
 * Where the chaser stands on the trail. `progress` runs from 0 (full time) to
 * 1 (time up). At 1 the chaser is exactly on the player. Returns -1 while it is
 * still waiting behind the start cell.
 */
export function chaserIndex(trailLength: number, progress: number): number {
  if (trailLength <= 0) return -1;
  const clamped = Math.max(0, Math.min(1, progress));
  const index = Math.floor(clamped * trailLength) - 1;
  return Math.max(-1, Math.min(trailLength - 1, index));
}

/* ------------------------------------------------------------------------ */
/* Seeded randomness (render stays pure: same question, same board)         */
/* ------------------------------------------------------------------------ */

export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ------------------------------------------------------------------------ */
/* Board for one question                                                   */
/* ------------------------------------------------------------------------ */

export interface Board {
  /** Floor flags, length CELL_COUNT. */
  open: boolean[];
  /** chamberCells[optionIndex] is the corner cell where that option waits. */
  chamberCells: Cell[];
}

/**
 * The layout, its mirroring and which option sits in which corner depend only
 * on the question id and the tier. Chamber positions are shuffled for looks
 * only: the answer submitted is always the original option index.
 */
export function buildBoard(questionId: string, tier: GameDifficultyTier): Board {
  const pool = LAYOUTS[tier] ?? LAYOUTS.BEGINNER;
  const random = mulberry32(hashString(questionId));
  const picked = pool[Math.floor(random() * pool.length) % pool.length];
  const rows = random() < 0.5 ? mirrorRows(picked) : picked;

  const optionAtCorner = shuffled([0, 1, 2, 3], random);
  const chamberCells: Cell[] = [0, 0, 0, 0];
  optionAtCorner.forEach((optionIndex, cornerSlot) => {
    chamberCells[optionIndex] = CORNERS[cornerSlot];
  });

  return { open: parseLayout(rows), chamberCells };
}

/** The option index waiting at a cell, or -1 if the cell is not a chamber. */
export function optionAt(board: Board, cell: Cell, optionCount: number): number {
  const index = board.chamberCells.indexOf(cell);
  return index >= 0 && index < optionCount ? index : -1;
}

/* ------------------------------------------------------------------------ */
/* Fairness check for layout authors                                        */
/* ------------------------------------------------------------------------ */

export interface LayoutReport {
  problems: string[];
  /** Walking distance from the start to each corner, avoiding the other corners. */
  distances: number[];
}

/**
 * Checks a layout against the fairness rules. Not used while playing; run it
 * from a script or a unit test whenever a layout is added or changed.
 *
 * Fairness rules from the design spec: every chamber reachable, shortest paths
 * to the four chambers differ by at most one step, no route has to pass through
 * another chamber, every chamber reachable within 60% of the shortest timer at
 * the auto-walk speed, and corridors are one cell wide.
 */
export function checkLayout(
  rows: readonly string[],
  autoWalkStepMs: number,
  shortestTimerMs: number,
): LayoutReport {
  const problems: string[] = [];
  const open = parseLayout(rows);
  if (rows.length !== GRID || rows.some((line) => line.length !== GRID)) {
    problems.push('layout is not 9 x 9');
  }
  if (!open[START]) problems.push('start cell is a wall');

  const distances: number[] = [];
  for (const corner of CORNERS) {
    if (!open[corner]) {
      problems.push(`corner ${corner} is a wall`);
      distances.push(-1);
      continue;
    }
    const others = new Set<Cell>(CORNERS.filter((c) => c !== corner));
    const path = shortestPath(open, START, corner, others);
    const plain = distancesFrom(open, START)[corner];
    if (!path) {
      problems.push(`corner ${corner} unreachable without passing another chamber`);
      distances.push(-1);
      continue;
    }
    distances.push(path.length - 1);
    if (path.length - 1 !== plain) {
      problems.push(`corner ${corner}: shortest route passes through another chamber`);
    }
  }

  const reachable = distances.filter((d) => d >= 0);
  if (reachable.length === CORNERS.length) {
    const spread = Math.max(...reachable) - Math.min(...reachable);
    if (spread > 1) problems.push(`chamber distances differ by ${spread}`);
    if (Math.max(...reachable) * autoWalkStepMs > 0.6 * shortestTimerMs) {
      problems.push('auto-walk to the farthest chamber takes more than 60% of the shortest timer');
    }
  }

  const distAll = distancesFrom(open, START);
  const floorCount = open.filter(Boolean).length;
  if (distAll.filter((d) => d >= 0).length !== floorCount) problems.push('some floor cells are cut off');

  for (let r = 0; r < GRID - 1; r += 1) {
    for (let c = 0; c < GRID - 1; c += 1) {
      const i = r * GRID + c;
      if (open[i] && open[i + 1] && open[i + GRID] && open[i + GRID + 1]) {
        problems.push(`open 2 x 2 block at row ${r}, column ${c}`);
      }
    }
  }

  return { problems, distances };
}
