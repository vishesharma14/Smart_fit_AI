// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { ClothingType } from '../types/domain';
import type { ScanMeasurementResult } from '../types/measurement';
import { confirmMeasurements, initialReview } from '../utils/measurement/review';
import { measureScan } from '../utils/measurement/measureScan';
import { makeSilhouetteCaptures } from '../utils/measurement/testFixtures';
import { normalizeFitProfile } from '../utils/profile/fitProfile';
import { BODY } from '../utils/silhouette/testBody';
import { ProfilePage } from './ProfilePage';
import { ResultsPage } from './ResultsPage';

// Real engine output from the SYNTHETIC test body (tests only); chest set to a known value.
function confirm(garment: ClothingType, chestCm: number) {
  const report = measureScan({ captures: makeSilhouetteCaptures(), region: 'full', userHeightCm: BODY.statureCm });
  report.measurements = report.measurements.map((m) => (m.id === 'chest' ? { ...m, value: chestCm } : m));
  const result: ScanMeasurementResult = { report, clothingType: garment, measuredAt: '2026-04-01T10:00:00.000Z' };
  useAppStore.getState().setScanMeasurements(result);
  useAppStore.getState().setMeasurements(confirmMeasurements(result, initialReview(result, null)));
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: PATHS.results, element: <ResultsPage /> },
      { path: PATHS.profile, element: <ProfilePage /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const brandGroup = () => screen.getByRole('group', { name: 'Use reference brand sizing' });

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    measurements: null,
    scanMeasurements: null,
    clothingSelection: { type: 't-shirt', fit: 'regular' },
    sizingBrand: 'generic',
    fitProfile: null,
    scanHistory: [],
    userInfo: { name: '', gender: 'men', age: 30, heightCm: 175, weightKg: 75 },
  });
});
afterEach(cleanup);

describe('reference brand sizing on Results', () => {
  it('defaults to Generic with the existing generic result', () => {
    confirm('t-shirt', 95);
    renderAt(PATHS.results);
    const group = brandGroup();
    expect(within(group).getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual(['Generic', 'Nike', "Levi's", 'H&M']);
    expect((within(group).getByRole('radio', { name: 'Generic' }) as HTMLInputElement).checked).toBe(true);
    expect(within(screen.getByRole('region', { name: 'T-Shirt' })).getByLabelText('Size M')).toBeTruthy();
    expect(screen.queryByText(/Reference sizing\./)).toBeNull();
    expect(screen.getByText(/a generic size chart, not a brand's/)).toBeTruthy();
  });

  it('switches to a brand chart with brand, size, note and explanation', () => {
    confirm('t-shirt', 95);
    renderAt(PATHS.results);
    fireEvent.click(within(brandGroup()).getByRole('radio', { name: 'Nike' }));
    expect(useAppStore.getState().sizingBrand).toBe('nike');
    const hero = screen.getByRole('region', { name: 'T-Shirt' });
    expect(within(hero).getByLabelText('Size S')).toBeTruthy();
    expect(within(hero).getByText(/Nike · reference chart/)).toBeTruthy();
    expect(screen.getByText(/Reference sizing\. Actual fit can vary by product, region, and cut\./)).toBeTruthy();
    expect(screen.getByText(/the Nike reference\s+T-Shirt size chart and your selected fit preference \(Regular Fit\)/)).toBeTruthy();
    expect(screen.getByText(/not official Nike data/)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('shows "Reference chart unavailable" without a size when the brand has no chart for the garment', () => {
    useAppStore.setState({ clothingSelection: { type: 'shirt', fit: 'regular' } });
    confirm('shirt', 95);
    renderAt(PATHS.results);
    fireEvent.click(within(brandGroup()).getByRole('radio', { name: 'Nike' }));
    const hero = screen.getByRole('region', { name: 'Reference chart unavailable' });
    expect(within(hero).queryByLabelText(/^Size /)).toBeNull();
    expect(within(hero).getByText('Reference chart unavailable', { selector: '.result-pill' })).toBeTruthy();
    expect((screen.getByRole('button', { name: /Save Fit Profile/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves the brand with the profile and shows it on the Profile page', async () => {
    confirm('t-shirt', 95);
    const router = renderAt(PATHS.results);
    fireEvent.click(within(brandGroup()).getByRole('radio', { name: "Levi's" }));
    fireEvent.click(screen.getByRole('button', { name: /Save Fit Profile/ }));
    expect(useAppStore.getState().fitProfile).toMatchObject({ brand: 'levis', size: 'S', chartName: "Levi's reference T-shirt chart (chest)" });
    expect(screen.getByRole('button', { name: /Saved to Profile/ })).toBeTruthy();
    // Changing the brand makes the shown result different from the saved one.
    fireEvent.click(within(brandGroup()).getByRole('radio', { name: 'Generic' }));
    expect(screen.getByRole('button', { name: /Update Fit Profile/ })).toBeTruthy();
    await act(async () => router.navigate(PATHS.profile));
    expect(within(screen.getByRole('region', { name: 'T-Shirt' })).getByText(/Levi's · reference chart/)).toBeTruthy();
  });

  it('loads profiles saved before brand sizing as Generic', () => {
    const old = {
      id: 'a|t-shirt', garment: 't-shirt', size: 'M', fit: 'good-fit', fitPreference: 'regular', measuredAt: '2026-01-01T00:00:00.000Z',
      savedAt: '2026-01-01T00:01:00.000Z', alternativeSize: null, basedOnUncertain: false, chartName: 'chart',
      confirmedAt: '2026-01-01T00:00:30.000Z', measurements: [],
    };
    expect(normalizeFitProfile(old)?.brand).toBe('generic');
    expect(normalizeFitProfile({ ...old, brand: 'unknown' })?.brand).toBe('generic');
    expect(normalizeFitProfile({ ...old, brand: 'hm' })?.brand).toBe('hm');
  });
});
