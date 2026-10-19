import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HomeChromeId, HomeClockStyle, HomeWidgetSize, HomeWidgetStyle } from '../store';
import { Switch } from '../components/ui/Switch';
import { useT } from '../i18n';

export type SettingsTarget =
  | {
      kind: 'widget';
      id: string;
      type: string;
      size: HomeWidgetSize;
      style?: HomeWidgetStyle;
    }
  | { kind: 'chrome'; id: HomeChromeId };

const POP_W = 248;
const POP_H = 280;
const PAD = 8;

/** Flip / shift so popover stays in viewport and prefers not covering the widget. */
export function placeFloatingPopover(
  anchor: DOMRect,
  popW = POP_W,
  popH = POP_H,
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const PAD = 8;

  const candidates: { left: number; top: number }[] = [
    { left: anchor.right + PAD, top: anchor.top }, // right of widget
    { left: anchor.left - popW - PAD, top: anchor.top }, // left of widget
    { left: anchor.left, top: anchor.bottom + PAD }, // below
    { left: anchor.left, top: anchor.top - popH - PAD }, // above
    { left: anchor.right + PAD, top: anchor.bottom - popH }, // right-bottom
    { left: anchor.left - popW - PAD, top: anchor.bottom - popH }, // left-bottom
  ];

  const overlaps = (left: number, top: number) =>
    left < anchor.right - 4 &&
    left + popW > anchor.left + 4 &&
    top < anchor.bottom - 4 &&
    top + popH > anchor.top + 4;

  const inView = (left: number, top: number) =>
    left >= PAD && top >= PAD && left + popW <= vw - PAD && top + popH <= vh - PAD;

  for (const c of candidates) {
    let { left, top } = c;
    left = Math.min(Math.max(PAD, left), Math.max(PAD, vw - popW - PAD));
    top = Math.min(Math.max(PAD, top), Math.max(PAD, vh - popH - PAD));
    if (!overlaps(left, top) && inView(left, top)) return { left, top };
  }

  // Fallback: clamp beside, even if partial overlap is inevitable on tiny screens
  let left = anchor.right + PAD;
  if (left + popW > vw - PAD) left = Math.max(PAD, anchor.left - popW - PAD);
  let top = Math.min(Math.max(PAD, anchor.top), vh - popH - PAD);
  return { left, top };
}

export function WidgetSettingsPopover({
  open,
  anchorRect,
  target,
  globalWidgetStyle,
  clockStyle,
  showSeconds,
  showDate,
  showClock,
  showApps,
  onClose,
  onWidgetSize,
  onWidgetStyle,
  onRemoveWidget,
  onClockStyle,
  onToggleSeconds,
  onToggleDate,
  onToggleClock,
  onToggleApps,
}: {
  open: boolean;
  anchorRect: DOMRect | null;
  target: SettingsTarget | null;
  globalWidgetStyle: HomeWidgetStyle;
  clockStyle: HomeClockStyle;
  showSeconds: boolean;
  showDate: boolean;
  showClock: boolean;
  showApps: boolean;
  onClose: () => void;
  onWidgetSize?: (size: HomeWidgetSize) => void;
  /** null = inherit global */
  onWidgetStyle?: (style: HomeWidgetStyle | null) => void;
  onRemoveWidget?: () => void;
  onClockStyle?: (style: HomeClockStyle) => void;
  onToggleSeconds?: (v: boolean) => void;
  onToggleDate?: (v: boolean) => void;
  onToggleClock?: (v: boolean) => void;
  onToggleApps?: (v: boolean) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRect) return;
    const r = ref.current?.getBoundingClientRect();
    setPos(placeFloatingPopover(anchorRect, r?.width || POP_W, r?.height || POP_H));
  }, [open, anchorRect, target]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !target || !anchorRect) return null;

  const title =
    target.kind === 'chrome'
      ? target.id === 'clock'
        ? t('widgets.clock')
        : target.id === 'search'
          ? t('widgets.ui.searchBox')
          : t('widgets.shortcuts')
      : t('widgets.ui.widget');

  const widgetStyleChoice =
    target.kind === 'widget' ? (target.style === undefined ? 'inherit' : target.style) : 'inherit';

  const node = (
    <div
      ref={ref}
      className="hw-settings-pop"
      style={{ left: pos.left, top: pos.top }}
      role="dialog"
      aria-label={t('widgets.ui.settingsAria', { title })}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="hw-settings-pop-head">
        <strong>{title}</strong>
        <button
          type="button"
          className="hw-icon-btn"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          ×
        </button>
      </header>

      {target.kind === 'widget' && (
        <>
          <label className="hw-settings-row">
            <span>{t('widgets.ui.size')}</span>
            <div className="hw-size-seg">
              {(['S', 'M', 'L'] as HomeWidgetSize[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={target.size === s ? 'on' : ''}
                  onClick={() => onWidgetSize?.(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </label>
          <label className="hw-settings-row">
            <span>{t('widgets.ui.cardStyle')}</span>
            <div className="hw-size-seg hw-style-seg">
              <button
                type="button"
                className={widgetStyleChoice === 'inherit' ? 'on' : ''}
                title={t('widgets.ui.likeGlobal', { style: globalWidgetStyle })}
                onClick={() => onWidgetStyle?.(null)}
              >
                {t('widgets.ui.global')}
              </button>
              {(
                [
                  ['transparent', t('widgets.ui.styleTransparentShort')],
                  ['glass', t('widgets.ui.styleGlass')],
                  ['solid', t('widgets.ui.styleSolid')],
                ] as [HomeWidgetStyle, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={widgetStyleChoice === id ? 'on' : ''}
                  onClick={() => onWidgetStyle?.(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </label>
          {onRemoveWidget && (
            <button type="button" className="hw-settings-danger" onClick={onRemoveWidget}>
              {t('widgets.ui.removeWidget')}
            </button>
          )}
        </>
      )}

      {target.kind === 'chrome' && target.id === 'clock' && (
        <>
          <label className="hw-settings-row">
            <span>{t('widgets.ui.style')}</span>
            <div className="hw-size-seg hw-style-seg">
              {(
                [
                  ['thin', t('home.personalize.clockThin')],
                  ['classic', t('home.personalize.clockClassic')],
                  ['mono', t('home.personalize.clockMono')],
                ] as [HomeClockStyle, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={clockStyle === id ? 'on' : ''}
                  onClick={() => onClockStyle?.(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </label>
          <label className="hw-settings-check">
            <Switch
              on={showClock}
              onChange={(v) => onToggleClock?.(v)}
              aria-label={t('widgets.ui.showClock')}
            />
            {t('widgets.ui.showClock')}
          </label>
          <label className="hw-settings-check">
            <Switch
              on={showDate}
              onChange={(v) => onToggleDate?.(v)}
              aria-label={t('widgets.ui.showDate')}
            />
            {t('widgets.ui.showDate')}
          </label>
          <label className="hw-settings-check">
            <Switch
              on={showSeconds}
              onChange={(v) => onToggleSeconds?.(v)}
              aria-label={t('home.personalize.seconds')}
            />
            {t('home.personalize.seconds')}
          </label>
        </>
      )}

      {target.kind === 'chrome' && target.id === 'search' && (
        <p className="hw-settings-hint">{t('widgets.ui.searchChromeHint')}</p>
      )}

      {target.kind === 'chrome' && target.id === 'shortcuts' && (
        <label className="hw-settings-check">
          <Switch
            on={showApps}
            onChange={(v) => onToggleApps?.(v)}
            aria-label={t('widgets.ui.showShortcuts')}
          />
          {t('widgets.ui.showShortcuts')}
        </label>
      )}
    </div>
  );

  return createPortal(node, document.body);
}
