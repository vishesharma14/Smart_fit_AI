// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { ScanCapture, ScanViewId } from '../types/scan';
import { measureScan } from '../utils/measurement/measureScan';
import { makeSilhouetteCaptures } from '../utils/measurement/testFixtures';
import { calculateScanQuality } from '../utils/scanQuality/scanQuality';
import { SCAN_VIEWS } from '../utils/scan360/views';
import { BODY } from '../utils/silhouette/testBody';
import { MeasurementReviewPage } from './MeasurementReviewPage';
import { ResultsPage } from './ResultsPage';

// Real engine + quality output from SYNTHETIC test-body captures (tests only).
function setScan(captures: Partial<Record<ScanViewId, ScanCapture>>) {
  const report = measureScan({ captures, region: 'full', userHeightCm: BODY.statureCm });
  const scanQuality = calculateScanQuality({ captures, report, userHeightCm: BODY.statureCm });
  useAppStore.getState().setScanMeasurements({ report, clothingType: 't-shirt', measuredAt: '2026-05-01T10:00:00.000Z', scanQuality });
  return { report, scanQuality };
}
const ALL = SCAN_VIEWS.map((v) => v.id);

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: PATHS.measurements, element: <MeasurementReviewPage /> },
      { path: PATHS.results, element: <ResultsPage /> },
      { path: PATHS.scan, element: <h1>Body scan page</h1> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

beforeEach(() => {
  useAppStore.setState({ scanMeasurements: null, measurements: null, clothingSelection: { type: 't-shirt', fit: 'regular' }, fitProfile: null, scanHistory: [] });
});
afterEach(cleanup);

describe('scan quality on the review page', () => {
  it('shows the score, level and factors for a high-quality scan, without tips', () => {
    const { scanQuality } = setScan(makeSilhouetteCaptures(ALL));
    renderAt(PATHS.measurements);
    const card = screen.getByRole('region', { name: 'Scan Quality' });
    expect(within(card).getByLabelText(`Scan quality ${scanQuality.score} out of 100, Excellent`)).toBeTruthy();
    expect(within(card).getByText('Excellent')).toBeTruthy();
    const factors = within(card).getByRole('list', { name: 'Scan quality factors' });
    expect(within(factors).getAllByRole('listitem').map((li) => li.querySelector('.scan-quality__factor-label')!.textContent)).toEqual([
      'Body visibility',
      'Pose stability',
      'View coverage',
      'Outline quality',
      'Scale calibration',
    ]);
    expect(within(card).queryByText('To improve your next scan')).toBeNull();
    expect(within(card).getByText(/does not change your measurements or\s+your size/)).toBeTruthy();
  });

  it('shows targeted tips for a weaker scan and still allows editing and confirming', () => {
    setScan(makeSilhouetteCaptures(['front', 'left']));
    renderAt(PATHS.measurements);
    const card = screen.getByRole('region', { name: 'Scan Quality' });
    expect(within(card).getByText(/limited to Fair/)).toBeTruthy();
    expect(within(card).getByText('Complete the full rotation before continuing.')).toBeTruthy();
    expect(within(card).queryByText('Stand still while each view is captured.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Measurements' }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Measurements' }));
    expect(useAppStore.getState().measurements).not.toBeNull();
  });

  it('does not rate a scan highly when its outlines are missing (circumferences unavailable)', () => {
    const noOutline = Object.fromEntries(Object.entries(makeSilhouetteCaptures(ALL)).map(([k, c]) => [k, { ...c!, silhouette: undefined }]));
    const { scanQuality, report } = setScan(noOutline);
    expect(report.measurements.find((m) => m.id === 'chest')!.value).toBeNull();
    expect(['fair', 'poor']).toContain(scanQuality.level);
  });

  it('the score does not change the measurements', () => {
    const captures = makeSilhouetteCaptures(ALL);
    const { report } = setScan(captures);
    expect(report).toEqual(measureScan({ captures, region: 'full', userHeightCm: BODY.statureCm }));
  });
});

describe('scan quality on Results', () => {
  it('shows a small secondary scan-quality line next to the size', () => {
    const { scanQuality } = setScan(makeSilhouetteCaptures(ALL));
    renderAt(PATHS.measurements);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Measurements' }));
    cleanup();
    renderAt(PATHS.results);
    const hero = screen.getByRole('region', { name: 'T-Shirt' });
    expect(within(hero).getByText(`Scan quality: Excellent · ${scanQuality.score}/100`)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Scan Quality' })).toBeNull(); // no large section on Results
  });
});
