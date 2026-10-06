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
import { isFitProfile } from '../utils/profile/fitProfile';
import { BODY } from '../utils/silhouette/testBody';
import { MeasurementReviewPage } from './MeasurementReviewPage';
import { ProfilePage } from './ProfilePage';
import { ResultsPage } from './ResultsPage';

// Real engine output from the SYNTHETIC test body (tests only): chest 88.4 cm → T-shirt S.
function scanResult(measuredAt: string, drop?: string): ScanMeasurementResult {
  const report = measureScan({ captures: makeSilhouetteCaptures(), region: 'full', userHeightCm: BODY.statureCm });
  if (drop) report.measurements = report.measurements.map((m) => (m.id === drop ? { ...m, value: null, status: 'invalid' as const } : m));
  return { report, clothingType: 't-shirt', measuredAt };
}

/** A scan result, confirmed as measured. */
function confirmScan(measuredAt = '2026-03-01T10:00:00.000Z', drop?: string) {
  const result = scanResult(measuredAt, drop);
  useAppStore.getState().setScanMeasurements(result);
  useAppStore.getState().setMeasurements(confirmMeasurements(result, initialReview(result, null)));
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: PATHS.results, element: <ResultsPage /> },
      { path: PATHS.profile, element: <ProfilePage /> },
      { path: PATHS.measurements, element: <MeasurementReviewPage /> },
      { path: PATHS.scan, element: <h1>Body scan page</h1> },
      { path: PATHS.userInfo, element: <h1>Details page</h1> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const saveButton = () => screen.getByRole('button', { name: /Save Fit Profile|Update Fit Profile|Saved to Profile/ }) as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    measurements: null,
    scanMeasurements: null,
    clothingSelection: { type: 't-shirt', fit: 'regular' },
    fitProfile: null,
    scanHistory: [],
    userInfo: { name: '', gender: null, age: null, heightCm: null, weightKg: null },
  });
});
afterEach(cleanup);

describe('ResultsPage', () => {
  it('shows the recommended size, garment, fit, why and the measurements used', () => {
    confirmScan();
    renderAt(PATHS.results);
    const hero = screen.getByRole('region', { name: 'T-Shirt' });
    expect(within(hero).getByLabelText('Size S')).toBeTruthy();
    expect(within(hero).getByText('Recommended size')).toBeTruthy();
    expect(within(hero).getByText('Good Fit')).toBeTruthy();
    expect(within(hero).getByText('Based on estimated measurements')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Why this size?' })).toBeTruthy();
    expect(screen.getByText(/Your chest of 88.4 cm falls in size S/)).toBeTruthy();
    const used = screen.getByRole('list', { name: 'Measurements used for this size' });
    expect(within(used).getByText('Chest')).toBeTruthy();
    expect(within(used).getByText(/Estimate · (High|Medium|Low) confidence/)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
    expect(saveButton().textContent).toMatch('Save Fit Profile');
  });

  it('never shows a size when the required measurement is unavailable', () => {
    confirmScan(undefined, 'chest');
    renderAt(PATHS.results);
    expect(screen.queryByLabelText(/^Size /)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Insufficient measurements' })).toBeTruthy();
    expect(screen.getByText('Insufficient Data')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Why no size?' })).toBeTruthy();
    expect(screen.getByText(/Chest is unavailable from the scan/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(useAppStore.getState().fitProfile).toBeNull();
  });

  it('shows an empty state without confirmed measurements', () => {
    renderAt(PATHS.results);
    expect(screen.getByRole('heading', { name: 'No confirmed measurements yet' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Start New Scan/ }).getAttribute('href')).toBe(PATHS.userInfo);
  });

  it('saves the fit profile (measurements, size, garment, fit, timestamp) on this device', () => {
    confirmScan();
    renderAt(PATHS.results);
    fireEvent.click(saveButton());
    const { fitProfile, scanHistory, measurements } = useAppStore.getState();
    expect(fitProfile).toMatchObject({ garment: 't-shirt', size: 'S', fit: 'good-fit', measuredAt: '2026-03-01T10:00:00.000Z' });
    expect(Date.parse(fitProfile!.savedAt)).not.toBeNaN();
    const chest = measurements!.measurements.find((m) => m.id === 'chest')!;
    expect(fitProfile!.measurements.find((m) => m.id === 'chest')).toMatchObject({ valueCm: chest.value, status: chest.status });
    expect(fitProfile!.measurements.every((m) => Number.isFinite(m.valueCm))).toBe(true);
    expect(scanHistory).toHaveLength(1);
    expect(saveButton().textContent).toMatch('Saved to Profile');
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/Saved to your fit profile/);
    // Persisted (numbers only) so it survives a reload.
    const stored = JSON.parse(localStorage.getItem('sizerai-settings')!).state;
    expect(isFitProfile(stored.fitProfile)).toBe(true);
    expect(JSON.stringify(stored)).not.toMatch(/landmark|silhouette/i);
  });

  it('edit and resave: opens the review in edit mode, then updates the saved profile', async () => {
    confirmScan();
    const router = renderAt(PATHS.results);
    fireEvent.click(saveButton());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Edit Measurements/ })));
    expect(router.state.location.pathname).toBe(PATHS.measurements);
    const chest = screen.getByRole('listitem', { name: 'Chest' });
    fireEvent.change(within(chest).getByRole('textbox'), { target: { value: '101.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Measurements' }));
    await act(async () => fireEvent.click(screen.getByRole('link', { name: /View Results/ })));
    expect(router.state.location.pathname).toBe(PATHS.results);
    expect(screen.getByLabelText('Size M')).toBeTruthy();
    expect(screen.getByText('Slightly Tight')).toBeTruthy();
    expect(saveButton().textContent).toMatch('Update Fit Profile');
    fireEvent.click(saveButton());
    const { fitProfile, scanHistory } = useAppStore.getState();
    expect(fitProfile).toMatchObject({ size: 'M', fit: 'slightly-tight' });
    expect(fitProfile!.measurements.find((m) => m.id === 'chest')).toMatchObject({ valueCm: 101.5, manuallyEdited: true });
    // Same scan: its history entry is replaced, not duplicated.
    expect(scanHistory).toHaveLength(1);
    expect(scanHistory[0].size).toBe('M');
  });

  it('scan again goes to the body scan', async () => {
    confirmScan();
    const router = renderAt(PATHS.results);
    await act(async () => fireEvent.click(screen.getByRole('link', { name: /Scan Again/ })));
    expect(router.state.location.pathname).toBe(PATHS.scan);
  });
});

describe('ProfilePage', () => {
  it('shows an empty state with an action to start a scan', () => {
    renderAt(PATHS.profile);
    expect(screen.getByRole('heading', { name: 'No saved fit profile yet' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Start New Scan/ }).getAttribute('href')).toBe(PATHS.userInfo);
    useAppStore.setState({ userInfo: { name: '', gender: null, age: null, heightCm: 175, weightKg: null } });
    cleanup();
    renderAt(PATHS.profile);
    expect(screen.getByRole('link', { name: /Start New Scan/ }).getAttribute('href')).toBe(PATHS.scan);
  });

  it('shows the saved size, measurements, last scan date and previous results', () => {
    confirmScan('2026-03-01T10:00:00.000Z');
    renderAt(PATHS.results);
    fireEvent.click(saveButton());
    cleanup();
    confirmScan('2026-03-08T10:00:00.000Z');
    renderAt(PATHS.results);
    fireEvent.click(saveButton());
    cleanup();

    renderAt(PATHS.profile);
    const hero = screen.getByRole('region', { name: 'T-Shirt' });
    expect(within(hero).getByLabelText('Size S')).toBeTruthy();
    expect(within(hero).getByText('Saved size')).toBeTruthy();
    expect(within(hero).getByText('Last scan')).toBeTruthy();
    expect(within(hero).getByText(/8 Mar 2026/)).toBeTruthy();
    const saved = screen.getByRole('list', { name: 'Saved measurements' });
    expect(within(saved).getByText('Chest')).toBeTruthy();
    const previous = screen.getByRole('heading', { name: 'Measurement History' }).closest('section')!;
    expect(within(previous).getAllByRole('listitem')).toHaveLength(1);
    expect(within(previous).getByText(/1 Mar 2026/)).toBeTruthy();
  });

  it('deletes the profile and history after confirmation', () => {
    confirmScan();
    renderAt(PATHS.results);
    fireEvent.click(saveButton());
    cleanup();
    renderAt(PATHS.profile);
    fireEvent.click(screen.getByRole('button', { name: /Delete Profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(useAppStore.getState().fitProfile).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Delete Profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useAppStore.getState()).toMatchObject({ fitProfile: null, scanHistory: [] });
    expect(screen.getByRole('heading', { name: 'No saved fit profile yet' })).toBeTruthy();
  });
});
