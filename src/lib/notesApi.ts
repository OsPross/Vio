export type NoteRecord = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export function noteTitleFromBody(body: string): string {
  const first = body.split(/\r?\n/)[0]?.trim();
  if (first) return first.slice(0, 200);
  return 'Nowa notatka';
}

export async function notesList(q?: string): Promise<NoteRecord[]> {
  const shell = window.shell;
  if (!shell?.notesList) return [];
  const res = await shell.notesList(q ? { q } : {});
  if (!res?.ok || !Array.isArray(res.notes)) return [];
  return res.notes;
}

export async function notesCreate(body = ''): Promise<NoteRecord | null> {
  const shell = window.shell;
  if (!shell?.notesCreate) return null;
  const res = await shell.notesCreate({ body });
  if (!res?.ok || !res.note) return null;
  return res.note;
}

export async function notesUpdate(
  id: string,
  patch: { body?: string; title?: string },
): Promise<NoteRecord | null> {
  const shell = window.shell;
  if (!shell?.notesUpdate) return null;
  const res = await shell.notesUpdate(id, patch);
  if (!res?.ok || !res.note) return null;
  return res.note;
}

export async function notesDelete(id: string): Promise<boolean> {
  const shell = window.shell;
  if (!shell?.notesDelete) return false;
  const res = await shell.notesDelete(id);
  return Boolean(res?.ok);
}

export async function notesMigrateLegacy(
  text: string,
): Promise<{ migrated: boolean; notes: NoteRecord[] }> {
  const shell = window.shell;
  if (!shell?.notesMigrateLegacy) return { migrated: false, notes: [] };
  const res = await shell.notesMigrateLegacy(text);
  if (!res?.ok) return { migrated: false, notes: [] };
  return {
    migrated: Boolean(res.migrated),
    notes: Array.isArray(res.notes) ? res.notes : [],
  };
}
