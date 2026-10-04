// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { ScanMeasurementResult } from '../types/measurement';
import { measureScan } from '../utils/measurement/measureScan';
import { makeCaptures } from '../utils/measurement/testFixtures';
import { MeasurementReviewPage } from './MeasurementReviewPage';

// Real Step 7 engine output from synthetic captures of known geometry (tests only).
function scanResult(userHeightCm: number | null, region: 'full' | 'upper' = 'full'): ScanMeasurementResult {
  return {
    report: measureScan({ captures: makeCaptures(undefined, { scanRegion: region }), region, userHeightCm }),
    clothingType: region === 'upper' ? 't-shirt' : null,
    measuredAt: `2026-01-01T00:00:0${userHeightCm ? 1 : 2}.000Z`,
  };
}

function renderReview() {
  const router = createMemoryRouter(
    [
      { path: PATHS.measurements, element: <MeasurementReviewPage /> },
      { path: PATHS.scan, element: <h1>Body scan page</h1> },
    ],
    { initialEntries: [PATHS.measurements] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const item = (name: string) => screen.getByRole('listitem', { name });

beforeEach(() => {
  useAppStore.setState({ scanMeasurements: null, measurements: null });
});
afterEach(cleanup);

describe('MeasurementReviewPage', () => {
  it('shows each measurement from the engine with value, unit, status, confidence and reason', () => {
    const result = scanResult(170);
    useAppStore.getState().setScanMeasurements(result);
    renderReview();

    expect(screen.getAllByRole('listitem')).toHaveLength(result.report.measurements.length);
    for (const m of result.report.measurements) {
      const row = item(m.name);
      expect(within(row).getByText({ valid: 'Valid', uncertain: 'Uncertain', invalid: 'Invalid', unsupported: 'Unsupported' }[m.status])).toBeTruthy();
      if (m.value !== null) {
        expect(row.querySelector('.measure-item__value')!.textContent).toBe(`${m.value.toLocaleString('en', { maximumFractionDigits: 1 })} cm`);
        expect(within(row).getByText(/^(High|Medium|Low) \(\d+%\)$/)).toBeTruthy();
      }
    }
    const shoulders = result.report.measurements.find((m) => m.id === 'shoulder-width')!;
    expect(shoulders.status).toBe('valid');
    expect(within(item('Shoulder width')).queryByText(/^Reason:/)).toBeNull();
  });

  it('shows unsupported measurements as unavailable with their reason, never a number', () => {
    useAppStore.getState().setScanMeasurements(scanResult(170));
    renderReview();
    const chest = item('Chest');
    expect(within(chest).getByText('Currently unavailable')).toBeTruthy();
    expect(within(chest).getByText('Unsupported')).toBeTruthy();
    expect(within(chest).getByText('Reason:')).toBeTruthy();
    expect(chest.textContent).not.toMatch(/\d+(\.\d+)? cm/);
    expect(within(chest).queryByText(/Confidence/)).toBeNull();
  });

  it('lets a valid measurement be edited and marks it as edited', () => {
    const result = scanResult(170);
    useAppStore.getState().setScanMeasurements(result);
    renderReview();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Measurements' }));
    const input = within(item('Shoulder width')).getByRole('textbox', { name: 'Shoulder width (cm)' });
    fireEvent.change(input, { target: { value: '45.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const row = item('Shoulder width');
    expect(row.querySelector('.measure-item__value')!.textContent).toBe('45.5 cm');
    expect(within(row).getByText('Edited by you')).toBeTruthy();
    expect(within(row).getByText('Valid')).toBeTruthy();
  });

  it('rejects invalid input and keeps the measured value', () => {
    const result = scanResult(170);
    useAppStore.getState().setScanMeasurements(result);
    renderReview();
    const measured = result.report.measurements.find((m) => m.id === 'shoulder-width')!.value!;

    fireEvent.click(screen.getByRole('button', { name: 'Edit Measurements' }));
    for (const bad of ['-4', 'abc', '', '0']) {
      const input = within(item('Shoulder width')).getByRole('textbox');
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(within(item('Shoulder width')).getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const row = item('Shoulder width');
    expect(row.querySelector('.measure-item__value')!.textContent).toBe(`${measured} cm`);
    expect(within(row).queryByText('Edited by you')).toBeNull();
  });

  it('offers no input for unsupported measurements', () => {
    useAppStore.getState().setScanMeasurements(scanResult(170));
    renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Measurements' }));
    for (const name of ['Chest', 'Waist', 'Hip', 'Thigh', 'Inseam']) {
      expect(within(item(name)).queryByRole('textbox')).toBeNull();
      expect(within(item(name)).getByText('Currently unavailable')).toBeTruthy();
    }
  });

  it('keeps uncertain measurements labelled uncertain, also after an edit', () => {
    // No height entered: only the pose model's own scale is available, so lengths stay uncertain.
    const result = scanResult(null);
    useAppStore.getState().setScanMeasurements(result);
    renderReview();
    const arm = item('Arm length');
    expect(within(arm).getByText('Uncertain')).toBeTruthy();
    expect(within(arm).getByText(/^Reason:/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Measurements' }));
    fireEvent.change(within(item('Arm length')).getByRole('textbox'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Measurements' }));

    expect(within(item('Arm length')).getByText('Uncertain')).toBeTruthy();
    const confirmedArm = useAppStore.getState().measurements!.measurements.find((m) => m.id === 'arm-length')!;
    expect(confirmedArm).toMatchObject({ value: 60, status: 'uncertain', manuallyEdited: true });
  });

  it('stores the confirmed measurements in app state', () => {
    const result = scanResult(170);
    useAppStore.getState().setScanMeasurements(result);
    renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Measurements' }));
    fireEvent.change(within(item('Leg length')).getByRole('textbox'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Measurements' }));

    const confirmed = useAppStore.getState().measurements!;
    expect(confirmed.region).toBe('full');
    expect(confirmed.measuredAt).toBe(result.measuredAt);
    expect(confirmed.calibration).toEqual(result.report.calibration);
    expect(confirmed.measurements.map((m) => m.id)).toEqual(result.report.measurements.map((m) => m.id));
    for (const m of confirmed.measurements) {
      const original = result.report.measurements.find((o) => o.id === m.id)!;
      expect(m).toMatchObject({ name: original.name, unit: original.unit, confidence: original.confidence, status: original.status });
      expect(m.manuallyEdited).toBe(m.id === 'leg-length');
      expect(m.value).toBe(m.id === 'leg-length' ? 90 : original.value);
    }
    expect(screen.getByRole('status').textContent).toMatch(/Measurements confirmed/);
  });

  it('goes back to the scan without losing the scan result', async () => {
    const result = scanResult(170);
    useAppStore.getState().setScanMeasurements(result);
    const router = renderReview();
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: /Back to Scan/ }));
    });
    expect(router.state.location.pathname).toBe(PATHS.scan);
    expect(screen.getByRole('heading', { name: 'Body scan page' })).toBeTruthy();
    expect(useAppStore.getState().scanMeasurements).toBe(result);
  });

  it('asks for a scan when there are no results, without showing any values', () => {
    renderReview();
    expect(screen.getByText('No scan results yet')).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.getByRole('link', { name: /Go to body scan/ }).getAttribute('href')).toBe(PATHS.scan);
  });
});

describe('scan measurement state', () => {
  it('a new scan result clears measurements confirmed from an earlier scan', () => {
    const first = scanResult(170);
    const store = useAppStore.getState();
    store.setScanMeasurements(first);
    useAppStore.getState().setMeasurements({
      region: 'full', clothingType: null, measurements: [], calibration: first.report.calibration,
      measuredAt: first.measuredAt, confirmedAt: first.measuredAt,
    });
    useAppStore.getState().setScanMeasurements(scanResult(null));
    expect(useAppStore.getState().measurements).toBeNull();
  });
});
