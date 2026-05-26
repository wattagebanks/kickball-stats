import { useMemo } from "react";
import type {
  DefenseRating,
  FieldingNote,
  FieldingPlay,
  Inning,
  KickingAtBat,
  KickResult,
  Player,
  Position,
  PositionId,
} from "../types";
import { POSITION_BY_ID, POSITIONS } from "../types";
import { uid } from "../storage";

const RATING_VALUES: DefenseRating[] = [1, 2, 3, 4, 5];

function sideLabel(side: Position["side"]): string {
  switch (side) {
    case "infield":
      return "Infield";
    case "outfield":
      return "Outfield";
    case "battery":
      return "Battery";
    case "bench":
      return "Bench";
  }
}

const KICK_RESULTS: { id: KickResult; label: string; hint: string }[] = [
  { id: "OUT", label: "Out", hint: "Made out" },
  { id: "1B", label: "1B", hint: "Single" },
  { id: "2B", label: "2B", hint: "Double" },
  { id: "3B", label: "3B", hint: "Triple" },
  { id: "HR", label: "HR", hint: "Home run" },
  { id: "BB", label: "BB", hint: "Walk" },
  { id: "SAC", label: "SAC", hint: "Sacrifice" },
  { id: "FC", label: "FC", hint: "Fielder's choice" },
  { id: "E", label: "ROE", hint: "Reached on error" },
];

interface StatSheetProps {
  inning: Inning;
  players: Player[];
  battingOrder: string[];
  onChange: (next: Inning) => void;
}

export function StatSheet({
  inning,
  players,
  battingOrder,
  onChange,
}: StatSheetProps) {
  const playerById = useMemo(() => {
    const m: Record<string, Player> = {};
    for (const p of players) m[p.id] = p;
    return m;
  }, [players]);

  // Render kicking entries sorted by lineup order. Repeats (a player kicking
  // a second time in the same inning) appear after the first full pass through
  // the lineup. Stable on insertion index for ties / unknown players.
  const kickingOrdered = useMemo(() => {
    const lineupIdx = (pid: string) => {
      const i = battingOrder.indexOf(pid);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const seen: Record<string, number> = {};
    const decorated = inning.kicking.map((k, originalIndex) => {
      const occurrence = seen[k.playerId] ?? 0;
      seen[k.playerId] = occurrence + 1;
      return { k, originalIndex, occurrence, lineup: lineupIdx(k.playerId) };
    });
    decorated.sort((a, b) => {
      if (a.occurrence !== b.occurrence) return a.occurrence - b.occurrence;
      if (a.lineup !== b.lineup) return a.lineup - b.lineup;
      return a.originalIndex - b.originalIndex;
    });
    return decorated.map((d) => d.k);
  }, [inning.kicking, battingOrder]);

  function updateAtBat(id: string, patch: Partial<KickingAtBat>) {
    onChange({
      ...inning,
      kicking: inning.kicking.map((k) =>
        k.id === id ? { ...k, ...patch } : k,
      ),
    });
  }

  // Same as updateAtBat but also marks the row as no-longer-pending, since
  // these interactions imply the user has logged a real result for this row.
  function commitAtBat(id: string, patch: Partial<KickingAtBat>) {
    onChange({
      ...inning,
      kicking: inning.kicking.map((k) =>
        k.id === id ? { ...k, ...patch, pending: false } : k,
      ),
    });
  }

  function removeAtBat(id: string) {
    onChange({
      ...inning,
      kicking: inning.kicking.filter((k) => k.id !== id),
    });
  }

  function addAtBat(playerId?: string) {
    // If no player passed, pick the next player in the lineup following the
    // last *logged* kicker (ignore pending placeholders so wraparound works
    // correctly for inning 1).
    const logged = inning.kicking.filter((k) => !k.pending);
    const nextPlayer =
      playerId ?? guessNextKicker(battingOrder, logged) ?? players[0]?.id;
    if (!nextPlayer) return;
    const k: KickingAtBat = {
      id: uid(),
      playerId: nextPlayer,
      result: "OUT",
      rbi: 0,
      runsScored: 0,
      runScored: false,
    };
    onChange({ ...inning, kicking: [...inning.kicking, k] });
  }

  function updateFielding(id: string, patch: Partial<FieldingPlay>) {
    onChange({
      ...inning,
      fielding: inning.fielding.map((f) =>
        f.id === id ? { ...f, ...patch } : f,
      ),
    });
  }

  function removeFielding(id: string) {
    onChange({
      ...inning,
      fielding: inning.fielding.filter((f) => f.id !== id),
    });
  }

  function addFielding() {
    const f: FieldingPlay = {
      id: uid(),
      playerId: players[0]?.id ?? "",
      position: "P",
      putouts: 0,
      assists: 0,
      errors: 0,
    };
    onChange({ ...inning, fielding: [...inning.fielding, f] });
  }

  // Defense notes are keyed by (playerId, position) — updating clears any
  // existing entry for that exact pair and writes a fresh one with the patch
  // applied. If the resulting record has neither a rating nor notes text, we
  // drop it so the inning stays clean.
  function upsertDefenseNote(
    playerId: string,
    position: PositionId,
    patch: Partial<Pick<FieldingNote, "rating" | "notes">>,
  ) {
    const existing = (inning.defenseNotes ?? []).find(
      (n) => n.playerId === playerId && n.position === position,
    );
    const merged: FieldingNote = {
      id: existing?.id ?? uid(),
      playerId,
      position,
      rating: existing?.rating,
      notes: existing?.notes,
      ...patch,
    };
    const cleanedNotes =
      typeof merged.notes === "string" && merged.notes.length === 0
        ? undefined
        : merged.notes;
    merged.notes = cleanedNotes;
    const hasContent =
      typeof merged.rating === "number" || (merged.notes ?? "").length > 0;
    const others = (inning.defenseNotes ?? []).filter(
      (n) => !(n.playerId === playerId && n.position === position),
    );
    onChange({
      ...inning,
      defenseNotes: hasContent ? [...others, merged] : others,
    });
  }

  // Pull (playerId, position) rows from the inning's field assignments and
  // attach any existing FieldingNote so the UI can edit-in-place.
  const defenseRows = useMemo(() => {
    const notesByKey: Record<string, FieldingNote> = {};
    for (const n of inning.defenseNotes ?? []) {
      notesByKey[`${n.playerId}|${n.position}`] = n;
    }
    const rows: {
      player: Player;
      position: Position;
      note?: FieldingNote;
    }[] = [];
    for (const [pid, pos] of Object.entries(inning.assignments)) {
      const player = playerById[pid];
      const meta = POSITION_BY_ID[pos];
      if (!player || !meta) continue;
      rows.push({
        player,
        position: meta,
        note: notesByKey[`${pid}|${pos}`],
      });
    }
    // Sort by side (infield, outfield, battery, bench), then position label,
    // then player name for stable rendering.
    const sideRank: Record<Position["side"], number> = {
      infield: 0,
      battery: 1,
      outfield: 2,
      bench: 3,
    };
    rows.sort((a, b) => {
      const sa = sideRank[a.position.side];
      const sb = sideRank[b.position.side];
      if (sa !== sb) return sa - sb;
      if (a.position.id !== b.position.id) {
        return a.position.id.localeCompare(b.position.id);
      }
      return a.player.name.localeCompare(b.player.name);
    });
    return rows;
  }, [inning.assignments, inning.defenseNotes, playerById]);

  return (
    <div>
      <div className="card">
        <h2>Inning {inning.number} — Kicking</h2>

        <div className="row" style={{ marginBottom: 10 }}>
          <div className="kv">
            <span className="k">Runs for</span>
            <input
              className="small-input"
              type="number"
              min={0}
              value={inning.runsFor}
              onChange={(e) =>
                onChange({ ...inning, runsFor: clampInt(e.target.value) })
              }
            />
          </div>
          <div className="kv">
            <span className="k">Runs against</span>
            <input
              className="small-input"
              type="number"
              min={0}
              value={inning.runsAgainst}
              onChange={(e) =>
                onChange({ ...inning, runsAgainst: clampInt(e.target.value) })
              }
            />
          </div>
          <button className="primary right" onClick={() => addAtBat()}>
            + Kicker
          </button>
        </div>

        {kickingOrdered.length === 0 ? (
          <div className="empty">
            No at-bats logged this inning yet. Add the first kicker.
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Kicker</th>
                  <th>Result</th>
                  <th style={{ width: 70 }}>RBI</th>
                  <th style={{ width: 80 }}>Runs</th>
                  <th style={{ width: 90 }}>Kicker scored</th>
                  <th></th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {kickingOrdered.map((k, idx) => (
                  <tr key={k.id} className={k.pending ? "pending" : undefined}>
                    <td className="muted">{idx + 1}</td>
                    <td style={{ minWidth: 180 }}>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <select
                          value={k.playerId}
                          onChange={(e) =>
                            updateAtBat(k.id, { playerId: e.target.value })
                          }
                        >
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        {k.pending && (
                          <span className="pill pending-pill" title="Placeholder from lineup — not yet logged">
                            pending
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ minWidth: 320 }}>
                      <div className="result-grid">
                        {KICK_RESULTS.map((r) => (
                          <button
                            key={r.id}
                            className={
                              !k.pending && k.result === r.id ? "selected" : ""
                            }
                            title={r.hint}
                            onClick={() => commitAtBat(k.id, { result: r.id })}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        value={k.rbi}
                        onChange={(e) =>
                          commitAtBat(k.id, { rbi: clampInt(e.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        value={k.runsScored ?? 0}
                        onChange={(e) =>
                          commitAtBat(k.id, {
                            runsScored: clampInt(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={k.runScored}
                        onChange={(e) =>
                          commitAtBat(k.id, { runScored: e.target.checked })
                        }
                        style={{ width: 18, height: 18 }}
                      />
                    </td>
                    <td>
                      <input
                        placeholder="Notes"
                        value={k.notes ?? ""}
                        onChange={(e) =>
                          updateAtBat(k.id, {
                            notes: e.target.value || undefined,
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="ghost danger"
                        onClick={() => removeAtBat(k.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="tiny" style={{ marginTop: 8 }}>
          {playerById && (
            <>
              At-bats logged: {kickingOrdered.filter((k) => !k.pending).length}
              {kickingOrdered.some((k) => k.pending) && (
                <>
                  {" "}
                  · Pending:{" "}
                  {kickingOrdered.filter((k) => k.pending).length}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Inning {inning.number} — Fielding plays</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="tiny">
            Log only standout plays (putouts, assists, errors). Position you're playing is set automatically from the field map.
          </span>
          <button className="right primary" onClick={addFielding}>
            + Play
          </button>
        </div>

        {inning.fielding.length === 0 ? (
          <div className="empty">No fielding plays logged this inning.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Position</th>
                  <th style={{ width: 70 }}>PO</th>
                  <th style={{ width: 70 }}>A</th>
                  <th style={{ width: 70 }}>E</th>
                  <th>Notes</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {inning.fielding.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <select
                        value={f.playerId}
                        onChange={(e) => {
                          const newPid = e.target.value;
                          const pos: PositionId =
                            (inning.assignments[newPid] as PositionId) ||
                            f.position;
                          updateFielding(f.id, {
                            playerId: newPid,
                            position: pos,
                          });
                        }}
                      >
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={f.position}
                        onChange={(e) =>
                          updateFielding(f.id, {
                            position: e.target.value as PositionId,
                          })
                        }
                      >
                        {POSITIONS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id} — {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        value={f.putouts}
                        onChange={(e) =>
                          updateFielding(f.id, {
                            putouts: clampInt(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        value={f.assists}
                        onChange={(e) =>
                          updateFielding(f.id, {
                            assists: clampInt(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="small-input"
                        type="number"
                        min={0}
                        value={f.errors}
                        onChange={(e) =>
                          updateFielding(f.id, {
                            errors: clampInt(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        placeholder="Notes"
                        value={f.notes ?? ""}
                        onChange={(e) =>
                          updateFielding(f.id, {
                            notes: e.target.value || undefined,
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="ghost danger"
                        onClick={() => removeFielding(f.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Inning {inning.number} — Defense notes</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="tiny">
            Rate each player at the position they're playing right now. Notes
            roll up into season-long defensive performance.
          </span>
        </div>

        {defenseRows.length === 0 ? (
          <div className="empty">
            No players are assigned to positions in this inning yet. Drag
            someone onto the field to start rating their defense.
          </div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th style={{ width: 110 }}>Position</th>
                  <th style={{ width: 220 }}>Rating</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {defenseRows.map(({ player, position, note }) => (
                  <tr key={`${player.id}|${position.id}`}>
                    <td>
                      <strong>{player.name}</strong>
                      {player.number && (
                        <span className="muted"> #{player.number}</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`pill side-pill side-${position.side}`}
                        title={position.label}
                      >
                        {position.id} ·{" "}
                        <span className="side-sub">
                          {sideLabel(position.side)}
                        </span>
                      </span>
                    </td>
                    <td>
                      <div
                        className="rating-row"
                        role="radiogroup"
                        aria-label={`Rate ${player.name} at ${position.label}`}
                      >
                        {RATING_VALUES.map((r) => {
                          const selected = note?.rating === r;
                          return (
                            <button
                              key={r}
                              className={`rating-btn${
                                selected ? " selected" : ""
                              }`}
                              role="radio"
                              aria-checked={selected}
                              title={`${r} star${r === 1 ? "" : "s"}`}
                              onClick={() =>
                                upsertDefenseNote(player.id, position.id, {
                                  rating: selected ? undefined : r,
                                })
                              }
                            >
                              {r}★
                            </button>
                          );
                        })}
                        {note?.rating !== undefined && (
                          <button
                            className="rating-clear ghost"
                            title="Clear rating"
                            onClick={() =>
                              upsertDefenseNote(player.id, position.id, {
                                rating: undefined,
                              })
                            }
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        placeholder={`Notes about ${player.name} at ${position.id}`}
                        value={note?.notes ?? ""}
                        onChange={(e) =>
                          upsertDefenseNote(player.id, position.id, {
                            notes: e.target.value,
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function clampInt(v: string): number {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function guessNextKicker(
  battingOrder: string[],
  alreadyKicked: KickingAtBat[],
): string | undefined {
  if (battingOrder.length === 0) return undefined;
  // Find the player after the last kicker in this inning.
  const lastKicker = alreadyKicked[alreadyKicked.length - 1]?.playerId;
  if (!lastKicker) return battingOrder[0];
  const idx = battingOrder.indexOf(lastKicker);
  if (idx === -1) return battingOrder[0];
  return battingOrder[(idx + 1) % battingOrder.length];
}
