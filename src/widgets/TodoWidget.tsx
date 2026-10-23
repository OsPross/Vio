import { useMemo, useState } from 'react';
import { CheckSquare } from 'lucide-react';
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
      {list.length === 0 && preview === false ? (
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
              <span
                onDoubleClick={() => {
                  if (preview) return;
                  setTodos(todos.filter((x) => x.id !== item.id));
                }}
              >
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!preview && (
        <form
          className="hw-todo-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className="hw-todo-inline"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('widgets.ui.todo.placeholder')}
            spellCheck={false}
          />
        </form>
      )}
    </div>
  );
}
