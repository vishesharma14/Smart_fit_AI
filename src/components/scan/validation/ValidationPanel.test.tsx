// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BodyScanPage } from '../../../pages/BodyScanPage';
import { PATHS } from '../../../routes/paths';
import { useValidationStore } from '../../../store/validationStore';
import { makeSilhouetteCaptures } from '../../../utils/measurement/testFixtures';
import { ValidationPanel } from './ValidationPanel';

// Synthetic captures of a test body (tests only); the tape values typed below are SYNTHETIC too.
const captures = makeSilhouetteCaptures();

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
beforeEach(() => {
  useValidationStore.getState().clearAll();
  localStorage.clear();
});
afterEach(cleanup);

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

type PanelProps = Parameters<typeof ValidationPanel>[0];
const panel = (props: Partial<PanelProps> = {}) => (
  <ValidationPanel
    scanStatus="finished"
    finishedEarly={false}
    captures={captures}
    userHeightCm={175}
    annyShadow={{ status: 'unavailable', reason: 'test' }}
    poseStats={null}
    {...props}
  />
);
function renderPanel(scanFinished = true) {
  return render(panel(scanFinished ? {} : { scanStatus: 'ready', captures: {} }));
}
function saveSubject() {
  type('Anonymous subject ID', 'P-001');
  type('Height (cm, tape)', '175');
  type('Chest (cm)', '96');
  fireEvent.click(screen.getByRole('button', { name: 'Save subject' }));
}

describe('ValidationPanel (?poseDebug only)', () => {
  it('shows the experimental validation texts', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Validation mode — experimental' })).toBeTruthy();
    expect(screen.getByText('Ground truth must come from manual tape measurements.')).toBeTruthy();
    expect(screen.getByText('These results are not yet validated for real-world clothing sizing.')).toBeTruthy();
    expect(screen.getByText('REAL-WORLD VALIDATION — EXPERIMENTAL')).toBeTruthy();
    expect(screen.getByText('These results do not yet establish production clothing-size accuracy.')).toBeTruthy();
    // Standardized protocol and procedure.
    expect(screen.getByText('Measurement protocol (centimetres)')).toBeTruthy();
    expect(screen.getByText('Do not suck in the stomach.')).toBeTruthy();
    expect(screen.getByText(/consistency guide, not a claim/)).toBeTruthy();
    expect(screen.getByText('Controlled scan procedure')).toBeTruthy();
  });

  it('records an unfinished scan as an unusable attempt with its reason, without values', () => {
    render(panel({ scanStatus: 'scanning', captures: { front: captures.front } }));
    saveSubject();
    expect(screen.getByText(/Will be recorded as unusable: scan not finished \(1 of 8 views captured\)/)).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Record as unusable attempt' })));
    const [attempt] = useValidationStore.getState().subjects[0].attempts;
    expect(attempt).toMatchObject({ usable: false, unusableReason: 'scan not finished (1 of 8 views captured)', scanStatus: 'scanning' });
    expect(Object.values(attempt.ellipse).every((p) => p.valueCm === null)).toBe(true);
    expect(screen.getByRole('table', { name: 'All recorded scans' }).textContent).toContain('no — scan not finished');
  });

  it('records repeated scans against the same, locked ground truth and shows repeatability', () => {
    const { rerender } = render(panel());
    saveSubject();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Record this scan' })));
    // Tape values are now fixed.
    expect(screen.getByText(/Tape values are fixed/)).toBeTruthy();
    expect(screen.getByLabelText('Chest (cm)').closest('fieldset')!.disabled).toBe(true);
    expect(screen.getByText(/Needs at least two usable scans/)).toBeTruthy();
    // A second, independent scan (new captures from a restarted scan).
    rerender(panel({ captures: makeSilhouetteCaptures() }));
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Record this scan' })));
    const subject = useValidationStore.getState().subjects[0];
    expect(subject.attempts.map((a) => a.attempt)).toEqual([1, 2]);
    expect(screen.getByRole('table', { name: 'Repeatability summary' })).toBeTruthy();
    // Summary keeps circumferences and lengths apart.
    expect(screen.getAllByText('Circumferences (pooled)').length).toBe(2);
    expect(screen.getAllByText('Lengths (pooled)').length).toBe(2);
    expect(screen.queryByText(/^All$/)).toBeNull();
  });

  it('records a height mismatch as unusable', () => {
    render(panel({ userHeightCm: 170 }));
    saveSubject();
    expect(screen.getByText(/differs from the tape height/)).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Record as unusable attempt' })));
    expect(useValidationStore.getState().subjects[0].attempts[0].usable).toBe(false);
  });

  it('validates the subject form and keeps records in memory only', () => {
    renderPanel();
    type('Anonymous subject ID', 'John Smith');
    type('Height (cm, tape)', '175');
    type('Chest (cm)', 'abc');
    fireEvent.click(screen.getByRole('button', { name: 'Save subject' }));
    expect(screen.getByText(/anonymous code/)).toBeTruthy();
    expect(screen.getByText(/Enter a number in cm/)).toBeTruthy();
    expect(useValidationStore.getState().subjects).toHaveLength(0);

    type('Anonymous subject ID', 'P-001');
    type('Chest (cm)', '96');
    fireEvent.click(screen.getByRole('button', { name: 'Save subject' }));
    expect(useValidationStore.getState().subjects[0]).toMatchObject({
      subjectId: 'P-001',
      heightCm: 175,
      groundTruth: [{ name: 'chest', value: 96, unit: 'cm' }],
      synthetic: false,
    });
    expect(Object.keys(localStorage).some((k) => /valid/i.test(k))).toBe(false);
  });

  it('records a finished scan once and shows tape vs ellipse vs Anny with availability', () => {
    renderPanel();
    type('Anonymous subject ID', 'P-001');
    type('Height (cm, tape)', '175');
    type('Chest (cm)', '96');
    fireEvent.click(screen.getByRole('button', { name: 'Save subject' }));
    const record = screen.getByRole('button', { name: 'Record this scan' });
    act(() => fireEvent.click(record));

    const attempts = useValidationStore.getState().subjects[0].attempts;
    expect(attempts).toHaveLength(1);
    expect(attempts[0].attempt).toBe(1);
    expect(JSON.stringify(attempts[0])).not.toMatch(/landmark|silhouette/i);
    expect((screen.getByRole('button', { name: 'Record this scan' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/already recorded/)).toBeTruthy();

    const table = screen.getByRole('table', { name: 'Scan 1 comparison' });
    const chestRow = within(table).getByRole('row', { name: /^Chest/ });
    expect(within(chestRow).getByText('96.0')).toBeTruthy();
    expect(within(chestRow).getAllByText('unavailable')).toHaveLength(1); // Anny unavailable
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeTruthy();
  });

  it('cannot record before the scan is finished', () => {
    renderPanel(false);
    type('Anonymous subject ID', 'P-001');
    type('Height (cm, tape)', '175');
    type('Chest (cm)', '96');
    fireEvent.click(screen.getByRole('button', { name: 'Save subject' }));
    expect((screen.getByRole('button', { name: 'Record this scan' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Start the 360° scan first.')).toBeTruthy();
  });
});

describe('Body scan page', () => {
  const renderScan = (search: string) => {
    const router = createMemoryRouter([{ path: PATHS.scan, element: <BodyScanPage /> }], { initialEntries: [`${PATHS.scan}${search}`] });
    render(<RouterProvider router={router} />);
  };

  it('shows the validation panel only with ?poseDebug', async () => {
    renderScan('');
    expect(screen.queryByText('Validation mode — experimental')).toBeNull();
    cleanup();
    renderScan('?poseDebug');
    expect(await screen.findByText('Validation mode — experimental')).toBeTruthy();
  });
});
