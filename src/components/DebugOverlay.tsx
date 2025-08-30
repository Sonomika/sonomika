import React, { useEffect, useMemo, useState } from 'react';
import { workerRegistry, RegisteredWorkerInfo } from '../utils/WorkerRegistry';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';

type Props = { visible: boolean };

export const DebugOverlay: React.FC<Props> = ({ visible }) => {
  const [workers, setWorkers] = useState<RegisteredWorkerInfo[]>(workerRegistry.list());
  const [metrics, setMetrics] = useState(PerformanceMonitor.getInstance().getMetrics());
  const [good, setGood] = useState(PerformanceMonitor.getInstance().isPerformanceGood());
  const [queueSize, setQueueSize] = useState<number>(0);

  useEffect(() => {
    const off = workerRegistry.onChange(setWorkers);
    return () => { try { off(); } catch {} };
  }, []);

  useEffect(() => {
    const pm = PerformanceMonitor.getInstance();
    pm.startMonitoring();
    let raf: number;
    const loop = () => {
      try { pm.recordFrame(); } catch {}
      try {
        setMetrics(pm.getMetrics());
        setGood(pm.isPerformanceGood());
      } catch {}
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { try { cancelAnimationFrame(raf); pm.stopMonitoring(); } catch {} };
  }, []);

  const counts = useMemo(() => workerRegistry.counts(), [workers]);

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', right: 8, top: 48, zIndex: 99999, pointerEvents: 'none' }}>
      <div style={{ background: 'rgba(0,0,0,0.7)', color: '#0f0', fontFamily: 'monospace', fontSize: 12, padding: '8px 10px', borderRadius: 6, minWidth: 220, pointerEvents: 'auto', border: '1px solid rgba(0,255,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong>Perf</strong>
          <span style={{ color: good ? '#0f0' : '#f33' }}>{good ? 'OK' : 'WARN'}</span>
        </div>
        <div>FPS: {metrics.fps}</div>
        <div>Frame: {metrics.frameTime} ms</div>
        <div>Heap: {metrics.memoryUsage} MB</div>
        <div>Video Queue: {queueSize}</div>
        <hr style={{ borderColor: 'rgba(0,255,0,0.15)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong>Workers</strong>
          <span>total {counts.total}</span>
        </div>
        <div>frameRenderer: {counts.frameRenderer}</div>
        <div>thumbnail: {counts.thumbnail}</div>
        <div>videoDecode: {counts.videoDecode}</div>
        <div>other: {counts.other}</div>
        {workers.length > 0 && (
          <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto' }}>
            {workers.slice(-10).map((w) => (
              <div key={w.id} style={{ opacity: 0.9 }}>
                <span>{w.kind}</span>
                {w.label ? <span> · {w.label}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugOverlay;


