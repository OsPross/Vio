export type MetricsHistoryPoint = {
  ts: number;
  sysCpu: number;
  sysMem: number;
  appCpu: number;
  appMem: number;
};

export type MetricsRow = {
  id: string;
  kind: 'tab' | 'side' | 'browser' | 'gpu' | 'utility' | 'unknown';
  title: string;
  url: string;
  favicon: string;
  pid: number | null;
  cpu: number;
  memMb: number;
  netBytes: number;
  netRate: number;
  sleeping?: boolean;
};

export type MetricsPayload = {
  ts: number;
  uptimeSec: number;
  system: {
    cpu: number;
    memUsedMb: number;
    memTotalMb: number;
    memFreeMb: number;
    memPercent: number;
  };
  browser: {
    cpu: number;
    memMb: number;
    processes: number;
  };
  rows: MetricsRow[];
  history: MetricsHistoryPoint[];
  gpu?: { status: unknown; gpuDevice: string | null };
  intervalMs: number;
};

export type MetricsGuest = {
  id: string;
  kind: 'tab' | 'side';
  title?: string;
  url?: string;
  favicon?: string;
  webContentsId?: number | null;
};
