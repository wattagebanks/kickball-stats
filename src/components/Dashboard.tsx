import { useMemo, useState } from "react";
import type { Game, Player, PositionId } from "../types";
import { POSITIONS } from "../types";
import {
  aggregatePlayerStats,
  battingAverage,
  fieldingPct,
  fmt3,
  onBasePct,
  sluggingPct,
} from "../stats";

interface DashboardProps {
  players: Player[];
  games: Game[];
}

type SortKey = "name" | "avg" | "obp" | "slg" | "hr" | "rbi" | "fpct";

export function Dashboard({ players, games }: DashboardProps) {
  const [sortKey, setSortKey] = useState<SortKey>("avg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [gameFilter, setGameFilter] = useState<string>("all");

  const filteredGames = useMemo(() => {
    if (gameFilter === "all") return games;
    return games.filter((g) => g.id === gameFilter);
  }, [games, gameFilter]);

  const stats = useMemo(
    () => aggregatePlayerStats(filteredGames, players),
    [filteredGames, players],
  );

  const sorted = useMemo(() => {
    const rows = players.map((p) => ({ player: p, s: stats[p.id] }));
    rows.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [players, stats, sortKey, sortDir]);

  function header(key: SortKey, label: string, width?: number) {
    const active = sortKey === key;
    return (
      <th
        style={{ cursor: "pointer", width }}
        onClick={() => {
          if (active) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
          } else {
            setSortKey(key);
            setSortDir("desc");
          }
        }}
      >
        {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
      </th>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>Season stats</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="tiny">Show stats for:</label>
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            style={{ width: 280 }}
          >
            <option value="all">All games</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.date} vs {g.opponent || "—"}
              </option>
            ))}
          </select>
          <span className="right tiny">
            {filteredGames.length} game{filteredGames.length === 1 ? "" : "s"} •{" "}
            {players.length} players
          </span>
        </div>

        {players.length === 0 ? (
          <div className="empty">
            Add players to your roster to see stats here.
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  {header("name", "Player")}
                  <th>PA</th>
                  <th>AB</th>
                  <th>H</th>
                  {header("hr", "HR", 60)}
                  {header("rbi", "RBI", 60)}
                  <th>R</th>
                  {header("avg", "AVG", 70)}
                  {header("obp", "OBP", 70)}
                  {header("slg", "SLG", 70)}
                  <th>PO</th>
                  <th>A</th>
                  <th>E</th>
                  {header("fpct", "F%", 70)}
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ player, s }) => (
                  <tr key={player.id}>
                    <td>
                      <strong>{player.name}</strong>
                      {player.number && (
                        <span className="muted"> #{player.number}</span>
                      )}
                    </td>
                    <td>{s?.pa ?? 0}</td>
                    <td>{s?.ab ?? 0}</td>
                    <td>{s?.hits ?? 0}</td>
                    <td>{s?.homeRuns ?? 0}</td>
                    <td>{s?.rbi ?? 0}</td>
                    <td>{s?.runs ?? 0}</td>
                    <td>{s ? fmt3(battingAverage(s)) : ".000"}</td>
                    <td>{s ? fmt3(onBasePct(s)) : ".000"}</td>
                    <td>{s ? fmt3(sluggingPct(s)) : ".000"}</td>
                    <td>{s?.putouts ?? 0}</td>
                    <td>{s?.assists ?? 0}</td>
                    <td>{s?.errors ?? 0}</td>
                    <td>{s ? fmt3(fieldingPct(s)) : ".000"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Innings by position</h2>
        {players.length === 0 ? (
          <div className="empty">No players yet.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  {POSITIONS.map((p) => (
                    <th key={p.id} title={p.label}>
                      {p.id}
                    </th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const s = stats[p.id];
                  const total = POSITIONS.reduce(
                    (acc, pos) =>
                      acc + (s?.inningsByPosition[pos.id as PositionId] ?? 0),
                    0,
                  );
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      {POSITIONS.map((pos) => {
                        const n =
                          s?.inningsByPosition[pos.id as PositionId] ?? 0;
                        return (
                          <td
                            key={pos.id}
                            style={{
                              color: n ? "var(--text)" : "var(--text-muted)",
                            }}
                          >
                            {n}
                          </td>
                        );
                      })}
                      <td>
                        <strong>{total}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function compare(
  a: { player: Player; s: ReturnType<typeof aggregatePlayerStats>[string] },
  b: { player: Player; s: ReturnType<typeof aggregatePlayerStats>[string] },
  key: SortKey,
): number {
  if (key === "name") return a.player.name.localeCompare(b.player.name);
  const sa = a.s;
  const sb = b.s;
  if (!sa && !sb) return 0;
  if (!sa) return -1;
  if (!sb) return 1;
  switch (key) {
    case "avg":
      return battingAverage(sa) - battingAverage(sb);
    case "obp":
      return onBasePct(sa) - onBasePct(sb);
    case "slg":
      return sluggingPct(sa) - sluggingPct(sb);
    case "hr":
      return sa.homeRuns - sb.homeRuns;
    case "rbi":
      return sa.rbi - sb.rbi;
    case "fpct":
      return fieldingPct(sa) - fieldingPct(sb);
  }
}
