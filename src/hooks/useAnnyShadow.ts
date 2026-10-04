import { useEffect, useMemo, useState } from 'react';
import type { ScanCapture, ScanViewId } from '../types/scan';
import { buildAnnyFitInput } from '../utils/anny/scanInput';
import type { AnnyShadowResult } from '../utils/anny/shadow';
import type { AnnyWorkerResponse } from '../utils/anny/workerProtocol';

/*
 * Anny shadow measurements for the developer view only (Step 9E-2). Runs the body-model fit in a Web Worker
 * once the scan has enough views; never feeds final measurements, size prediction or saved data. Only
 * enabled with `?poseDebug`, so normal scans never download the model.
 */

export const ANNY_MODEL_URL = `${import.meta.env.BASE_URL}models/anny/anny-compact-v1.bin`;

export type AnnyShadowState =
  | { status: 'idle' }
  | { status: 'unavailable'; reason: string }
  | { status: 'running' }
  | { status: 'done'; result: AnnyShadowResult; loadMs: number; fitMs: number; modelBytes: number }
  | { status: 'error'; message: string };

interface Options {
  enabled: boolean;
  captures: Partial<Record<ScanViewId, ScanCapture>>;
  userHeightCm: number | null;
}

let requestId = 0;

export function useAnnyShadow({ enabled, captures, userHeightCm }: Options): AnnyShadowState {
  const prepared = useMemo(() => (enabled ? buildAnnyFitInput(captures, userHeightCm) : null), [enabled, captures, userHeightCm]);
  // The worker's answer, tagged with the input it belongs to (a newer input means "running" again).
  const [answer, setAnswer] = useState<{ for: unknown; state: AnnyShadowState } | null>(null);

  useEffect(() => {
    if (!prepared || !prepared.ok) return;
    const worker = new Worker(new URL('../workers/annyFit.worker.ts', import.meta.url), { type: 'module' });
    const id = (requestId += 1);
    worker.onmessage = (event: MessageEvent<AnnyWorkerResponse>) => {
      const message = event.data;
      if (message.id !== id) return;
      setAnswer({
        for: prepared,
        state:
          message.type === 'result'
            ? { status: 'done', result: message.result, loadMs: message.loadMs, fitMs: message.fitMs, modelBytes: message.modelBytes }
            : { status: 'error', message: message.message },
      });
      worker.terminate();
    };
    worker.onerror = () => setAnswer({ for: prepared, state: { status: 'error', message: 'The Anny worker failed.' } });
    worker.postMessage({ id, modelUrl: ANNY_MODEL_URL, input: prepared.input, viewsUsed: prepared.viewsUsed });
    return () => worker.terminate();
  }, [prepared]);

  if (!prepared) return { status: 'idle' };
  if (!prepared.ok) return { status: 'unavailable', reason: prepared.reason };
  return answer && answer.for === prepared ? answer.state : { status: 'running' };
}
