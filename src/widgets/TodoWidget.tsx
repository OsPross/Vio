import { useMemo, useState } from 'react';
import { CheckSquare, Plus, Trash2 } from 'lucide-react';
import { useStore, type HomeTodoItem } from '../store';
import { useT } from '../i18n';
import { WidgetEmpty } from './WidgetFrame';

const uid = () => Math.random().toString(36).slice(2, 10);

export function TodoWidget({ size, preview }: { size: 'S' | 'M' | 'L'; preview?: boolean }) {
  const t = useT();
  const todos = useStore((s) => s.settings.homeTodos ?? []);
  const patchSettings = useStore((s) => s.patchSettings);
  const [draft, setDraft] = useState('');
  const demo = useMemo(
    (): HomeTodoItem[] => [
      { id: 'd1', text: t('widgets.ui.todo.demo1'), done: false },
      { id: 'd2', text: t('widgets.ui.todo.demo2'), done: true },
    ],
    [t],
  );
  const list = preview ? demo : todos;
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
            placeholder={t('widgets.ui.todo.placeholder')}
            spellCheck={false}
          />
          <button
            type="submit"
            className="hw-icon-btn"
            title={t('common.add')}
            disabled={!draft.trim()}
          >
            <Plus size={14} />
          </button>
        </form>
      )}
      {list.length === 0 ? (
        <WidgetEmpty icon={CheckSquare} text={t('widgets.ui.todo.empty')} />
      ) : (
        <ul className="hw-todo-list">
          {list.slice(0, limit).map((item) => (
            <li key={item.id} className={item.done ? 'done' : ''}>
              <button
                type="button"
                className={`hw-todo-check ${item.done ? 'on' : ''}`}
                disabled={preview}
                onClick={() =>
                  !preview &&
                  setTodos(todos.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)))
                }
                aria-label={item.done ? t('widgets.ui.todo.uncheck') : t('widgets.ui.todo.check')}
              />
              <span>{item.text}</span>
              {!preview && (
                <button
                  type="button"
                  className="hw-icon-btn"
                  onClick={() => setTodos(todos.filter((x) => x.id !== item.id))}
                  title={t('common.remove')}
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
