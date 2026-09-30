import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ScaledPreview } from '../ScaledPreview';
import { WidgetStrip } from '../../widgets/WidgetStrip';
import { homeBgCssUrl } from '../../lib/homeBg';
import { normalizeHomeWidgets, useStore } from '../../store';

const VW = 1440;
const VH = 900;

/** Inert scaled clone of the home canvas for the personalize sheet. */
export function HomeLivePreview() {
  const settings = useStore((s) => s.settings);
  const widgets = normalizeHomeWidgets(settings.homeWidgets);

  const bgFile = homeBgCssUrl(settings.homeBgImage);
  const bgStyle: CSSProperties | undefined =
    settings.bgStyle === 'custom' && bgFile
      ? ({
          ['--home-bg-image' as string]: `url("${bgFile}")`,
          ['--home-bg-blur' as string]: `${settings.homeBgBlur}px`,
          ['--home-bg-dim' as string]: `${settings.homeBgDim}%`,
        } as CSSProperties)
      : undefined;

  const previewKey = [
    settings.theme,
    settings.bgStyle,
    settings.homeAlign,
    settings.homeLayout,
    settings.homeLayoutPreset,
    settings.homeClockStyle,
    settings.homeWidgetStyle,
    settings.homeWidgetRadius,
    settings.homeDensity,
    settings.homeShowApps,
    settings.homeShowClock,
    JSON.stringify(settings.homeChrome),
    widgets.map((w) => `${w.id}:${w.size}:${w.x}:${w.y}`).join('|'),
  ].join('/');

  return (
    <div className="pz-preview-frame" aria-hidden>
      <ScaledPreview width={VW} height={VH}>
        <AnimatePresence mode="wait">
          <motion.div
            key={previewKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ width: VW, height: VH }}
          >
            <div
              className={[
                'pz-preview-stage',
                'home',
                'home-ios',
                'home-widgets-root',
                'home-preview-virtual',
                `home-bg-${settings.bgStyle === 'custom' && !bgFile ? 'soft' : settings.bgStyle}`,
                `home-layout-${settings.homeLayout}`,
                `home-align-${settings.homeAlign}`,
                `home-density-${settings.homeDensity}`,
                settings.uiGlass ? 'home-glass' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-hw-style={settings.homeWidgetStyle}
              style={
                {
                  ...bgStyle,
                  width: VW,
                  height: VH,
                  ['--hw-radius' as string]: `${settings.homeWidgetRadius}px`,
                } as CSSProperties
              }
            >
              <div className="home-widgets-band">
                <WidgetStrip
                  widgets={widgets}
                  onChange={() => {}}
                  editMode={false}
                  onGo={() => {}}
                  reduced
                  widgetStyle={settings.homeWidgetStyle}
                  radius={settings.homeWidgetRadius}
                  locked
                  preview
                />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </ScaledPreview>
    </div>
  );
}
