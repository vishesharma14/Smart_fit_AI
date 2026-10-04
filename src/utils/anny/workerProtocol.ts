import type { ScanViewId } from '../../types/scan';
import type { AnnyFitInput } from './fit';
import type { AnnyShadowResult } from './shadow';

/** Messages between the page and the Anny shadow-fit worker (numbers only; no images). */
export interface AnnyWorkerRequest {
  id: number;
  modelUrl: string;
  input: AnnyFitInput;
  viewsUsed: ScanViewId[];
}

export type AnnyWorkerResponse =
  | {
      id: number;
      type: 'result';
      result: AnnyShadowResult;
      /** Time to download + parse the model (0 when already loaded), ms. */
      loadMs: number;
      /** Time to fit + measure, ms. */
      fitMs: number;
      modelBytes: number;
    }
  | { id: number; type: 'error'; message: string };
