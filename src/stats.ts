import type {
  Game,
  KickResult,
  Player,
  PlayerStats,
  Position,
  PositionId,
  PositionStats,
} from "./types";
import { emptyPlayerStats, emptyPositionStats, POSITION_BY_ID } from "./types";

// Most recent notes kept per (player, position).
const MAX_RECENT_NOTES = 3;

function getPosBucket(s: PlayerStats, pos: PositionId): PositionStats {
  const existing = s.byPosition[pos];
  if (existing) return existing;
  const fresh = emptyPositionStats();
  s.byPosition[pos] = fresh;
  return fresh;
}

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
        const bucket = getPosBucket(s, f.position);
        bucket.putouts += f.putouts || 0;
        bucket.assists += f.assists || 0;
        bucket.errors += f.errors || 0;
      }
      for (const [pid, pos] of Object.entries(inn.assignments)) {
        const s = (out[pid] ??= emptyPlayerStats(pid));
        s.inningsByPosition[pos as PositionId] =
          (s.inningsByPosition[pos as PositionId] || 0) + 1;
        const bucket = getPosBucket(s, pos as PositionId);
        bucket.innings += 1;
      }
      for (const n of inn.defenseNotes ?? []) {
        const s = (out[n.playerId] ??= emptyPlayerStats(n.playerId));
        const bucket = getPosBucket(s, n.position);
        if (typeof n.rating === "number") {
          bucket.ratingSum += n.rating;
          bucket.ratingCount += 1;
        }
        const noteText = (n.notes ?? "").trim();
        if (noteText) {
          // Prepend so newest is first; cap length to keep memory tidy.
          bucket.lastNotes.unshift(noteText);
          if (bucket.lastNotes.length > MAX_RECENT_NOTES) {
            bucket.lastNotes.length = MAX_RECENT_NOTES;
          }
        }
      }
    }
  }
  return out;
}

export function averageRating(
  s: PlayerStats | undefined,
  pos: PositionId,
): number | undefined {
  const bucket = s?.byPosition[pos];
  if (!bucket || bucket.ratingCount === 0) return undefined;
  return bucket.ratingSum / bucket.ratingCount;
}

export function ratingSample(
  s: PlayerStats | undefined,
  pos: PositionId,
): number {
  return s?.byPosition[pos]?.ratingCount ?? 0;
}

export function inningsAt(
  s: PlayerStats | undefined,
  pos: PositionId,
): number {
  return s?.byPosition[pos]?.innings ?? 0;
}

// Returns the position id with the highest average rating among positions on
// the given side (with at least one rating recorded). Ties broken by sample
// size, then by total fielding chances.
export function bestPositionFor(
  s: PlayerStats | undefined,
  side: Position["side"],
): PositionId | undefined {
  if (!s) return undefined;
  let best: { pos: PositionId; avg: number; count: number; chances: number } | undefined;
  for (const [pos, bucket] of Object.entries(s.byPosition) as [
    PositionId,
    PositionStats,
  ][]) {
    if (!bucket || bucket.ratingCount === 0) continue;
    const meta = POSITION_BY_ID[pos];
    if (!meta || meta.side !== side) continue;
    const avg = bucket.ratingSum / bucket.ratingCount;
    const chances = bucket.putouts + bucket.assists + bucket.errors;
    if (
      !best ||
      avg > best.avg + 1e-9 ||
      (Math.abs(avg - best.avg) < 1e-9 && bucket.ratingCount > best.count) ||
      (Math.abs(avg - best.avg) < 1e-9 &&
        bucket.ratingCount === best.count &&
        chances > best.chances)
    ) {
      best = { pos, avg, count: bucket.ratingCount, chances };
    }
  }
  return best?.pos;
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
