// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import { measureScan } from '../utils/measurement/measureScan';
import { makeCaptures } from '../utils/measurement/testFixtures';
import { BodyScanPage } from './BodyScanPage';
import { MeasurementReviewPage } from './MeasurementReviewPage';

beforeAll(() => {
  // jsdom has no matchMedia; the scan page only uses it for layout.
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
afterEach(cleanup);

it('Back to Scan opens the real body scan page in its ready state', async () => {
  const result = {
    report: measureScan({ captures: makeCaptures(), region: 'full', userHeightCm: 170 }),
    clothingType: null,
    measuredAt: '2026-01-01T00:00:00.000Z',
  };
  useAppStore.getState().setScanMeasurements(result);
  const router = createMemoryRouter(
    [
      { path: PATHS.measurements, element: <MeasurementReviewPage /> },
      { path: PATHS.scan, element: <BodyScanPage /> },
    ],
    { initialEntries: [PATHS.measurements] },
  );
  render(<RouterProvider router={router} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('link', { name: /Back to Scan/ }));
  });
  expect(router.state.location.pathname).toBe(PATHS.scan);
  expect(screen.getByRole('heading', { level: 1, name: /Body\s*scan/ })).toBeTruthy();
  // A fresh scan can be started (the camera is only requested when the user asks).
  expect(screen.getByRole('button', { name: /Enable camera|Turn on camera|Start camera/i })).toBeTruthy();
  expect(useAppStore.getState().scanMeasurements).toBe(result);
});
