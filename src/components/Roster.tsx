import { useState } from "react";
import type { Player } from "../types";

interface RosterProps {
  players: Player[];
  onAdd: (p: Omit<Player, "id">) => void;
  onUpdate: (id: string, patch: Partial<Player>) => void;
  onRemove: (id: string) => void;
}

export function Roster({ players, onAdd, onUpdate, onRemove }: RosterProps) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({ name: trimmed, number: number.trim() || undefined });
    setName("");
    setNumber("");
  }

  return (
    <div className="card">
      <h2>Roster</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          placeholder="Add player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          style={{ flex: 1, minWidth: 200 }}
        />
        <input
          placeholder="#"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          style={{ width: 80 }}
        />
        <button className="primary" onClick={add}>
          Add player
        </button>
      </div>

      {players.length === 0 ? (
        <div className="empty">
          Add players to start building your lineup.
        </div>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Name</th>
                <th>Notes</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input
                      value={p.number ?? ""}
                      onChange={(e) =>
                        onUpdate(p.id, { number: e.target.value || undefined })
                      }
                      placeholder="—"
                      style={{ width: 60 }}
                    />
                  </td>
                  <td>
                    <input
                      value={p.name}
                      onChange={(e) => onUpdate(p.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={p.notes ?? ""}
                      onChange={(e) =>
                        onUpdate(p.id, { notes: e.target.value || undefined })
                      }
                      placeholder="—"
                    />
                  </td>
                  <td>
                    <button
                      className="danger ghost"
                      onClick={() => {
                        if (
                          confirm(
                            `Remove ${p.name}? They will be removed from all games.`,
                          )
                        ) {
                          onRemove(p.id);
                        }
                      }}
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
  );
}
