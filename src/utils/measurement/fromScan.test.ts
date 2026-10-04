import { describe, expect, it, vi } from 'vitest';
import { measureCompletedScan } from './fromScan';
import { measureScan } from './measureScan';
import { makeCaptures } from './testFixtures';

// Record calls to the real Step 7 engine (its behaviour is unchanged).
vi.mock('./measureScan', async (importOriginal) => {
  const original = await importOriginal<typeof import('./measureScan')>();
  return { ...original, measureScan: vi.fn(original.measureScan) };
});

describe('measureCompletedScan', () => {
  it('runs the Step 7 engine on the captures, with the region of the selected garment and the entered height', () => {
    const captures = makeCaptures(undefined, { scanRegion: 'upper' });
    const now = new Date('2026-01-02T03:04:05Z');
    const result = measureCompletedScan({ captures, clothingType: 't-shirt', userHeightCm: 172, now });

    expect(measureScan).toHaveBeenCalledTimes(1);
    expect(measureScan).toHaveBeenCalledWith({ captures, region: 'upper', userHeightCm: 172 });
    expect(result.report).toEqual(measureScan({ captures, region: 'upper', userHeightCm: 172 }));
    expect(result.clothingType).toBe('t-shirt');
    expect(result.measuredAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('uses the lower-body region for trousers and the full body when nothing was selected', () => {
    vi.mocked(measureScan).mockClear();
    measureCompletedScan({ captures: {}, clothingType: 'jeans', userHeightCm: null });
    measureCompletedScan({ captures: {}, clothingType: null, userHeightCm: undefined });
    expect(vi.mocked(measureScan).mock.calls.map(([input]) => input.region)).toEqual(['lower', 'full']);
  });

  it('returns exactly what the engine returned (no added or altered values)', () => {
    const captures = makeCaptures();
    const result = measureCompletedScan({ captures, clothingType: undefined, userHeightCm: 170 });
    const returned = vi.mocked(measureScan).mock.results.at(-1)!.value;
    expect(result.report).toBe(returned);
  });
});
