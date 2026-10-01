import { Suspense, type Dispatch, type SetStateAction } from 'react';
import { normalizeInput, useStore } from '../../store';
import { CommandPalette, TaskManagerOverlay } from './lazy';

export type ShellOverlaysProps = {
  taskMgrOpen: boolean;
  setTaskMgrOpen: Dispatch<SetStateAction<boolean>>;
  paletteOpen: boolean;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setDraft: Dispatch<SetStateAction<string>>;
  go: (raw: string, opts?: { typed?: boolean; fromSuggest?: boolean }) => void;
};

export function ShellOverlays({
  taskMgrOpen,
  setTaskMgrOpen,
  paletteOpen,
  setPaletteOpen,
  setDraft,
  go,
}: ShellOverlaysProps) {
  const newTab = useStore((s) => s.newTab);
  const setActive = useStore((s) => s.setActive);
  const setView = useStore((s) => s.setView);
  const settings = useStore((s) => s.settings);
  const bangs = useStore((s) => s.bangs);

  return (
    <>
      <Suspense fallback={null}>
        <TaskManagerOverlay open={taskMgrOpen} onClose={() => setTaskMgrOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(url, opts) => {
            if (opts?.newTab) newTab(normalizeInput(url, settings, bangs));
            else go(url);
          }}
          onSwitchTab={(id) => {
            setActive(id);
            setView('browser');
          }}
          onRunBang={(fill) => {
            setDraft(fill);
            document.getElementById('omnibox-input')?.focus();
          }}
        />
      </Suspense>
    </>
  );
}
