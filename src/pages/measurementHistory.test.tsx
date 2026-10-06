// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { MeasurementId, ScanMeasurementResult } from '../types/measurement';
import type { FitProfile, SavedMeasurement, ScanRecord } from '../types/profile';
import { confirmMeasurements, initialReview } from '../utils/measurement/review';
import { measureScan } from '../utils/measurement/measureScan';
import { makeSilhouetteCaptures } from '../utils/measurement/testFixtures';
import { toScanRecord } from '../utils/profile/fitProfile';
import { BODY } from '../utils/silhouette/testBody';
import { ProfilePage } from './ProfilePage';
import { ResultsPage } from './ResultsPage';

// Hand-written saved records (tests only). Values are chosen so the saved sizes do NOT match today's charts:
// a history record must be shown exactly as saved, never recalculated.
const NAMES: Partial<Record<MeasurementId, string>> = {
  chest: 'Chest', waist: 'Waist', hip: 'Hip', thigh: 'Thigh', 'shoulder-width': 'Shoulder width', 'arm-length': 'Arm length',
};
const m = (id: MeasurementId, valueCm: number): SavedMeasurement => ({
  id, name: NAMES[id] ?? id, valueCm, status: 'uncertain', confidence: 0.6, manuallyEdited: false,
});

const latestProfile: FitProfile = {
  id: '2026-03-08T10:00:00.000Z|t-shirt', garment: 't-shirt', size: 'L', fit: 'good-fit', fitPreference: 'regular', brand: 'generic',
  measuredAt: '2026-03-08T10:00:00.000Z', savedAt: '2026-03-08T10:05:00.000Z', alternativeSize: null, basedOnUncertain: true,
  chartName: 'Generic adult T-shirt chart (chest)', confirmedAt: '2026-03-08T10:01:00.000Z',
  measurements: [m('chest', 101), m('waist', 86.5), m('shoulder-width', 45.2), m('arm-length', 60)],
};
/** Nike, Relaxed — saved as XXL although chest 98.5 cm is M on today's Nike chart. */
const nikeRecord: ScanRecord = {
  id: '2026-03-01T10:00:00.000Z|t-shirt', garment: 't-shirt', size: 'XXL', fit: 'slightly-loose', fitPreference: 'relaxed', brand: 'nike',
  measuredAt: '2026-03-01T10:00:00.000Z', savedAt: '2026-03-01T10:05:00.000Z',
  measurements: [m('chest', 98.5), m('waist', 88), m('shoulder-width', 45), m('hip', 99)],
};
/** Shares no measurement with the latest record. */
const disjointRecord: ScanRecord = {
  id: '2026-02-20T10:00:00.000Z|jeans', garment: 'jeans', size: 'S', fit: 'good-fit', fitPreference: 'slim', brand: 'levis',
  measuredAt: '2026-02-20T10:00:00.000Z', savedAt: '2026-02-20T10:05:00.000Z', measurements: [m('hip', 96), m('thigh', 55)],
};
/** Saved before Step 16 (and before brands / fit preferences): no snapshot fields at all. */
const oldRecord: ScanRecord = {
  id: '2026-02-01T10:00:00.000Z|jeans', garment: 'jeans', size: 'M', fit: 'good-fit',
  measuredAt: '2026-02-01T10:00:00.000Z', savedAt: '2026-02-01T10:05:00.000Z',
};

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
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

const history = () => screen.getByRole('heading', { name: 'Measurement History' }).closest('section')!;
const card = (title: string, date: RegExp) =>
  within(history())
    .getAllByRole('listitem')
    .find((li) => within(li).queryByRole('heading', { name: title }) && date.test(li.textContent ?? ''))!;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    measurements: null,
    scanMeasurements: null,
    clothingSelection: { type: 't-shirt', fit: 'regular' },
    sizingBrand: 'generic',
    fitProfile: latestProfile,
    scanHistory: [toScanRecord(latestProfile), nikeRecord, disjointRecord, oldRecord],
    userInfo: { name: '', gender: 'men', age: 30, heightCm: 175, weightKg: 75 },
  });
});
afterEach(cleanup);

describe('Measurement History — list and details', () => {
  it('lists earlier results with the saved size, brand, preference and key measurements', () => {
    renderAt(PATHS.profile);
    const items = within(history()).getAllByRole('listitem');
    expect(items).toHaveLength(3); // the latest result is shown above, not repeated here
    const nike = card('T-Shirt · Nike', /1 Mar 2026/);
    expect(within(nike).getByText(/Recommended size:/).textContent).toBe('Recommended size: XXL');
    expect(within(nike).getByText('Slightly Loose')).toBeTruthy();
    expect(within(nike).getByText('Relaxed Fit')).toBeTruthy();
    const key = nike.querySelector('dl')!;
    expect(key.textContent).toBe('Chest98.5 cmWaist88 cmHip99 cm');
  });

  it('omits brand, preference, measurements and comparison for records saved before they existed', () => {
    renderAt(PATHS.profile);
    const old = card('Jeans', /1 Feb 2026/);
    expect(within(old).getByText(/Recommended size:/).textContent).toBe('Recommended size: M');
    expect(within(old).queryByText(/^(Slim|Regular|Relaxed) Fit$/)).toBeNull(); // no fit-preference tag
    expect(old.querySelector('dl')).toBeNull();
    expect(within(old).queryByRole('button', { name: /Compare with Latest/ })).toBeNull();
    fireEvent.click(within(old).getByRole('button', { name: /View Details/ }));
    const details = within(old).getByRole('region', { name: /Details of the Jeans result/ });
    expect(within(details).queryByText('Size chart')).toBeNull();
    expect(within(details).queryByText('Fit preference')).toBeNull();
    expect(within(details).getByText(/Measurements were not kept for this result/)).toBeTruthy();
  });

  it('shows the historical snapshot in the detail view, not a recalculation with today\'s charts', () => {
    useAppStore.setState({ sizingBrand: 'levis', clothingSelection: { type: 't-shirt', fit: 'slim' } }); // current choices differ
    renderAt(PATHS.profile);
    const nike = card('T-Shirt · Nike', /1 Mar 2026/);
    const button = within(nike).getByRole('button', { name: 'View Details for the T-Shirt result from 1 Mar 2026, 10:00' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const details = within(nike).getByRole('region', { name: /Details of the T-Shirt result from 1 Mar 2026/ });
    expect(button.getAttribute('aria-controls')).toBe(details.id);
    const fact = (label: string) => within(details).getByText(label).nextElementSibling!.textContent;
    expect(fact('Scan date')).toMatch(/1 Mar 2026/);
    expect(fact('Garment')).toBe('T-Shirt');
    expect(fact('Size chart')).toBe('Nike (reference chart)');
    expect(fact('Fit preference')).toBe('Relaxed Fit');
    expect(fact('Recommended size')).toBe('XXL');
    expect(fact('Fit')).toBe('Slightly Loose');
    const list = within(details).getByRole('list', { name: /Measurements saved with the T-Shirt result/ });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Chest98.5 cmEstimate · High confidence',
      'Waist88 cmEstimate · High confidence',
      'Shoulder width45 cmEstimate · High confidence',
      'Hip99 cmEstimate · High confidence',
    ]);
    fireEvent.click(within(nike).getByRole('button', { name: /Hide Details/ }));
    expect(within(nike).queryByRole('region')).toBeNull();
  });
});

describe('Measurement History — compare with latest', () => {
  it('shows latest − previous per shared measurement, in words, and never guesses missing values', () => {
    renderAt(PATHS.profile);
    const nike = card('T-Shirt · Nike', /1 Mar 2026/);
    fireEvent.click(within(nike).getByRole('button', { name: 'Compare with Latest for the T-Shirt result from 1 Mar 2026, 10:00' }));
    const comparison = within(nike).getByRole('region', { name: /Comparison of the T-Shirt result/ });
    expect(within(comparison).getByText(/Compared with your latest saved measurements \(scan of 8 Mar 2026/)).toBeTruthy();
    const rows = within(within(comparison).getByRole('list', { name: 'Measurement changes' })).getAllByRole('listitem');
    const text = (name: string) => rows.find((r) => r.querySelector('.history-compare__name')!.textContent === name)!.textContent;
    expect(text('Chest')).toBe('ChestPrevious98.5 cmLatest101 cm+2.5 cm Increase');
    expect(text('Waist')).toBe('WaistPrevious88 cmLatest86.5 cm−1.5 cm Decrease');
    expect(text('Shoulder width')).toBe('Shoulder widthPrevious45 cmLatest45.2 cmNo meaningful change');
    expect(text('Arm length')).toBe('Arm lengthPreviousNot recordedLatest60 cmComparison unavailable');
    expect(text('Hip')).toBe('HipPrevious99 cmLatestNot availableComparison unavailable');
    expect(within(comparison).getByText(/not a health or fitness assessment/)).toBeTruthy();
    expect(comparison.textContent).not.toMatch(/better|worse|healthy|unhealthy|fat|muscle/i);
  });

  it('says so when the two records share no measurement', () => {
    renderAt(PATHS.profile);
    const jeans = card('Jeans · Levi\'s', /20 Feb 2026/);
    fireEvent.click(within(jeans).getByRole('button', { name: /Compare with Latest/ }));
    const comparison = within(jeans).getByRole('region', { name: /Comparison of the Jeans result/ });
    expect(within(comparison).getByText('No comparable measurements in these two records.')).toBeTruthy();
    expect(within(comparison).queryByRole('list')).toBeNull();
  });

  it('offers no comparison without saved latest measurements', () => {
    useAppStore.setState({ fitProfile: null, scanHistory: [nikeRecord, oldRecord] });
    renderAt(PATHS.profile);
    expect(screen.getByRole('heading', { name: 'No saved fit profile yet' })).toBeTruthy();
    expect(within(history()).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Compare with Latest/ })).toBeNull();
    expect(within(history()).getByText('Save a fit profile to compare future measurements.')).toBeTruthy();
  });
});

describe('Measurement History — persistence and the real flow', () => {
  it('loads existing stored history, including records without brand or fit preference', async () => {
    const olderProfile = { ...latestProfile } as Partial<FitProfile>;
    delete olderProfile.brand;
    delete olderProfile.fitPreference;
    const storedLatest = { id: latestProfile.id, garment: 't-shirt', size: 'L', fit: 'good-fit', measuredAt: latestProfile.measuredAt, savedAt: latestProfile.savedAt };
    localStorage.setItem(
      'sizerai-settings',
      JSON.stringify({ state: { fitProfile: olderProfile, scanHistory: [storedLatest, nikeRecord, oldRecord, { id: 'broken' }] }, version: 2 }),
    );
    await useAppStore.persist.rehydrate();
    const { fitProfile, scanHistory } = useAppStore.getState();
    expect(fitProfile).toMatchObject({ brand: 'generic', fitPreference: 'regular' });
    expect(scanHistory).toEqual([storedLatest, nikeRecord, oldRecord]);
    renderAt(PATHS.profile);
    expect(within(history()).getAllByRole('listitem')).toHaveLength(2);
    expect(card('T-Shirt · Nike', /1 Mar 2026/)).toBeTruthy();
    expect(card('Jeans', /1 Feb 2026/)).toBeTruthy();
  });

  it('saves a measurement snapshot with each result and compares it after a later scan', async () => {
    useAppStore.setState({ fitProfile: null, scanHistory: [] });
    const confirm = (measuredAt: string, chestCm: number) => {
      const report = measureScan({ captures: makeSilhouetteCaptures(), region: 'full', userHeightCm: BODY.statureCm });
      report.measurements = report.measurements.map((x) => (x.id === 'chest' ? { ...x, value: chestCm } : x));
      const result: ScanMeasurementResult = { report, clothingType: 't-shirt', measuredAt };
      useAppStore.getState().setScanMeasurements(result);
      useAppStore.getState().setMeasurements(confirmMeasurements(result, initialReview(result, null)));
    };
    confirm('2026-03-01T10:00:00.000Z', 95);
    renderAt(PATHS.results);
    fireEvent.click(screen.getByRole('button', { name: /Save Fit Profile/ }));
    cleanup();
    confirm('2026-03-08T10:00:00.000Z', 101);
    const router = renderAt(PATHS.results);
    fireEvent.click(within(screen.getByRole('group', { name: 'Use reference brand sizing' })).getByRole('radio', { name: 'Nike' }));
    fireEvent.click(screen.getByRole('button', { name: /Save Fit Profile/ }));
    expect(useAppStore.getState().scanHistory.map((r) => [r.brand, r.size, r.measurements?.find((x) => x.id === 'chest')?.valueCm])).toEqual([
      ['nike', 'M', 101],
      ['generic', 'M', 95],
    ]);
    await act(async () => router.navigate(PATHS.profile));
    const first = card('T-Shirt', /1 Mar 2026/);
    fireEvent.click(within(first).getByRole('button', { name: /Compare with Latest/ }));
    const rows = within(within(first).getByRole('list', { name: 'Measurement changes' })).getAllByRole('listitem');
    expect(rows.find((r) => r.textContent?.startsWith('Chest'))!.textContent).toBe('ChestPrevious95 cmLatest101 cm+6.0 cm Increase');
    // Everything else came from the same scan engine output: no meaningful change.
    expect(rows.filter((r) => !r.textContent?.startsWith('Chest')).every((r) => r.textContent?.endsWith('No meaningful change'))).toBe(true);
  });
});
