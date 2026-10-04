/*
 * Anny shadow fit, off the main thread (Step 9E-2). Loads the compact body-model export once, fits it to the
 * outline widths it receives and returns numbers only. Plain TypeScript — no PyTorch, WebAssembly or WebGPU.
 */
import { parseAnnyCompact, type AnnyCompactModel } from '../utils/anny/format';
import { runAnnyShadow } from '../utils/anny/shadow';
import type { AnnyWorkerRequest, AnnyWorkerResponse } from '../utils/anny/workerProtocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AnnyWorkerRequest>) => void) | null;
  postMessage: (message: AnnyWorkerResponse) => void;
};

let loaded: { url: string; model: Promise<AnnyCompactModel> } | null = null;

scope.onmessage = async (event) => {
  const { id, modelUrl, input, viewsUsed } = event.data;
  try {
    const loadStart = performance.now();
    const fresh = !loaded || loaded.url !== modelUrl;
    if (fresh) {
      loaded = {
        url: modelUrl,
        model: fetch(modelUrl).then((response) => {
          if (!response.ok) throw new Error(`Anny model download failed (${response.status}).`);
          return response.arrayBuffer().then(parseAnnyCompact);
        }),
      };
    }
    const model = await loaded!.model;
    const loadMs = fresh ? performance.now() - loadStart : 0;
    const fitStart = performance.now();
    const result = runAnnyShadow(model, input, viewsUsed);
    scope.postMessage({ id, type: 'result', result, loadMs, fitMs: performance.now() - fitStart, modelBytes: model.byteLength });
  } catch (error) {
    loaded = null;
    scope.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
