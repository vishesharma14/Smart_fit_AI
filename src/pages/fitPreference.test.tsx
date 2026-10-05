// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { ScanMeasurementResult } from '../types/measurement';
import { confirmMeasurements, initialReview } from '../utils/measurement/review';
import { measureScan } from '../utils/measurement/measureScan';
import { makeSilhouetteCaptures } from '../utils/measurement/testFixtures';
import { normalizeFitProfile } from '../utils/profile/fitProfile';
import { BODY } from '../utils/silhouette/testBody';
import { ClothingSelectionPage } from './ClothingSelectionPage';
import { ProfilePage } from './ProfilePage';
import { ResultsPage } from './ResultsPage';

// Real engine output from the SYNTHETIC test body (tests only); chest set to a known value per test.
function confirmWithChest(chestCm: number) {
  const report = measureScan({ captures: makeSilhouetteCaptures(), region: 'full', userHeightCm: BODY.statureCm });
  report.measurements = report.measurements.map((m) => (m.id === 'chest' ? { ...m, value: chestCm } : m));
  const result: ScanMeasurementResult = { report, clothingType: 't-shirt', measuredAt: '2026-04-01T10:00:00.000Z' };
  useAppStore.getState().setScanMeasurements(result);
  useAppStore.getState().setMeasurements(confirmMeasurements(result, initialReview(result, null)));
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: PATHS.clothing, element: <ClothingSelectionPage /> },
      { path: PATHS.results, element: <ResultsPage /> },
      { path: PATHS.profile, element: <ProfilePage /> },
      { path: PATHS.scan, element: <h1>Body scan page</h1> },
      { path: PATHS.userInfo, element: <h1>Details page</h1> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    measurements: null,
    scanMeasurements: null,
    clothingSelection: null,
    fitProfile: null,
    scanHistory: [],
    userInfo: { name: '', gender: 'men', age: 30, heightCm: 175, weightKg: 75 },
  });
});
afterEach(cleanup);

describe('fit preference — clothing selection', () => {
  it('asks how you like clothes to fit, preselects Regular Fit and saves the choice', async () => {
    const router = renderAt(PATHS.clothing);
    fireEvent.click(screen.getByRole('radio', { name: /T-Shirt/ }));
    const group = screen.getByRole('heading', { name: 'How do you like your clothes to fit?' }).closest('section')!;
    expect((within(group).getByRole('radio', { name: /Regular Fit/ }) as HTMLInputElement).checked).toBe(true);
    expect(within(group).getByRole('radio', { name: /Slim Fit/ })).toBeTruthy();
    fireEvent.click(within(group).getByRole('radio', { name: /Relaxed Fit/ }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Continue/ })));
    expect(router.state.location.pathname).toBe(PATHS.scan);
    expect(useAppStore.getState().clothingSelection).toEqual({ type: 't-shirt', fit: 'relaxed' });
  });

  it('keeps the chosen preference when coming back (e.g. Scan Again)', () => {
    useAppStore.setState({ clothingSelection: { type: 't-shirt', fit: 'slim' } });
    renderAt(PATHS.clothing);
    expect((screen.getByRole('radio', { name: /Slim Fit/ }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('fit preference — results and profile', () => {
  it('shows the preference on Results and in "Why this size?"', () => {
    useAppStore.setState({ clothingSelection: { type: 't-shirt', fit: 'regular' } });
    confirmWithChest(101); // top of M
    renderAt(PATHS.results);
    const hero = screen.getByRole('region', { name: 'T-Shirt' });
    expect(within(hero).getByLabelText('Size M')).toBeTruthy();
    expect(within(hero).getByText('Your preference').parentElement!.textContent).toMatch('Regular Fit');
    expect(screen.getByText(/considers your body measurements, the T-Shirt size chart and\s+your selected fit preference \(Regular Fit\)/)).toBeTruthy();
    expect(screen.getByText(/does not change or improve your measurements/)).toBeTruthy();
  });

  it('Relaxed Fit changes the result near a boundary, and the profile stores the preference', () => {
    useAppStore.setState({ clothingSelection: { type: 't-shirt', fit: 'relaxed' } });
    confirmWithChest(101);
    renderAt(PATHS.results);
    expect(screen.getByLabelText('Size L')).toBeTruthy();
    expect(screen.getByText('Also consider M')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Save Fit Profile/ }));
    expect(useAppStore.getState().fitProfile).toMatchObject({ size: 'L', fitPreference: 'relaxed' });
    cleanup();
    renderAt(PATHS.profile);
    expect(screen.getByText('Your preference').parentElement!.textContent).toMatch('Relaxed Fit');
  });

  it('changing the preference after saving offers Update Fit Profile', () => {
    useAppStore.setState({ clothingSelection: { type: 't-shirt', fit: 'regular' } });
    confirmWithChest(98);
    renderAt(PATHS.results);
    fireEvent.click(screen.getByRole('button', { name: /Save Fit Profile/ }));
    cleanup();
    useAppStore.setState({ clothingSelection: { type: 't-shirt', fit: 'slim' } });
    renderAt(PATHS.results);
    expect(screen.getByRole('button', { name: /Update Fit Profile/ })).toBeTruthy();
  });

  it('loads profiles saved before fit preferences existed as Regular', async () => {
    const older = {
      id: 'x|t-shirt', garment: 't-shirt', size: 'M', fit: 'good-fit', measuredAt: '2026-01-01T00:00:00.000Z',
      savedAt: '2026-01-01T00:01:00.000Z', alternativeSize: null, basedOnUncertain: true, chartName: 'chart',
      confirmedAt: '2026-01-01T00:00:30.000Z', measurements: [{ id: 'chest', name: 'Chest', valueCm: 98, status: 'uncertain', confidence: 0.6, manuallyEdited: false }],
    };
    expect(normalizeFitProfile(older)).toMatchObject({ size: 'M', fitPreference: 'regular' });
    expect(normalizeFitProfile({ ...older, fitPreference: 'baggy' })).toMatchObject({ fitPreference: 'regular' });
    expect(normalizeFitProfile({ ...older, size: 'XXXL' })).toBeNull();
    // Through the real persisted store.
    localStorage.setItem('sizerai-settings', JSON.stringify({ state: { fitProfile: older, scanHistory: [] }, version: 2 }));
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().fitProfile).toMatchObject({ size: 'M', fitPreference: 'regular' });
    renderAt(PATHS.profile);
    expect(screen.getByLabelText('Size M')).toBeTruthy();
    expect(screen.getByText('Your preference').parentElement!.textContent).toMatch('Regular Fit');
  });
});
