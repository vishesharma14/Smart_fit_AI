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

function renderPanel(scanFinished = true) {
  return render(
    <ValidationPanel scanFinished={scanFinished} captures={captures} userHeightCm={175} annyShadow={{ status: 'unavailable', reason: 'test' }} />,
  );
}

describe('ValidationPanel (?poseDebug only)', () => {
  it('shows the experimental validation texts', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Validation mode — experimental' })).toBeTruthy();
    expect(screen.getByText('Ground truth must come from manual tape measurements.')).toBeTruthy();
    expect(screen.getByText('These results are not yet validated for real-world clothing sizing.')).toBeTruthy();
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

    const table = screen.getByRole('table', { name: '' });
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
    expect(screen.getByText('Finish the 360° scan first.')).toBeTruthy();
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
