// Domain model for Kickball Stats.

export type PositionId =
  | "P"
  | "C"
  | "1B"
  | "2B"
  | "3B"
  | "SS"
  | "LF"
  | "LCF"
  | "RCF"
  | "RF"
  | "BENCH";

export interface Position {
  id: PositionId;
  label: string;
  side: "infield" | "outfield" | "battery" | "bench";
  // SVG coordinates on a 1000x900 viewBox. Bench slots are placed off-field.
  x: number;
  y: number;
}

export const POSITIONS: Position[] = [
  { id: "P", label: "Pitcher", side: "battery", x: 500, y: 540 },
  { id: "C", label: "Catcher", side: "battery", x: 500, y: 830 },
  { id: "1B", label: "1st Base", side: "infield", x: 745, y: 600 },
  { id: "2B", label: "2nd Base", side: "infield", x: 620, y: 460 },
  { id: "SS", label: "Shortstop", side: "infield", x: 380, y: 460 },
  { id: "3B", label: "3rd Base", side: "infield", x: 255, y: 600 },
  { id: "LF", label: "Left Field", side: "outfield", x: 195, y: 290 },
  { id: "LCF", label: "Left-Center", side: "outfield", x: 395, y: 200 },
  { id: "RCF", label: "Right-Center", side: "outfield", x: 605, y: 200 },
  { id: "RF", label: "Right Field", side: "outfield", x: 805, y: 290 },
];

export const POSITION_BY_ID: Record<PositionId, Position | undefined> =
  POSITIONS.reduce((acc, p) => {
    acc[p.id] = p;
    return acc;
  }, {} as Record<PositionId, Position | undefined>);

export interface Player {
  id: string;
  name: string;
  number?: string;
  notes?: string;
  // Optional player-preferred sides, used by the lineup helper.
  preferred?: ("infield" | "outfield" | "battery")[];
}

// A kicking result for a single at-bat.
export type KickResult =
  | "OUT"
  | "1B"
  | "2B"
  | "3B"
  | "HR"
  | "BB" // walk
  | "SAC" // sacrifice
  | "FC" // fielder's choice
  | "E"; // reached on error

export interface KickingAtBat {
  id: string;
  playerId: string;
  result: KickResult;
  rbi: number;
  runScored: boolean;
  notes?: string;
  // A pending row is a placeholder seeded from the kicking lineup that the
  // user has not yet logged. Pending rows are excluded from aggregated stats
  // and are rendered in a muted style. Any user interaction (selecting a
  // result, RBI change, run-scored change) flips this to false.
  pending?: boolean;
}

// A fielding play credited to a player in a given inning.
export interface FieldingPlay {
  id: string;
  playerId: string;
  // Where they were positioned when the play happened.
  position: PositionId;
  putouts: number;
  assists: number;
  errors: number;
  notes?: string;
}

export interface Inning {
  number: number;
  // playerId -> PositionId map for fielding positions this inning.
  assignments: Record<string, PositionId>;
  kicking: KickingAtBat[];
  fielding: FieldingPlay[];
  runsFor: number;
  runsAgainst: number;
}

export interface Game {
  id: string;
  date: string; // ISO date "YYYY-MM-DD"
  opponent: string;
  location?: string;
  notes?: string;
  // Ordered list of player IDs for the kicking lineup.
  battingOrder: string[];
  innings: Inning[];
  result?: "W" | "L" | "T";
}

export interface Team {
  name: string;
  season: string;
  players: Player[];
}

export interface AppState {
  version: 1;
  team: Team;
  games: Game[];
  // ID of the game currently being run; if undefined, none active.
  activeGameId?: string;
}

// Aggregated per-player stats for the season (or a slice of games).
export interface PlayerStats {
  playerId: string;
  ab: number; // at-bats (excludes walks & sacs)
  pa: number; // plate appearances
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  walks: number;
  sacrifices: number;
  reachedOnError: number;
  rbi: number;
  runs: number;
  outs: number;
  putouts: number;
  assists: number;
  errors: number;
  inningsByPosition: Record<PositionId, number>;
}

export function emptyPlayerStats(playerId: string): PlayerStats {
  return {
    playerId,
    ab: 0,
    pa: 0,
    hits: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    walks: 0,
    sacrifices: 0,
    reachedOnError: 0,
    rbi: 0,
    runs: 0,
    outs: 0,
    putouts: 0,
    assists: 0,
    errors: 0,
    inningsByPosition: {} as Record<PositionId, number>,
  };
}
