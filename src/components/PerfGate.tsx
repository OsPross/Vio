import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';
import { isPerfBenchEnabled, perfOnRender } from '../lib/perfProbe';

const onRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
  perfOnRender(String(id), actualDuration);
};

/** Wraps children in React.Profiler only when PERF_BENCH instrumentation is on. */
export function PerfGate({ id, children }: { id: string; children: ReactNode }) {
  if (!isPerfBenchEnabled()) return children;
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
