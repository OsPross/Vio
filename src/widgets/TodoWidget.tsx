import { useState } from 'react';
import { CheckSquare, Plus, Trash2 } from 'lucide-react';
import { useStore, type HomeTodoItem } from '../store';
import { WidgetEmpty } from './WidgetFrame';

const uid = () => Math.random().toString(36).slice(2, 10);

const DEMO: HomeTodoItem[] = [
  { id: 'd1', text: 'Odpisać na maila', done: false },
  { id: 'd2', text: 'Zakupy', done: true },
];

export function TodoWidget({ size, preview }: { size: 'S' | 'M' | 'L'; preview?: boolean }) {
  const todos = useStore((s) => s.settings.homeTodos ?? []);
  const patchSettings = useStore((s) => s.patchSettings);
  const [draft, setDraft] = useState('');
  const list = preview ? DEMO : todos;
  const setTodos = (next: HomeTodoItem[]) => patchSettings({ homeTodos: next });
  const limit = size === 'S' ? 4 : size === 'M' ? 7 : 12;

  const add = () => {
    if (preview) return;
    const text = draft.trim();
    if (!text) return;
    setTodos([{ id: uid(), text, done: false }, ...todos]);
    setDraft('');
  };

  return (
    <div className={`hw-todo hw-size-${size}`}>
      {!preview && (
        <form
          className="hw-todo-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className="hw-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nowe zadanie…"
            spellCheck={false}
          />
          <button type="submit" className="hw-icon-btn" title="Dodaj" disabled={!draft.trim()}>
            <Plus size={14} />
          </button>
        </form>
      )}
      {list.length === 0 ? (
        <WidgetEmpty icon={CheckSquare} text="Brak zadań — dodaj pierwsze powyżej." />
      ) : (
        <ul className="hw-todo-list">
          {list.slice(0, limit).map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <button
                type="button"
                className={`hw-todo-check ${t.done ? 'on' : ''}`}
                disabled={preview}
                onClick={() =>
                  !preview && setTodos(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
                }
                aria-label={t.done ? 'Odznacz' : 'Zaznacz'}
              />
              <span>{t.text}</span>
              {!preview && (
                <button
                  type="button"
                  className="hw-icon-btn"
                  onClick={() => setTodos(todos.filter((x) => x.id !== t.id))}
                  title="Usuń"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
