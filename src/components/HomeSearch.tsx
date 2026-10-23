import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { LayoutGrid, Plus } from 'lucide-react';
import { migrateHomeWidgets, normalizeHomeWidgets, useStore, type HomeWidget } from '../store';
import { homeBgCssUrl } from '../lib/homeBg';
import { WidgetStrip } from '../widgets/WidgetStrip';
import { AddWidgetGallery } from '../widgets/AddWidgetGallery';
import { PersonalizeSheet } from './personalize/PersonalizeSheet';
import { useT } from '../i18n';

export function HomeSearch({ onGo }: { onGo: (url: string, query?: string) => void }) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);

  const [customize, setCustomize] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const reduced =
    settings.perfReduceMotion ||
    !settings.uiMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const drift = settings.bgStyle === 'soft' && !reduced && !settings.perfLowPowerClock;

  const widgets = useMemo(() => {
    if (Array.isArray(settings.homeWidgets) && settings.homeWidgets.length > 0) {
      return normalizeHomeWidgets(settings.homeWidgets);
    }
    return migrateHomeWidgets(settings);
  }, [settings]);

  const setWidgets = (next: HomeWidget[]) => {
    patchSettings({ homeWidgets: normalizeHomeWidgets(next) });
  };

  useEffect(() => {
    if (!customize && !editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCustomize(false);
        setEditMode(false);
        setGalleryOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [customize, editMode]);

  /* Drift wash on `.app` so the icon rail shares the NTP plane */
  useEffect(() => {
    const app = document.querySelector('.app');
    if (!app) return;
    app.classList.toggle('home-drift', drift);
    return () => app.classList.remove('home-drift');
  }, [drift]);

  const bgFile = homeBgCssUrl(settings.homeBgImage);
  const bgVars: CSSProperties =
    settings.bgStyle === 'custom' && bgFile
      ? ({
          ['--home-bg-image' as string]: `url("${bgFile}")`,
          ['--home-bg-blur' as string]: `${settings.homeBgBlur}px`,
          ['--home-bg-dim' as string]: `${settings.homeBgDim}%`,
        } as CSSProperties)
      : {};

  return (
    <div
      className={[
        'home',
        'home-ios',
        'home-widgets-root',
        `home-bg-${settings.bgStyle === 'custom' && !bgFile ? 'soft' : settings.bgStyle}`,
        `home-layout-${settings.homeLayout}`,
        drift ? 'home-drift' : '',
        `home-align-${settings.homeAlign}`,
        `home-density-${settings.homeDensity}`,
        settings.uiGlass ? 'home-glass' : '',
        customize || editMode ? 'is-customizing' : '',
        editMode ? 'is-editing-widgets' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          ...bgVars,
          '--hw-radius': `${settings.homeWidgetRadius}px`,
          '--hw-gap': `${settings.homeGridGap}px`,
        } as CSSProperties
      }
      data-hw-style={settings.homeWidgetStyle}
    >
      {settings.bgStyle === 'custom' && bgFile ? (
        <>
          <div className="home-bg-layer" aria-hidden />
          <div className="home-bg-dim" aria-hidden />
        </>
      ) : null}

      <button
        type="button"
        className={`home-fab ${customize || editMode ? 'on' : ''}`}
        onClick={() => {
          setCustomize(true);
          setEditMode(false);
        }}
        title={t('home.customize')}
        aria-label={t('home.customize')}
        aria-expanded={customize}
      >
        <LayoutGrid size={15} strokeWidth={1.75} />
      </button>

      {editMode && !settings.homeLayoutLock && (
        <button
          type="button"
          className="home-fab home-fab-add"
          onClick={() => setGalleryOpen(true)}
          title={t('home.addWidget')}
          aria-label={t('home.addWidget')}
        >
          <Plus size={15} strokeWidth={1.75} />
        </button>
      )}

      {editMode && !settings.homeLayoutLock && widgets.length === 0 && (
        <div className="hw-empty-cta">
          <p>{t('home.personalize.widgetsEmpty')}</p>
          <button type="button" className="hw-empty-cta-btn" onClick={() => setGalleryOpen(true)}>
            <Plus size={15} strokeWidth={2} />
            {t('home.personalize.addFirstWidget')}
          </button>
        </div>
      )}

      <PersonalizeSheet
        open={customize}
        onClose={() => setCustomize(false)}
        onEditOnPage={() => {
          setCustomize(false);
          setEditMode(true);
        }}
        reduced={reduced}
      />

      <div className="home-widgets-band">
        <WidgetStrip
          widgets={widgets}
          onChange={setWidgets}
          editMode={editMode && !settings.homeLayoutLock}
          onGo={onGo}
          reduced={reduced}
          widgetStyle={settings.homeWidgetStyle}
          radius={settings.homeWidgetRadius}
          locked={settings.homeLayoutLock}
          onExitEdit={() => setEditMode(false)}
        />
      </div>

      <AddWidgetGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        widgets={widgets}
        onAdd={(w) => setWidgets([...widgets, w])}
        reduced={reduced}
      />
    </div>
  );
}
