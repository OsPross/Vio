/** Motion presets — keep numeric values in sync with `src/styles/motion.css` tokens. */

/** iOS spring — cubic-bezier(0.22, 1, 0.36, 1) */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IOS = EASE_OUT;

/** Seconds (Motion / Framer API). */
export const DURATION = {
  viewIn: 0.2,
  viewOut: 0.16,
  section: 0.18,
  popup: 0.2,
  popupOut: 0.14,
} as const;

export type MotionFlags = {
  perfReduceMotion?: boolean;
  uiMotion?: boolean;
};

export function isMotionOff(settings: MotionFlags): boolean {
  return Boolean(
    settings.perfReduceMotion ||
      !settings.uiMotion ||
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
}

export function viewTransition(reduced: boolean) {
  const enterDur = reduced ? 0.08 : DURATION.viewIn;
  const exitDur = reduced ? 0.08 : DURATION.viewOut;
  return {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.985 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: reduced
      ? { opacity: 0, transition: { duration: exitDur, ease: EASE_OUT } }
      : { opacity: 0, y: -4, scale: 0.99, transition: { duration: exitDur, ease: EASE_OUT } },
    transition: { duration: enterDur, ease: EASE_OUT },
  };
}

export function sectionTransition(reduced: boolean) {
  return {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: {
      opacity: 0,
      y: reduced ? 0 : -2,
      transition: { duration: reduced ? 0.06 : DURATION.section * 0.85, ease: EASE_OUT },
    },
    transition: {
      duration: reduced ? 0.08 : DURATION.section,
      ease: EASE_OUT,
    },
  };
}

export function popupTransition(reduced: boolean) {
  const enterDur = reduced ? 0.08 : DURATION.popup;
  const exitDur = reduced ? 0.06 : DURATION.popupOut;
  return {
    initial: reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: reduced
      ? { opacity: 0, transition: { duration: exitDur, ease: EASE_OUT } }
      : { opacity: 0, scale: 0.96, y: -2, transition: { duration: exitDur, ease: EASE_OUT } },
    transition: { duration: enterDur, ease: EASE_OUT },
  };
}
