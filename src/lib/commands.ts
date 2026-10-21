import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  Download,
  EyeOff,
  History,
  KeyRound,
  LayoutTemplate,
  Minus,
  Palette,
  PanelLeft,
  Plus,
  Printer,
  Puzzle,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  ShieldOff,
  Sparkles,
  Star,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { t, type TParams } from '../i18n/core';
import {
  BOOKMARKS_URL,
  DOWNLOADS_URL,
  EXTENSIONS_URL,
  HISTORY_URL,
  HOME_URL,
  THEMES,
  useStore,
  type ThemeId,
} from '../store';

export type CommandContext = {
  tor: boolean;
  activeUrl?: string;
  closedCount: number;
  theme: ThemeId;
  searchEngine: string;
  privacyPreset: string;
  sidebarVisible: boolean;
};

export type CommandDef = {
  id: string;
  titleKey?: string;
  titleParams?: TParams;
  /** Fallback when titleKey is missing (palette help row only). */
  title?: string;
  keywords?: string[];
  shortcut?: string;
  icon: LucideIcon;
  group: 'command' | 'settings' | 'theme' | 'search';
  /** When false, hidden */
  when?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext & { openInNewTab?: boolean }) => void | Promise<void>;
};

type Host = {
  newTab: (url?: string) => void;
  openTorTab: () => void;
  closeActive: () => void;
  reopenClosed: () => void;
  pinActive: () => void;
  duplicateActive: () => void;
  muteActive: () => void;
  newIdentity: () => void;
  navigate: (url: string) => void;
  setSettingsTab: (t: string) => void;
  patchSettings: (p: Record<string, unknown>) => void;
  toggleSidebar: () => void;
  openTaskMgr: () => void;
  forgetSite: () => void;
  clearData: () => void;
  print: () => void;
  zoom: (delta: number) => void;
};

let host: Host | null = null;

export function bindCommandHost(h: Host) {
  host = h;
}

export function getCommandTitle(cmd: CommandDef): string {
  if (cmd.titleKey) return t(cmd.titleKey, cmd.titleParams);
  return cmd.title ?? cmd.id;
}

export function getCommands(): CommandDef[] {
  return [
    {
      id: 'new-tab',
      titleKey: 'commands.newTab',
      keywords: ['new', 'tab', 'nowa'],
      shortcut: 'Ctrl+T',
      icon: Plus,
      group: 'command',
      run: () => host?.newTab(),
    },
    {
      id: 'new-tor',
      titleKey: 'commands.newTor',
      keywords: ['tor', 'onion'],
      shortcut: 'Ctrl+Shift+N',
      icon: Sparkles,
      group: 'command',
      run: () => host?.openTorTab(),
    },
    {
      id: 'close-tab',
      titleKey: 'commands.closeTab',
      shortcut: 'Ctrl+W',
      icon: Minus,
      group: 'command',
      run: () => host?.closeActive(),
    },
    {
      id: 'reopen-tab',
      titleKey: 'commands.reopenTab',
      shortcut: 'Ctrl+Shift+T',
      icon: RefreshCw,
      group: 'command',
      when: (c) => !c.tor && c.closedCount > 0,
      run: () => host?.reopenClosed(),
    },
    {
      id: 'pin-tab',
      titleKey: 'commands.pinTab',
      icon: LayoutTemplate,
      group: 'command',
      when: (c) => !c.tor,
      run: () => host?.pinActive(),
    },
    {
      id: 'dup-tab',
      titleKey: 'commands.dupTab',
      icon: ClipboardList,
      group: 'command',
      when: (c) => !c.tor,
      run: () => host?.duplicateActive(),
    },
    {
      id: 'mute-tab',
      titleKey: 'commands.muteTab',
      keywords: ['mute', 'wycisz', 'audio'],
      icon: EyeOff,
      group: 'command',
      run: () => host?.muteActive(),
    },
    {
      id: 'new-identity',
      titleKey: 'commands.newIdentity',
      keywords: ['newnym', 'tożsamość', 'identity'],
      shortcut: 'Ctrl+Shift+U',
      icon: Sparkles,
      group: 'command',
      when: (c) => c.tor,
      run: () => host?.newIdentity(),
    },
    {
      id: 'downloads',
      titleKey: 'commands.downloads',
      shortcut: 'Ctrl+J',
      icon: Download,
      group: 'command',
      when: (c) => !c.tor,
      run: () => host?.navigate(DOWNLOADS_URL),
    },
    {
      id: 'history',
      titleKey: 'commands.history',
      shortcut: 'Ctrl+H',
      icon: History,
      group: 'command',
      when: (c) => !c.tor,
      run: () => host?.navigate(HISTORY_URL),
    },
    {
      id: 'bookmarks',
      titleKey: 'commands.bookmarks',
      shortcut: 'Ctrl+Shift+O',
      icon: Star,
      group: 'command',
      when: (c) => !c.tor,
      run: () => host?.navigate(BOOKMARKS_URL),
    },
    {
      id: 'extensions',
      titleKey: 'commands.extensions',
      icon: Puzzle,
      group: 'command',
      when: (c) => !c.tor,
      run: () => host?.navigate(EXTENSIONS_URL),
    },
    {
      id: 'task-mgr',
      titleKey: 'commands.taskMgr',
      shortcut: 'Shift+Esc',
      icon: EyeOff,
      group: 'command',
      run: () => host?.openTaskMgr(),
    },
    {
      id: 'passwords',
      titleKey: 'commands.passwords',
      icon: KeyRound,
      group: 'command',
      when: (c) => !c.tor,
      run: () => host?.setSettingsTab('passwords'),
    },
    {
      id: 'settings',
      titleKey: 'commands.settings',
      shortcut: 'Ctrl+,',
      icon: Settings2,
      group: 'settings',
      run: () => host?.setSettingsTab('general'),
    },
    {
      id: 'settings-privacy',
      titleKey: 'commands.settingsPrivacy',
      icon: Shield,
      group: 'settings',
      run: () => host?.setSettingsTab('privacy'),
    },
    {
      id: 'settings-search',
      titleKey: 'commands.settingsSearch',
      icon: Search,
      group: 'settings',
      run: () => host?.setSettingsTab('search'),
    },
    {
      id: 'toggle-sidebar',
      titleKey: 'commands.toggleSidebar',
      shortcut: 'Ctrl+B',
      icon: PanelLeft,
      group: 'command',
      run: () => host?.toggleSidebar(),
    },
    {
      id: 'zoom-in',
      titleKey: 'commands.zoomIn',
      icon: ZoomIn,
      group: 'command',
      run: () => host?.zoom(0.1),
    },
    {
      id: 'zoom-out',
      titleKey: 'commands.zoomOut',
      icon: ZoomOut,
      group: 'command',
      run: () => host?.zoom(-0.1),
    },
    {
      id: 'print',
      titleKey: 'commands.print',
      icon: Printer,
      group: 'command',
      run: () => host?.print(),
    },
    {
      id: 'privacy-strict',
      titleKey: 'commands.privacyStrict',
      icon: Shield,
      group: 'command',
      run: () => host?.patchSettings({ privacyPreset: 'strict' }),
    },
    {
      id: 'privacy-standard',
      titleKey: 'commands.privacyStandard',
      icon: Shield,
      group: 'command',
      run: () => host?.patchSettings({ privacyPreset: 'standard' }),
    },
    {
      id: 'forget-site',
      titleKey: 'commands.forgetSite',
      icon: Trash2,
      group: 'command',
      when: (c) => !c.tor && !!c.activeUrl && /^https?:/i.test(c.activeUrl),
      run: () => host?.forgetSite(),
    },
    {
      id: 'disable-shield',
      titleKey: 'commands.disableShield',
      icon: ShieldOff,
      group: 'command',
      when: (c) => !c.tor && !!c.activeUrl && /^https?:/i.test(c.activeUrl),
      run: (c) => {
        try {
          const hostName = new URL(c.activeUrl || '').hostname;
          host?.patchSettings({
            privacySiteExceptions: [
              ...((getStoreExceptions() as string[]) || []),
              hostName,
            ].filter((v, i, a) => a.indexOf(v) === i),
          });
          void window.shell?.privacyExceptionAdd?.(hostName);
        } catch {
          /* */
        }
      },
    },
    {
      id: 'clear-data',
      titleKey: 'commands.clearData',
      icon: Trash2,
      group: 'command',
      run: () => host?.clearData(),
    },
    {
      id: 'home',
      titleKey: 'commands.home',
      icon: LayoutTemplate,
      group: 'command',
      run: () => host?.navigate(HOME_URL),
    },
    ...Object.entries(THEMES).map(([id, theme]) => ({
      id: `theme-${id}`,
      titleKey: 'commands.theme',
      titleParams: { name: theme.label },
      keywords: ['theme', 'motyw', id],
      icon: Palette,
      group: 'theme' as const,
      run: () => host?.patchSettings({ theme: id }),
    })),
  ];
}

function getStoreExceptions(): string[] {
  try {
    return useStore.getState().settings.privacySiteExceptions || [];
  } catch {
    return [];
  }
}

/** Lightweight fuzzy score — higher is better; -1 = no match */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 - (t.length - q.length);
  if (t.includes(q)) return 500 - t.indexOf(q);
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    streak = found === ti ? streak + 1 : 1;
    score += 10 + streak * 4 - (found - ti);
    ti = found + 1;
  }
  return score;
}

export function fuzzyHighlight(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  let ti = 0;
  let buf = '';
  let hitBuf = '';
  const flush = () => {
    if (buf) parts.push({ text: buf, hit: false });
    if (hitBuf) parts.push({ text: hitBuf, hit: true });
    buf = '';
    hitBuf = '';
  };
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = text.toLowerCase().indexOf(ch, ti);
    if (found < 0) {
      flush();
      parts.push({ text: text.slice(ti), hit: false });
      return parts.length ? parts : [{ text, hit: false }];
    }
    buf += text.slice(ti, found);
    hitBuf += text[found];
    if (buf) {
      parts.push({ text: buf, hit: false });
      buf = '';
    }
    ti = found + 1;
  }
  if (hitBuf) parts.push({ text: hitBuf, hit: true });
  if (ti < text.length) parts.push({ text: text.slice(ti), hit: false });
  return parts;
}

const RECENT_KEY = 'djxxr-cmd-recent';

export function pushRecentCommand(id: string) {
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const next = [id, ...(Array.isArray(prev) ? prev.filter((x: string) => x !== id) : [])].slice(
      0,
      8,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
}

export function getRecentCommandIds(): string[] {
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(prev) ? prev.map(String) : [];
  } catch {
    return [];
  }
}
