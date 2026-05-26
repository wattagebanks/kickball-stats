import { useMemo, useState } from "react";
import type { Player, PositionId } from "../types";
import { POSITIONS } from "../types";

interface FieldProps {
  players: Player[];
  // playerId -> PositionId
  assignments: Record<string, PositionId>;
  onAssign: (playerId: string, position: PositionId | "BENCH") => void;
  onClear: () => void;
  onAuto?: () => void;
  readOnly?: boolean;
}

// SVG kickball / softball field. Diamond on bottom half, outfield arc above.
export function Field({
  players,
  assignments,
  onAssign,
  onClear,
  onAuto,
  readOnly = false,
}: FieldProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverSlot, setHoverSlot] = useState<PositionId | "BENCH" | null>(null);

  // Reverse map: position -> playerId
  const playerByPosition = useMemo(() => {
    const map: Partial<Record<PositionId, string>> = {};
    for (const [pid, pos] of Object.entries(assignments)) {
      map[pos] = pid;
    }
    return map;
  }, [assignments]);

  const playerById = useMemo(() => {
    const m: Record<string, Player> = {};
    for (const p of players) m[p.id] = p;
    return m;
  }, [players]);

  const bench = useMemo(
    () => players.filter((p) => !assignments[p.id]),
    [players, assignments],
  );

  function startDrag(e: React.DragEvent, playerId: string) {
    if (readOnly) return;
    setDragging(playerId);
    e.dataTransfer.setData("text/plain", playerId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onSlotDragOver(e: React.DragEvent, pos: PositionId | "BENCH") {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoverSlot(pos);
  }

  function onSlotDrop(e: React.DragEvent, pos: PositionId | "BENCH") {
    if (readOnly) return;
    e.preventDefault();
    const playerId = e.dataTransfer.getData("text/plain") || dragging;
    setHoverSlot(null);
    setDragging(null);
    if (!playerId) return;

    // If another player is currently in this position, swap them to the dragged player's previous slot.
    const previousAtTarget =
      pos !== "BENCH" ? playerByPosition[pos] : undefined;
    const previousForDragged = assignments[playerId];

    if (previousAtTarget && previousAtTarget !== playerId) {
      // Move displaced player to wherever the dragged player came from (could be bench).
      onAssign(previousAtTarget, previousForDragged ?? "BENCH");
    }
    onAssign(playerId, pos);
  }

  function quickAssign(pos: PositionId) {
    if (readOnly) return;
    // Click an empty slot to pop a simple prompt-style picker via window prompt is ugly.
    // Instead, we let users assign by drag/drop and via bench chip click.
    // This handler is wired to click any slot to clear it.
    const current = playerByPosition[pos];
    if (current) {
      onAssign(current, "BENCH");
    }
  }

  return (
    <div>
      <div className="field-wrap">
        <svg viewBox="0 0 1000 900" className="field" role="img" aria-label="Kickball field diagram">
          {/* Outfield grass */}
          <defs>
            <radialGradient id="grassGrad" cx="50%" cy="60%" r="80%">
              <stop offset="0%" stopColor="#3aa051" />
              <stop offset="60%" stopColor="#2d7d3f" />
              <stop offset="100%" stopColor="#1f5a2d" />
            </radialGradient>
            <linearGradient id="dirtGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#d39c64" />
              <stop offset="100%" stopColor="#a06a3a" />
            </linearGradient>
          </defs>

          {/* Outfield fence arc */}
          <path
            d="M 60 540 A 440 440 0 0 1 940 540 L 940 880 L 60 880 Z"
            fill="url(#grassGrad)"
            stroke="#0d2615"
            strokeWidth="2"
          />

          {/* Outfield warning track ring */}
          <path
            d="M 90 540 A 410 410 0 0 1 910 540"
            fill="none"
            stroke="#7c5a32"
            strokeWidth="14"
            opacity="0.55"
          />

          {/* Infield dirt */}
          <polygon
            points="500,300 760,560 500,820 240,560"
            fill="url(#dirtGrad)"
            stroke="#5a3a1d"
            strokeWidth="2"
          />

          {/* Infield grass square */}
          <polygon
            points="500,400 660,560 500,720 340,560"
            fill="#3a8a48"
            stroke="#1f5a2d"
            strokeWidth="2"
          />

          {/* Bases */}
          {/* Home */}
          <polygon
            points="500,760 514,774 514,790 486,790 486,774"
            fill="#ffffff"
            stroke="#222"
            strokeWidth="2"
          />
          {/* 1st */}
          <rect x="704" y="546" width="28" height="28" transform="rotate(45 718 560)" fill="#fff" stroke="#222" strokeWidth="2" />
          {/* 2nd */}
          <rect x="486" y="386" width="28" height="28" transform="rotate(45 500 400)" fill="#fff" stroke="#222" strokeWidth="2" />
          {/* 3rd */}
          <rect x="268" y="546" width="28" height="28" transform="rotate(45 282 560)" fill="#fff" stroke="#222" strokeWidth="2" />

          {/* Pitcher's mound */}
          <circle cx="500" cy="560" r="32" fill="#c89765" stroke="#7a5630" strokeWidth="2" />
          <line x1="478" y1="560" x2="522" y2="560" stroke="#fff" strokeWidth="3" />

          {/* Foul lines */}
          <line x1="500" y1="780" x2="120" y2="400" stroke="#fff" strokeWidth="3" opacity="0.85" />
          <line x1="500" y1="780" x2="880" y2="400" stroke="#fff" strokeWidth="3" opacity="0.85" />

          {/* Batter's box */}
          <rect x="448" y="744" width="40" height="60" fill="none" stroke="#fff" strokeWidth="2" opacity="0.6" />
          <rect x="512" y="744" width="40" height="60" fill="none" stroke="#fff" strokeWidth="2" opacity="0.6" />

          {/* Position slots */}
          {POSITIONS.map((pos) => {
            const playerId = playerByPosition[pos.id];
            const player = playerId ? playerById[playerId] : undefined;
            const filled = !!player;
            const isHover = hoverSlot === pos.id;
            return (
              <g
                key={pos.id}
                className={[
                  "field-slot",
                  filled ? "filled" : "empty",
                  isHover ? "dragover" : "",
                ].join(" ").trim()}
                transform={`translate(${pos.x}, ${pos.y})`}
                onDragOver={(e) => onSlotDragOver(e, pos.id)}
                onDragLeave={() => setHoverSlot(null)}
                onDrop={(e) => onSlotDrop(e, pos.id)}
                onClick={() => quickAssign(pos.id)}
              >
                <circle r="46" />
                {filled ? (
                  <>
                    <text className="name" dy="-4">
                      {truncate(player!.name, 12)}
                    </text>
                    <text className="label" dy="16">
                      {pos.id}
                    </text>
                  </>
                ) : (
                  <>
                    <text className="pos" dy="2">
                      {pos.id}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {!readOnly && (
        <div className="field-controls">
          <span className="tiny">Drag players from the bench onto the field. Click an assigned slot to send them back to the bench.</span>
          <div className="right" style={{ display: "flex", gap: 8 }}>
            {onAuto && (
              <button onClick={onAuto} title="Auto-fill empty positions">
                Auto-fill
              </button>
            )}
            <button className="ghost" onClick={onClear}>
              Clear field
            </button>
          </div>
        </div>
      )}

      <div className="section-title">Bench</div>
      <div
        className={["bench", hoverSlot === "BENCH" ? "dragover" : ""].join(" ").trim()}
        onDragOver={(e) => onSlotDragOver(e, "BENCH")}
        onDragLeave={() => setHoverSlot(null)}
        onDrop={(e) => onSlotDrop(e, "BENCH")}
      >
        {bench.length === 0 && (
          <span className="muted">All players are on the field.</span>
        )}
        {bench.map((p) => (
          <span
            key={p.id}
            className="chip"
            draggable={!readOnly}
            onDragStart={(e) => startDrag(e, p.id)}
            onDragEnd={() => {
              setDragging(null);
              setHoverSlot(null);
            }}
            title={readOnly ? p.name : "Drag onto a position"}
          >
            {p.number && <span className="num">#{p.number}</span>}
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
