import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppState, Game, Player, Team } from "./types";

// localStorage acts as an offline cache + migration source. The source of
// truth in production is the D1-backed /api/state endpoint; the cache lets
// the UI render instantly on cold load and survive transient network blips.
const CACHE_KEY = "kickball-stats:v1";
// How long to wait after the last edit before pushing the snapshot to D1.
const SAVE_DEBOUNCE_MS = 600;

export type SyncStatus =
  // First read from D1 hasn't finished yet (showing cached or default state).
  | "loading"
  // Up to date with the server, no pending writes.
  | "idle"
  // Mid-flight PUT to /api/state.
  | "saving"
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

interface FetchedState {
  state: AppState | null;
  updatedAt: string | null;
}

function statesEqual(a: AppState, b: AppState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Any 401 from the API means our session cookie is missing or expired.
// Bounce the user to the login page (preserving where they were) so they
// can re-enter the team password and resume.
function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const from = encodeURIComponent(
    window.location.pathname + window.location.search,
  );
  window.location.assign(`/login?from=${from}`);
}

async function fetchStateFromServer(): Promise<FetchedState | "unavailable"> {
  try {
    const res = await fetch("/api/state", {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
    });
    if (res.status === 401) {
      redirectToLogin();
      // Pretend we're unavailable so the UI doesn't flash a spinner forever
      // while the location swap is in flight.
      return "unavailable";
    }
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
): Promise<{ updatedAt: string }> {
  const res = await fetch("/api/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(state),
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Session expired. Redirecting to sign in…");
  }
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
  const [sync, setSync] = useState<SyncState>(() => ({
    status: "loading",
    lastSyncedAt: null,
    error: null,
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
        setSync({
          status: "local-only",
          lastSyncedAt: null,
          error: null,
        });
        return;
      }

      if (result instanceof Error) {
        // Real network/server error talking to a deployed endpoint.
        initializedRef.current = true;
        lastSavedRef.current = state;
        setSync({
          status: "error",
          lastSyncedAt: null,
          error: result.message,
        });
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
        });
        return;
      }

      // Server is empty. If we have a non-empty cache, migrate it up. We're
      // already authenticated (middleware would have bounced us otherwise),
      // so this PUT should always succeed.
      const hasMeaningfulCache =
        cached !== null &&
        (cached.team.players.length > 0 || cached.games.length > 0);

      if (hasMeaningfulCache) {
        try {
          const { updatedAt: savedAt } = await putStateToServer(cached);
          if (cancelled) return;
          lastSavedRef.current = cached;
          initializedRef.current = true;
          setStateRaw(cached);
          writeCache(cached);
          setSync({
            status: "idle",
            lastSyncedAt: savedAt,
            error: null,
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
          });
          return;
        }
      }

      // Server is empty and we have nothing worth migrating. Just mark us
      // as ready; future edits will save normally.
      initializedRef.current = true;
      lastSavedRef.current = serverState;
      setSync({
        status: "idle",
        lastSyncedAt: updatedAt,
        error: null,
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

  // Debounced server save. Fires after SAVE_DEBOUNCE_MS of inactivity once
  // the initial load is done and we're online with /api/state.
  useEffect(() => {
    if (!initializedRef.current) return;
    if (localOnlyRef.current) return;
    if (lastSavedRef.current && statesEqual(lastSavedRef.current, state)) {
      return;
    }

    const snapshot = state;
    const handle = window.setTimeout(async () => {
      setSync((s) => ({ ...s, status: "saving", error: null }));
      try {
        const { updatedAt } = await putStateToServer(snapshot);
        lastSavedRef.current = snapshot;
        setSync({
          status: "idle",
          lastSyncedAt: updatedAt,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSync((s) => ({ ...s, status: "error", error: message }));
      }
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [state]);

  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    setStateRaw((prev) => updater(prev));
  }, []);

  // Force a fresh save right now, ignoring the debounce. Used by the
  // "Sync now" button on the Data tab.
  const forceSync = useCallback(async () => {
    if (localOnlyRef.current) return;
    setSync((s) => ({ ...s, status: "saving", error: null }));
    try {
      const { updatedAt } = await putStateToServer(state);
      lastSavedRef.current = state;
      setSync({
        status: "idle",
        lastSyncedAt: updatedAt,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSync((s) => ({ ...s, status: "error", error: message }));
    }
  }, [state]);

  // Sign-out clears the session cookie server-side and bounces to /login.
  const signOut = useCallback(async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Even if the request fails (e.g. offline), still send the user to
      // the login page so they can re-authenticate when connectivity is back.
    }
    redirectToLogin();
  }, []);

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
    forceSync,
    signOut,
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
