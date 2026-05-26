import type {
  Game,
  KickResult,
  Player,
  PlayerStats,
  PositionId,
} from "./types";
import { emptyPlayerStats } from "./types";

export function isHit(r: KickResult): boolean {
  return r === "1B" || r === "2B" || r === "3B" || r === "HR";
}

export function isAtBat(r: KickResult): boolean {
  // BB and SAC don't count as official at-bats.
  return r !== "BB" && r !== "SAC";
}

export function aggregatePlayerStats(
  games: Game[],
  players: Player[],
): Record<string, PlayerStats> {
  const out: Record<string, PlayerStats> = {};
  for (const p of players) out[p.id] = emptyPlayerStats(p.id);

  for (const game of games) {
    for (const inn of game.innings) {
      for (const k of inn.kicking) {
        if (k.pending) continue;
        const s = (out[k.playerId] ??= emptyPlayerStats(k.playerId));
        s.pa += 1;
        if (isAtBat(k.result)) s.ab += 1;
        if (k.result === "OUT" || k.result === "FC") s.outs += 1;
        if (k.result === "BB") s.walks += 1;
        if (k.result === "SAC") s.sacrifices += 1;
        if (k.result === "E") s.reachedOnError += 1;
        if (k.result === "1B") {
          s.hits += 1;
          s.singles += 1;
        }
        if (k.result === "2B") {
          s.hits += 1;
          s.doubles += 1;
        }
        if (k.result === "3B") {
          s.hits += 1;
          s.triples += 1;
        }
        if (k.result === "HR") {
          s.hits += 1;
          s.homeRuns += 1;
        }
        s.rbi += k.rbi || 0;
        if (k.runScored) s.runs += 1;
      }
      for (const f of inn.fielding) {
        const s = (out[f.playerId] ??= emptyPlayerStats(f.playerId));
        s.putouts += f.putouts || 0;
        s.assists += f.assists || 0;
        s.errors += f.errors || 0;
      }
      for (const [pid, pos] of Object.entries(inn.assignments)) {
        const s = (out[pid] ??= emptyPlayerStats(pid));
        s.inningsByPosition[pos as PositionId] =
          (s.inningsByPosition[pos as PositionId] || 0) + 1;
      }
    }
  }
  return out;
}

export function battingAverage(s: PlayerStats): number {
  if (s.ab === 0) return 0;
  return s.hits / s.ab;
}

export function onBasePct(s: PlayerStats): number {
  const denom = s.ab + s.walks + s.sacrifices;
  if (denom === 0) return 0;
  return (s.hits + s.walks) / denom;
}

export function sluggingPct(s: PlayerStats): number {
  if (s.ab === 0) return 0;
  const tb = s.singles + 2 * s.doubles + 3 * s.triples + 4 * s.homeRuns;
  return tb / s.ab;
}

export function fieldingPct(s: PlayerStats): number {
  const chances = s.putouts + s.assists + s.errors;
  if (chances === 0) return 0;
  return (s.putouts + s.assists) / chances;
}

export function fmt3(n: number): string {
  return n.toFixed(3).replace(/^0/, "");
}

// Suggest a kicking lineup ordered by a simple weighted score.
// Higher OBP > Higher SLG > more games played, ties broken by name.
export function suggestLineup(
  players: Player[],
  stats: Record<string, PlayerStats>,
): Player[] {
  return [...players].sort((a, b) => {
    const sa = stats[a.id];
    const sb = stats[b.id];
    if (!sa && !sb) return a.name.localeCompare(b.name);
    if (!sa) return 1;
    if (!sb) return -1;
    const obpDiff = onBasePct(sb) - onBasePct(sa);
    if (Math.abs(obpDiff) > 1e-9) return obpDiff;
    const slgDiff = sluggingPct(sb) - sluggingPct(sa);
    if (Math.abs(slgDiff) > 1e-9) return slgDiff;
    const paDiff = sb.pa - sa.pa;
    if (paDiff !== 0) return paDiff;
    return a.name.localeCompare(b.name);
  });
}
