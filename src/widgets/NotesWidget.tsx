import { StickyNote } from 'lucide-react';
import { useStore } from '../store';
import { WidgetEmpty } from './WidgetFrame';

export function NotesWidget({
  size,
  preview,
}: {
  size: 'S' | 'M' | 'L';
  preview?: boolean;
}) {
  const notes = useStore((s) => s.settings.homeNotes);
  const patchSettings = useStore((s) => s.patchSettings);
  const value = preview ? 'Lista zakupów\n• mleko\n• chleb' : notes;

  if (!preview && !notes.trim()) {
    return (
      <div className={`hw-notes hw-size-${size}`}>
        <WidgetEmpty icon={StickyNote} text="Puste notatki — kliknij i zacznij pisać." />
        <textarea
          className="hw-notes-area hw-notes-overlay"
          value={notes}
          onChange={(e) => patchSettings({ homeNotes: e.target.value })}
          placeholder=""
          spellCheck={false}
          aria-label="Notatki"
        />
      </div>
    );
  }

  return (
    <div className={`hw-notes hw-size-${size}`}>
      <textarea
        className="hw-notes-area"
        value={value}
        readOnly={preview}
        onChange={(e) => !preview && patchSettings({ homeNotes: e.target.value })}
        placeholder="Szybkie notatki…"
        spellCheck={false}
      />
    </div>
  );
}
