import { useMemo } from "react";
import type { Player, PlayerStats } from "../types";
import { battingAverage, fmt3, onBasePct, sluggingPct } from "../stats";

interface LineupProps {
  players: Player[];
  battingOrder: string[];
  stats: Record<string, PlayerStats>;
  onChange: (order: string[]) => void;
  onSuggest: () => void;
}

export function Lineup({
  players,
  battingOrder,
  stats,
  onChange,
  onSuggest,
}: LineupProps) {
  const playerById = useMemo(() => {
    const m: Record<string, Player> = {};
    for (const p of players) m[p.id] = p;
    return m;
  }, [players]);

  const ordered = battingOrder
    .map((id) => playerById[id])
    .filter((p): p is Player => !!p);

  const benched = players.filter((p) => !battingOrder.includes(p.id));

  function move(idx: number, dir: -1 | 1) {
    const next = [...battingOrder];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  function remove(id: string) {
    onChange(battingOrder.filter((pid) => pid !== id));
  }

  function add(id: string) {
    if (battingOrder.includes(id)) return;
    onChange([...battingOrder, id]);
  }

  return (
    <div className="card">
      <h2>Kicking Lineup</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="tiny">
          Order suggestions are based on each player's OBP, then SLG, across all logged games.
        </span>
        <button className="right primary" onClick={onSuggest}>
          Suggest order
        </button>
        <button onClick={() => onChange(players.map((p) => p.id))}>
          Add everyone
        </button>
        <button className="ghost" onClick={() => onChange([])}>
          Clear order
        </button>
      </div>

      {ordered.length === 0 ? (
        <div className="empty">No batting order yet.</div>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Player</th>
                <th style={{ width: 70 }}>AVG</th>
                <th style={{ width: 70 }}>OBP</th>
                <th style={{ width: 70 }}>SLG</th>
                <th style={{ width: 70 }}>RBI</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((p, idx) => {
                const s = stats[p.id];
                return (
                  <tr key={p.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{p.name}</strong>
                      {p.number && (
                        <span className="muted"> #{p.number}</span>
                      )}
                    </td>
                    <td>{s ? fmt3(battingAverage(s)) : ".000"}</td>
                    <td>{s ? fmt3(onBasePct(s)) : ".000"}</td>
                    <td>{s ? fmt3(sluggingPct(s)) : ".000"}</td>
                    <td>{s?.rbi ?? 0}</td>
                    <td>
                      <button onClick={() => move(idx, -1)}>↑</button>
                      <button onClick={() => move(idx, 1)} style={{ marginLeft: 4 }}>
                        ↓
                      </button>
                      <button
                        className="ghost danger"
                        style={{ marginLeft: 4 }}
                        onClick={() => remove(p.id)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {benched.length > 0 && (
        <>
          <div className="section-title">Available</div>
          <div className="row">
            {benched.map((p) => (
              <button
                key={p.id}
                className="chip"
                onClick={() => add(p.id)}
                title="Add to batting order"
                style={{ cursor: "pointer" }}
              >
                + {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
