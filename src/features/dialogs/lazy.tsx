import { lazy } from 'react';

export const CommandPalette = lazy(() =>
  import('../../components/CommandPalette').then((m) => ({ default: m.CommandPalette })),
);
export const ClearDataDialog = lazy(() =>
  import('../../components/ClearDataDialog').then((m) => ({ default: m.ClearDataDialog })),
);
export const AboutDialog = lazy(() =>
  import('../../components/AppDialogs').then((m) => ({ default: m.AboutDialog })),
);
export const QrShareDialog = lazy(() =>
  import('../../components/AppDialogs').then((m) => ({ default: m.QrShareDialog })),
);
export const TaskManagerOverlay = lazy(() =>
  import('../../components/metrics/ResourcesPanel').then((m) => ({
    default: m.TaskManagerOverlay,
  })),
);
