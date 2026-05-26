import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppState, Game, Player, Team } from "./types";

const STORAGE_KEY = "kickball-stats:v1";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultState(): AppState {
  const team: Team = {
    name: "My Kickball Team",
    season: new Date().getFullYear().toString(),
    players: [],
  };
  return { version: 1, team, games: [] };
}

function loadState(): AppState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== 1) return defaultState();
    return parsed;
  } catch {
    return defaultState();
  }
}

function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useAppState() {
  const [state, setStateRaw] = useState<AppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const setState = useCallback(
    (updater: (prev: AppState) => AppState) => {
      setStateRaw((prev) => updater(prev));
    },
    [],
  );

  const actions = useMemo(
    () => ({
      // Team / roster
      renameTeam(name: string) {
        setState((s) => ({ ...s, team: { ...s.team, name } }));
      },
      setSeason(season: string) {
        setState((s) => ({ ...s, team: { ...s.team, season } }));
      },
      addPlayer(input: Omit<Player, "id">): Player {
        const player: Player = { ...input, id: uid() };
        setState((s) => ({
          ...s,
          team: { ...s.team, players: [...s.team.players, player] },
        }));
        return player;
      },
      updatePlayer(id: string, patch: Partial<Player>) {
        setState((s) => ({
          ...s,
          team: {
            ...s.team,
            players: s.team.players.map((p) =>
              p.id === id ? { ...p, ...patch } : p,
            ),
          },
        }));
      },
      removePlayer(id: string) {
        setState((s) => ({
          ...s,
          team: {
            ...s.team,
            players: s.team.players.filter((p) => p.id !== id),
          },
          // Also strip the player from any game lineups so nothing dangles.
          games: s.games.map((g) => ({
            ...g,
            battingOrder: g.battingOrder.filter((pid) => pid !== id),
            innings: g.innings.map((inn) => {
              const next = { ...inn.assignments };
              delete next[id];
              return {
                ...inn,
                assignments: next,
                kicking: inn.kicking.filter((k) => k.playerId !== id),
                fielding: inn.fielding.filter((f) => f.playerId !== id),
              };
            }),
          })),
        }));
      },

      // Games
      addGame(input: Omit<Game, "id" | "innings"> & { innings?: Game["innings"] }): Game {
        const game: Game = {
          id: uid(),
          innings: input.innings ?? [],
          ...input,
        };
        setState((s) => ({
          ...s,
          games: [...s.games, game],
          activeGameId: s.activeGameId ?? game.id,
        }));
        return game;
      },
      updateGame(id: string, patch: Partial<Game>) {
        setState((s) => ({
          ...s,
          games: s.games.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        }));
      },
      removeGame(id: string) {
        setState((s) => ({
          ...s,
          games: s.games.filter((g) => g.id !== id),
          activeGameId: s.activeGameId === id ? undefined : s.activeGameId,
        }));
      },
      setActiveGame(id: string | undefined) {
        setState((s) => ({ ...s, activeGameId: id }));
      },

      // Import / export
      exportJSON(): string {
        return JSON.stringify(state, null, 2);
      },
      importJSON(json: string): boolean {
        try {
          const parsed = JSON.parse(json) as AppState;
          if (parsed.version !== 1) return false;
          setStateRaw(parsed);
          return true;
        } catch {
          return false;
        }
      },
      reset() {
        setStateRaw(defaultState());
      },
    }),
    [setState, state],
  );

  return { state, actions, uid };
}

export { uid };
