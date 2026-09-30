import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../store';

const easeOut = [0.16, 1, 0.3, 1] as const;

export function ClockDigits({ value, animate }: { value: string; animate: boolean }) {
  return (
    <span className="home-clock" aria-hidden={false}>
      {value.split('').map((ch, i) =>
        ch === ':' ? (
          <span key={`c-${i}`} className="clock-colon" aria-hidden>
            :
          </span>
        ) : (
          <span key={`${i}-${ch}`} className="clock-digit">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={ch}
                className="clock-digit-inner"
                initial={animate ? { y: 10, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                exit={animate ? { y: -10, opacity: 0 } : undefined}
                transition={{ duration: 0.2, ease: easeOut }}
              >
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        ),
      )}
    </span>
  );
}

export function ClockWidget({ size = 'L', reduced }: { size?: 'S' | 'M' | 'L'; reduced: boolean }) {
  const settings = useStore((s) => s.settings);
  const [now, setNow] = useState(() => new Date());
  const showSeconds = settings.homeShowSeconds && !settings.perfLowPowerClock;

  useEffect(() => {
    if (!settings.homeShowClock && !settings.homeShowDate) return;
    const tick = () => {
      if (document.hidden && settings.perfLowPowerClock) return;
      setNow(new Date());
    };
    tick();
    const ms = settings.perfLowPowerClock ? 30_000 : showSeconds ? 1000 : 1000;
    const id = window.setInterval(tick, ms);
    return () => window.clearInterval(id);
  }, [
    settings.homeShowClock,
    settings.homeShowDate,
    settings.perfLowPowerClock,
    settings.clock24h,
    showSeconds,
  ]);

  const hour = now.getHours();
  const greet = hour < 12 ? 'Dzień dobry' : hour < 18 ? 'Dzień dobry' : 'Dobry wieczór';
  const headline = settings.homeHeadline.trim() || (settings.homeShowGreeting ? greet : '');
  const timeStr = now.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: !settings.clock24h,
  });
  const dateStr = now.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      className={`hw-clock hw-size-${size} hw-clock-style-${settings.homeClockStyle || 'thin'}`}
    >
      {(settings.homeShowClock || settings.homeShowDate) && (
        <div className="home-time">
          {settings.homeShowClock && <ClockDigits value={timeStr} animate={!reduced && !showSeconds} />}
          {settings.homeShowDate && <span className="home-date">{dateStr}</span>}
        </div>
      )}
      {headline && <h1 className="home-title">{headline}</h1>}
      {settings.homeSubline.trim() && <p className="home-subline">{settings.homeSubline.trim()}</p>}
      {settings.homeShowBrand && <p className="home-brand-name">{settings.appName}</p>}
    </div>
  );
}
