import type { Scene } from "../lib/scene";
import { CloseIcon, PlusIcon } from "./Icons";

export interface Pending {
  id: string;
  name: string;
}

interface Props {
  scenes: Scene[];
  pending: Pending[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

export function Filmstrip({ scenes, pending, activeId, onSelect, onRemove, onAdd }: Props) {
  return (
    <nav className="strip" aria-label="Images">
      <ol className="strip__list">
        {scenes.map((s, i) => {
          const active = s.id === activeId;
          return (
            <li key={s.id} className="strip__item" data-active={active || undefined}>
              <button
                type="button"
                className="strip__thumb"
                onClick={() => onSelect(s.id)}
                aria-current={active ? "true" : undefined}
                title={`${s.name}${i < 9 ? ` (${i + 1})` : ""}`}
              >
                <img src={s.thumb} alt={s.name} draggable={false} />
              </button>
              <button
                type="button"
                className="strip__remove"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.name}`}
                title="Remove"
              >
                <CloseIcon width={11} height={11} />
              </button>
            </li>
          );
        })}
        {pending.map((p) => (
          <li key={p.id} className="strip__item strip__item--pending" aria-label={`Loading ${p.name}`}>
            <div className="strip__thumb">
              <span className="strip__loading" />
            </div>
          </li>
        ))}
        <li className="strip__item">
          <button type="button" className="strip__add" onClick={onAdd} title="Add images" aria-label="Add images">
            <PlusIcon width={16} height={16} />
          </button>
        </li>
      </ol>
    </nav>
  );
}
