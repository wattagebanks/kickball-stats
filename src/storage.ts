import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, Game, Player, Team } from "./types";

// localStorage acts as an offline cache + migration source. The source of
// truth in production is the D1-backed /api/state endpoint; the cache lets
// the UI render instantly on cold load and survive transient network blips.
const CACHE_KEY = "kickball-stats:v1";
const PASSWORD_KEY = "kickball-stats:write-password";
// How long to wait after the last edit before pushing the snapshot to D1.
const SAVE_DEBOUNCE_MS = 600;

export type SyncStatus =
  // First read from D1 hasn't finished yet (showing cached or default state).
  | "loading"
  // Up to date with the server, no pending writes.
  | "idle"
  // Mid-flight PUT to /api/state.
  | "saving"
  // No write password set locally; we render edits but never PUT them.
  | "readonly"
  // Last server interaction failed (network or 5xx). Will retry on next edit.
  | "error"
  // The current environment has no /api/state endpoint (e.g. `npm run dev`
  // against the Vite server with no Pages Function), so we fall back to
  // local-only mode without bothering the user with errors.
  | "local-only";

export interface SyncState {
  status: SyncStatus;
  /** ISO timestamp of the last successful read or write, if any. */
  lastSyncedAt: string | null;
  /** Last error message from the API, cleared on the next success. */
  error: string | null;
  /** True iff a write password is configured in this browser. */
  hasWritePassword: boolean;
}

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

function loadCache(): AppState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(state: AppState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // Quota errors etc. are not worth surfacing — the next save will retry
    // and the server copy is the source of truth anyway.
  }
}

function loadStoredPassword(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(PASSWORD_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistPassword(value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(PASSWORD_KEY, value);
    } else {
      window.localStorage.removeItem(PASSWORD_KEY);
    }
  } catch {
    // Same as writeCache — best effort.
  }
}

interface FetchedState {
  state: AppState | null;
  updatedAt: string | null;
}

// Shape of state changes that should trigger a debounced server save.
// Local-only metadata changes (like the currently selected game on this
// device) could be excluded here in the future without changing the API.
function statesEqual(a: AppState, b: AppState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function fetchStateFromServer(): Promise<FetchedState | "unavailable"> {
  try {
    const res = await fetch("/api/state", {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404) return "unavailable";
    if (!res.ok) {
      throw new Error(`GET /api/state -> ${res.status}`);
    }
    const body = (await res.json()) as FetchedState;
    return body;
  } catch (err) {
    // A bare network error in `npm run dev` (Vite-only) hits this branch —
    // we surface it as "unavailable" so the UI doesn't shout at the user.
    if (err instanceof TypeError) return "unavailable";
    throw err;
  }
}

async function putStateToServer(
  state: AppState,
  password: string,
): Promise<{ updatedAt: string }> {
  const res = await fetch("/api/state", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-write-password": password,
    },
    body: JSON.stringify(state),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `PUT /api/state -> ${res.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  const body = (await res.json()) as { updatedAt?: string };
  return { updatedAt: body.updatedAt ?? new Date().toISOString() };
}

export function useAppState() {
  // Render immediately with cached state (or defaults) so the UI is never
  // blank while we wait for the network round-trip.
  const [state, setStateRaw] = useState<AppState>(
    () => loadCache() ?? defaultState(),
  );
  // Keep the password in React state so the save effect re-runs when the
  // user pastes one in — that way newly-typed credentials immediately flush
  // any unsaved local edits to D1.
  const [password, setPassword] = useState<string>(() => loadStoredPassword());
  const [sync, setSync] = useState<SyncState>(() => ({
    status: "loading",
    lastSyncedAt: null,
    error: null,
    hasWritePassword: loadStoredPassword().length > 0,
  }));

  // Snapshot of the last state we know the server has, used to skip saves
  // that would be no-ops (e.g. re-renders that didn't actually mutate data).
  const lastSavedRef = useRef<AppState | null>(null);
  // Set to true once the initial GET resolves, so we don't fire a "save" PUT
  // during the very first render before we even know what the server has.
  const initializedRef = useRef(false);
  // Tracks whether the environment has the /api/state endpoint at all.
  const localOnlyRef = useRef(false);

  // Initial load: pull the canonical state from D1. If the DB row is empty
  // and we have a local cache, migrate the cache up to D1.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchStateFromServer().catch(
        (err: unknown) => err as Error,
      );
      if (cancelled) return;

      if (result === "unavailable") {
        localOnlyRef.current = true;
        initializedRef.current = true;
        lastSavedRef.current = state;
        setSync((s) => ({
          ...s,
          status: "local-only",
          error: null,
        }));
        return;
      }

      if (result instanceof Error) {
        // Real network/server error talking to a deployed endpoint.
        initializedRef.current = true;
        lastSavedRef.current = state;
        setSync((s) => ({
          ...s,
          status: "error",
          error: result.message,
        }));
        return;
      }

      const { state: serverState, updatedAt } = result;
      const cached = loadCache();

      if (serverState) {
        // Server has data: server wins. Update local cache + render.
        const validated = ensureValid(serverState);
        setStateRaw(validated);
        writeCache(validated);
        lastSavedRef.current = validated;
        initializedRef.current = true;
        setSync({
          status: "idle",
          lastSyncedAt: updatedAt,
          error: null,
          hasWritePassword: password.length > 0,
        });
        return;
      }

      // Server is empty. If we have a non-empty cache, try to migrate it up.
      const migrationCandidate = cached ?? null;
      const hasMeaningfulCache =
        migrationCandidate !== null &&
        (migrationCandidate.team.players.length > 0 ||
          migrationCandidate.games.length > 0);

      if (hasMeaningfulCache && password) {
        try {
          const { updatedAt: savedAt } = await putStateToServer(
            migrationCandidate,
            password,
          );
          if (cancelled) return;
          lastSavedRef.current = migrationCandidate;
          initializedRef.current = true;
          setStateRaw(migrationCandidate);
          writeCache(migrationCandidate);
          setSync({
            status: "idle",
            lastSyncedAt: savedAt,
            error: null,
            hasWritePassword: true,
          });
          return;
        } catch (err) {
          if (cancelled) return;
          // Fall through: render the cache locally and surface the error.
          initializedRef.current = true;
          lastSavedRef.current = null;
          setSync({
            status: "error",
            lastSyncedAt: null,
            error: err instanceof Error ? err.message : String(err),
            hasWritePassword: true,
          });
          return;
        }
      }

      // Server is empty and we have nothing worth migrating (or no password
      // to push with). Just mark us as ready; future edits will save normally
      // once a password is configured.
      initializedRef.current = true;
      lastSavedRef.current = serverState;
      setSync({
        status: password ? "idle" : "readonly",
        lastSyncedAt: updatedAt,
        error: null,
        hasWritePassword: password.length > 0,
      });
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally only run this once on mount. `state` is read for the
    // initial lastSavedRef snapshot but we don't want to re-fetch on every
    // change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist locally on every state change so refreshes never lose work, even
  // if the server save fails or hasn't fired yet.
  useEffect(() => {
    writeCache(state);
  }, [state]);

  // Debounced server save. Re-armed on every state OR password change; only
  // fires after SAVE_DEBOUNCE_MS of inactivity AND only once the initial
  // load is done. Status transitions tied to the password being set or
  // cleared live in setWritePassword itself, so this effect is purely about
  // pushing pending writes to D1.
  useEffect(() => {
    if (!initializedRef.current) return;
    if (localOnlyRef.current) return;
    if (!password) return;
    if (lastSavedRef.current && statesEqual(lastSavedRef.current, state)) {
      return;
    }

    const snapshot = state;
    const handle = window.setTimeout(async () => {
      setSync((s) => ({ ...s, status: "saving", error: null }));
      try {
        const { updatedAt } = await putStateToServer(snapshot, password);
        lastSavedRef.current = snapshot;
        setSync({
          status: "idle",
          lastSyncedAt: updatedAt,
          error: null,
          hasWritePassword: true,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // 401 means the saved password is wrong — drop into readonly so the
        // user gets steered to the password field instead of a hard error.
        const isAuth = /->\s*401/.test(message);
        setSync((s) => ({
          ...s,
          status: isAuth ? "readonly" : "error",
          error: message,
        }));
      }
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [state, password]);

  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    setStateRaw((prev) => updater(prev));
  }, []);

  const setWritePassword = useCallback((value: string) => {
    const trimmed = value.trim();
    setPassword(trimmed);
    persistPassword(trimmed);
    setSync((s) => ({
      ...s,
      hasWritePassword: trimmed.length > 0,
      // Clear stale errors so a fresh attempt isn't blocked by them.
      error: null,
      status:
        s.status === "local-only"
          ? "local-only"
          : trimmed
            ? s.status === "readonly"
              ? "idle"
              : s.status
            : "readonly",
    }));
  }, []);

  // Force a fresh save right now, ignoring the debounce. Used when the user
  // hits a manual "Sync now" button or after typing in a password.
  const forceSync = useCallback(async () => {
    if (localOnlyRef.current) return;
    if (!password) {
      setSync((s) => ({ ...s, status: "readonly", error: null }));
      return;
    }
    setSync((s) => ({ ...s, status: "saving", error: null }));
    try {
      const { updatedAt } = await putStateToServer(state, password);
      lastSavedRef.current = state;
      setSync({
        status: "idle",
        lastSyncedAt: updatedAt,
        error: null,
        hasWritePassword: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAuth = /->\s*401/.test(message);
      setSync((s) => ({
        ...s,
        status: isAuth ? "readonly" : "error",
        error: message,
      }));
    }
  }, [state, password]);

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
          setStateRaw(ensureValid(parsed));
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

  return {
    state,
    actions,
    uid,
    sync,
    setWritePassword,
    forceSync,
  };
}

// Light defensive shaping when reading from an untrusted source (D1 row or
// imported file). The full schema is enforced by TypeScript at use sites;
// this just protects against missing top-level fields.
function ensureValid(parsed: AppState): AppState {
  return {
    version: 1,
    team: parsed.team ?? { name: "My Kickball Team", season: "", players: [] },
    games: Array.isArray(parsed.games) ? parsed.games : [],
    activeGameId: parsed.activeGameId,
  };
}

export { uid };
