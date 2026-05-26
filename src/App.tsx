import { useMemo, useRef, useState } from "react";
import { Dashboard } from "./components/Dashboard";
import { Field } from "./components/Field";
import { Lineup } from "./components/Lineup";
import { Roster } from "./components/Roster";
import { StatSheet } from "./components/StatSheet";
import { aggregatePlayerStats, suggestLineup } from "./stats";
import { uid, useAppState } from "./storage";
import type { Game, Inning, KickingAtBat, PositionId } from "./types";

type Tab = "game" | "roster" | "lineup" | "stats" | "data";

function emptyInning(number: number): Inning {
  return {
    number,
    assignments: {},
    kicking: [],
    fielding: [],
    runsFor: 0,
    runsAgainst: 0,
  };
}

function makePendingAtBat(playerId: string): KickingAtBat {
  return {
    id: uid(),
    playerId,
    result: "OUT",
    rbi: 0,
    runsScored: 0,
    runScored: false,
    pending: true,
  };
}

// Build inning 1 pre-populated with one pending at-bat per player in the
// kicking lineup, mirroring the order shown on the Lineup tab.
function seedFirstInning(battingOrder: string[]): Inning {
  return {
    ...emptyInning(1),
    kicking: battingOrder.map((pid) => makePendingAtBat(pid)),
  };
}

// Keep inning 1's pending placeholder rows in sync with the kicking lineup:
// add a pending row for any player newly in the lineup, drop pending rows for
// players removed from the lineup. Rows the user has already touched
// (pending === false) are preserved untouched. Visible ordering is handled by
// the StatSheet at render time.
function syncFirstInningPending(game: Game): Game {
  if (game.innings.length === 0) return game;
  const inn1 = game.innings[0];
  const lineupSet = new Set(game.battingOrder);
  const existing = new Set(inn1.kicking.map((k) => k.playerId));

  let nextKicking = inn1.kicking.filter(
    (k) => !k.pending || lineupSet.has(k.playerId),
  );
  const toAdd: KickingAtBat[] = [];
  for (const pid of game.battingOrder) {
    if (!existing.has(pid)) toAdd.push(makePendingAtBat(pid));
  }
  if (toAdd.length === 0 && nextKicking.length === inn1.kicking.length) {
    return game;
  }
  nextKicking = [...nextKicking, ...toAdd];
  return {
    ...game,
    innings: [
      { ...inn1, kicking: nextKicking },
      ...game.innings.slice(1),
    ],
  };
}

export default function App() {
  const { state, actions } = useAppState();
  const [tab, setTab] = useState<Tab>("game");

  const activeGame = useMemo(
    () => state.games.find((g) => g.id === state.activeGameId),
    [state.games, state.activeGameId],
  );

  const seasonStats = useMemo(
    () => aggregatePlayerStats(state.games, state.team.players),
    [state.games, state.team.players],
  );

  function createGame() {
    const today = new Date().toISOString().slice(0, 10);
    const opponent = prompt("Opponent name?", "") ?? "";
    const order = state.team.players.map((p) => p.id);
    const game = actions.addGame({
      date: today,
      opponent: opponent.trim(),
      battingOrder: order,
      innings: [seedFirstInning(order)],
    });
    actions.setActiveGame(game.id);
    setTab("game");
  }

  return (
    <div className="app">
      <header className="appbar">
        <div className="brand">
          <div className="logo" aria-hidden />
          <div>
            <h1>Kickball Stats</h1>
            <small className="muted">
              {state.team.name} • {state.team.season} season
            </small>
          </div>
        </div>
        <nav className="tabs" role="tablist">
          <button
            aria-current={tab === "game" ? "page" : undefined}
            onClick={() => setTab("game")}
          >
            Game day
          </button>
          <button
            aria-current={tab === "roster" ? "page" : undefined}
            onClick={() => setTab("roster")}
          >
            Roster
          </button>
          <button
            aria-current={tab === "lineup" ? "page" : undefined}
            onClick={() => setTab("lineup")}
          >
            Lineup
          </button>
          <button
            aria-current={tab === "stats" ? "page" : undefined}
            onClick={() => setTab("stats")}
          >
            Stats
          </button>
          <button
            aria-current={tab === "data" ? "page" : undefined}
            onClick={() => setTab("data")}
          >
            Data
          </button>
        </nav>
      </header>

      {tab === "game" && (
        <GameTab
          state={state}
          activeGame={activeGame}
          seasonStats={seasonStats}
          onCreate={createGame}
          onSwitch={(id) => actions.setActiveGame(id)}
          onUpdateGame={(id, patch) => actions.updateGame(id, patch)}
          onRemoveGame={(id) => actions.removeGame(id)}
        />
      )}

      {tab === "roster" && (
        <Roster
          players={state.team.players}
          onAdd={actions.addPlayer}
          onUpdate={actions.updatePlayer}
          onRemove={actions.removePlayer}
        />
      )}

      {tab === "lineup" && (
        <Lineup
          players={state.team.players}
          battingOrder={
            activeGame?.battingOrder ?? state.team.players.map((p) => p.id)
          }
          stats={seasonStats}
          onChange={(order) => {
            if (activeGame) {
              const synced = syncFirstInningPending({
                ...activeGame,
                battingOrder: order,
              });
              actions.updateGame(activeGame.id, {
                battingOrder: order,
                innings: synced.innings,
              });
            } else {
              const g = actions.addGame({
                date: new Date().toISOString().slice(0, 10),
                opponent: "",
                battingOrder: order,
                innings: [seedFirstInning(order)],
              });
              actions.setActiveGame(g.id);
            }
          }}
          onSuggest={() => {
            const ordered = suggestLineup(state.team.players, seasonStats).map(
              (p) => p.id,
            );
            if (activeGame) {
              const synced = syncFirstInningPending({
                ...activeGame,
                battingOrder: ordered,
              });
              actions.updateGame(activeGame.id, {
                battingOrder: ordered,
                innings: synced.innings,
              });
            } else {
              const g = actions.addGame({
                date: new Date().toISOString().slice(0, 10),
                opponent: "",
                battingOrder: ordered,
                innings: [seedFirstInning(ordered)],
              });
              actions.setActiveGame(g.id);
            }
          }}
        />
      )}

      {tab === "stats" && (
        <Dashboard players={state.team.players} games={state.games} />
      )}

      {tab === "data" && (
        <DataTab
          teamName={state.team.name}
          season={state.team.season}
          onRenameTeam={actions.renameTeam}
          onSeasonChange={actions.setSeason}
          onExport={actions.exportJSON}
          onImport={actions.importJSON}
          onReset={actions.reset}
        />
      )}
    </div>
  );
}

interface GameTabProps {
  state: ReturnType<typeof useAppState>["state"];
  activeGame: Game | undefined;
  seasonStats: ReturnType<typeof aggregatePlayerStats>;
  onCreate: () => void;
  onSwitch: (id: string) => void;
  onUpdateGame: (id: string, patch: Partial<Game>) => void;
  onRemoveGame: (id: string) => void;
}

function GameTab({
  state,
  activeGame,
  seasonStats,
  onCreate,
  onSwitch,
  onUpdateGame,
  onRemoveGame,
}: GameTabProps) {
  const [inningIdx, setInningIdx] = useState(0);

  const totals = useMemo(() => {
    return (
      activeGame?.innings.reduce(
        (acc, inn) => ({
          rf: acc.rf + (inn.runsFor || 0),
          ra: acc.ra + (inn.runsAgainst || 0),
        }),
        { rf: 0, ra: 0 },
      ) ?? { rf: 0, ra: 0 }
    );
  }, [activeGame?.innings]);

  if (!activeGame) {
    return (
      <div className="card">
        <h2>Game day</h2>
        <p className="muted">
          Start a new game to begin tracking innings, positions, and at-bats.
        </p>
        <div className="row">
          <button className="primary" onClick={onCreate}>
            + New game
          </button>
          {state.games.length > 0 && (
            <select
              onChange={(e) => onSwitch(e.target.value)}
              defaultValue=""
              style={{ width: 320 }}
            >
              <option value="" disabled>
                Or open a past game…
              </option>
              {state.games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.date} vs {g.opponent || "—"}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  }

  const currentInningIdx = Math.min(inningIdx, activeGame.innings.length - 1);
  const currentInning = activeGame.innings[currentInningIdx];

  function setInning(idx: number, next: Inning) {
    const innings = activeGame!.innings.map((inn, i) =>
      i === idx ? next : inn,
    );
    onUpdateGame(activeGame!.id, { innings });
  }

  function addInning() {
    const next = activeGame!.innings.length + 1;
    // Carry forward the previous inning's assignments so users don't re-place everyone.
    const carryAssignments =
      activeGame!.innings[activeGame!.innings.length - 1]?.assignments ?? {};
    const innings: Inning[] = [
      ...activeGame!.innings,
      { ...emptyInning(next), assignments: { ...carryAssignments } },
    ];
    onUpdateGame(activeGame!.id, { innings });
    setInningIdx(innings.length - 1);
  }

  function removeInning(idx: number) {
    if (!confirm(`Remove inning ${activeGame!.innings[idx].number}?`)) return;
    const innings = activeGame!.innings
      .filter((_, i) => i !== idx)
      .map((inn, i) => ({ ...inn, number: i + 1 }));
    onUpdateGame(activeGame!.id, { innings });
    setInningIdx(Math.max(0, idx - 1));
  }

  function assign(playerId: string, pos: PositionId | "BENCH") {
    const next = { ...currentInning.assignments };
    if (pos === "BENCH") {
      delete next[playerId];
    } else {
      // Remove any other player who currently sits in this position.
      for (const [otherId, otherPos] of Object.entries(next)) {
        if (otherPos === pos && otherId !== playerId) {
          delete next[otherId];
        }
      }
      next[playerId] = pos;
    }
    setInning(currentInningIdx, {
      ...currentInning,
      assignments: next,
    });
  }

  function clearField() {
    setInning(currentInningIdx, { ...currentInning, assignments: {} });
  }

  function autoFill() {
    // Fill in any empty positions in a defined priority order, using bench
    // players in roster order. Doesn't reshuffle people already on the field.
    const ASSIGN_ORDER: PositionId[] = [
      "P",
      "C",
      "1B",
      "2B",
      "SS",
      "3B",
      "LF",
      "RF",
      "LCF",
      "RCF",
    ];
    const filled = new Set(Object.values(currentInning.assignments));
    const benched = state.team.players.filter(
      (p) => !currentInning.assignments[p.id],
    );
    const next = { ...currentInning.assignments };
    for (const pos of ASSIGN_ORDER) {
      if (filled.has(pos)) continue;
      const candidate = benched.shift();
      if (!candidate) break;
      next[candidate.id] = pos;
      filled.add(pos);
    }
    setInning(currentInningIdx, { ...currentInning, assignments: next });
  }

  function copyLastInning() {
    if (currentInningIdx === 0) return;
    const prev = activeGame!.innings[currentInningIdx - 1];
    setInning(currentInningIdx, {
      ...currentInning,
      assignments: { ...prev.assignments },
    });
  }

  return (
    <div>
      <div className="card">
        <div className="row">
          <div>
            <h2 style={{ marginBottom: 4 }}>
              vs {activeGame.opponent || "—"}
            </h2>
            <div className="tiny muted">
              {activeGame.date} • Inning {currentInning?.number ?? 1} of{" "}
              {activeGame.innings.length}
            </div>
          </div>
          <div className="right" style={{ display: "flex", gap: 8 }}>
            <select
              value={activeGame.id}
              onChange={(e) => {
                onSwitch(e.target.value);
                setInningIdx(0);
              }}
              style={{ width: 240 }}
            >
              {state.games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.date} vs {g.opponent || "—"}
                </option>
              ))}
            </select>
            <button className="primary" onClick={onCreate}>
              + New game
            </button>
          </div>
        </div>

        <div className="divider" />

        <div className="grid cols-3">
          <div>
            <label className="tiny">Date</label>
            <input
              type="date"
              value={activeGame.date}
              onChange={(e) =>
                onUpdateGame(activeGame.id, { date: e.target.value })
              }
            />
          </div>
          <div>
            <label className="tiny">Opponent</label>
            <input
              value={activeGame.opponent}
              onChange={(e) =>
                onUpdateGame(activeGame.id, { opponent: e.target.value })
              }
            />
          </div>
          <div>
            <label className="tiny">Location</label>
            <input
              value={activeGame.location ?? ""}
              onChange={(e) =>
                onUpdateGame(activeGame.id, {
                  location: e.target.value || undefined,
                })
              }
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <div className="kv">
            <span className="k">Score</span>
            <span className="v">
              {totals.rf} – {totals.ra}
            </span>
          </div>
          <div className="kv">
            <span className="k">Status</span>
            <select
              value={activeGame.result ?? ""}
              onChange={(e) =>
                onUpdateGame(activeGame.id, {
                  result: (e.target.value || undefined) as
                    | Game["result"]
                    | undefined,
                })
              }
              style={{ width: 130 }}
            >
              <option value="">In progress</option>
              <option value="W">Win</option>
              <option value="L">Loss</option>
              <option value="T">Tie</option>
            </select>
          </div>
          <button
            className="ghost danger right"
            onClick={() => {
              if (confirm("Delete this game and all its stats?")) {
                onRemoveGame(activeGame.id);
              }
            }}
          >
            Delete game
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Field positions</h2>
          <span className="right" style={{ display: "flex", gap: 8 }}>
            <button onClick={copyLastInning} disabled={currentInningIdx === 0}>
              Copy from previous
            </button>
          </span>
        </div>

        <div className="inning-tabs">
          {activeGame.innings.map((inn, i) => (
            <button
              key={inn.number}
              aria-current={i === currentInningIdx}
              onClick={() => setInningIdx(i)}
            >
              Inning {inn.number}
            </button>
          ))}
          <button className="primary" onClick={addInning}>
            + Inning
          </button>
          {activeGame.innings.length > 1 && (
            <button
              className="ghost danger"
              onClick={() => removeInning(currentInningIdx)}
            >
              Remove inning
            </button>
          )}
        </div>

        {currentInning && (
          <Field
            players={state.team.players}
            assignments={currentInning.assignments}
            stats={seasonStats}
            onAssign={assign}
            onClear={clearField}
            onAuto={autoFill}
          />
        )}
      </div>

      {currentInning && (
        <StatSheet
          inning={currentInning}
          players={state.team.players}
          battingOrder={activeGame.battingOrder}
          onChange={(next) => setInning(currentInningIdx, next)}
        />
      )}
    </div>
  );
}

interface DataTabProps {
  teamName: string;
  season: string;
  onRenameTeam: (s: string) => void;
  onSeasonChange: (s: string) => void;
  onExport: () => string;
  onImport: (s: string) => boolean;
  onReset: () => void;
}

function DataTab({
  teamName,
  season,
  onRenameTeam,
  onSeasonChange,
  onExport,
  onImport,
  onReset,
}: DataTabProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function doExport() {
    const json = onExport();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kickball-stats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(file: File) {
    const text = await file.text();
    if (onImport(text)) {
      alert("Imported successfully.");
    } else {
      alert("Could not parse that file. Make sure it was exported from this app.");
    }
  }

  return (
    <div className="card">
      <h2>Team & data</h2>
      <div className="grid cols-2">
        <div>
          <label className="tiny">Team name</label>
          <input
            value={teamName}
            onChange={(e) => onRenameTeam(e.target.value)}
          />
        </div>
        <div>
          <label className="tiny">Season</label>
          <input
            value={season}
            onChange={(e) => onSeasonChange(e.target.value)}
          />
        </div>
      </div>

      <div className="divider" />

      <h2 style={{ marginTop: 0 }}>Backup</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Stats are stored locally in your browser. Export a backup to move data
        between devices.
      </p>
      <div className="row">
        <button className="primary" onClick={doExport}>
          Export JSON
        </button>
        <button onClick={() => fileRef.current?.click()}>Import JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doImport(f);
            e.target.value = "";
          }}
        />
        <button
          className="ghost danger right"
          onClick={() => {
            if (
              confirm(
                "Reset everything? This deletes all players and games on this device.",
              )
            ) {
              onReset();
            }
          }}
        >
          Reset all data
        </button>
      </div>
    </div>
  );
}
