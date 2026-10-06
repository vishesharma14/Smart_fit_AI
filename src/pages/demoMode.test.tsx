// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RootLayout } from '../layouts/RootLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { FitProfile } from '../types/profile';
import { toScanRecord } from '../utils/profile/fitProfile';
import { ClothingSelectionPage } from './ClothingSelectionPage';
import { DemoScanPage } from './DemoScanPage';
import { HomePage } from './HomePage';
import { MeasurementReviewPage } from './MeasurementReviewPage';
import { PrivacyCenterPage } from './PrivacyCenterPage';
import { ProfilePage } from './ProfilePage';
import { ResultsPage } from './ResultsPage';
import { UserInfoPage } from './UserInfoPage';

function renderApp(path: string = PATHS.home) {
  const router = createMemoryRouter(
    [
      {
        element: <RootLayout />,
        children: [
          { path: PATHS.home, element: <HomePage /> },
          { path: PATHS.userInfo, element: <UserInfoPage /> },
          { path: PATHS.clothing, element: <ClothingSelectionPage /> },
          // The real camera page is not rendered here; only where the flow leads is checked.
          { path: PATHS.scan, element: <h1>Real body scan</h1> },
          { path: PATHS.demoScan, element: <DemoScanPage /> },
          { path: PATHS.measurements, element: <MeasurementReviewPage /> },
          { path: PATHS.results, element: <ResultsPage /> },
          { path: PATHS.profile, element: <ProfilePage /> },
          { path: PATHS.privacy, element: <PrivacyCenterPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const getUserMedia = vi.fn();
const click = async (el: HTMLElement) => act(async () => fireEvent.click(el));
const banner = () => screen.queryByRole('complementary', { name: 'Demo Mode' });

beforeEach(() => {
  localStorage.clear();
  getUserMedia.mockReset();
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  useAppStore.setState({
    demoMode: false,
    userInfo: { name: '', gender: null, age: null, heightCm: null, weightKg: null },
    clothingSelection: null,
    scanMeasurements: null,
    measurements: null,
    sizingBrand: 'generic',
    fitProfile: null,
    scanHistory: [],
  });
});
afterEach(cleanup);

describe('Demo Mode journey', () => {
  it('runs Welcome → details → clothing → demo scan → review/edit → results → profile, labelled throughout, without the camera', async () => {
    const router = renderApp();
    expect(banner()).toBeNull();
    await click(screen.getByRole('button', { name: /Try Demo Mode/ }));

    // Details: sample profile, clearly labelled.
    expect(router.state.location.pathname).toBe(PATHS.userInfo);
    expect(useAppStore.getState().demoMode).toBe(true);
    expect(within(banner()!).getByText('Using sample scan data for demonstration. No camera is used.')).toBeTruthy();
    expect(screen.getByText(/Sample details for the demo/)).toBeTruthy();
    expect((screen.getByDisplayValue('Demo User') as HTMLInputElement).value).toBe('Demo User');
    await click(screen.getByRole('button', { name: /Continue/ }));

    // Clothing → the demo scan instead of the camera.
    expect(router.state.location.pathname).toBe(PATHS.clothing);
    fireEvent.click(screen.getByRole('radio', { name: /T-Shirt/ }));
    await click(screen.getByRole('button', { name: /Continue/ }));
    expect(router.state.location.pathname).toBe(PATHS.demoScan);

    // Demo scan: badge, explanation, sample values, sample quality; no camera request.
    expect(screen.getAllByText('Demo Mode').length).toBeGreaterThanOrEqual(2);
    const samples = screen.getByLabelText('Sample measurements');
    expect(within(samples).getByText('Chest').nextElementSibling!.textContent).toBe('98 cm');
    expect(screen.getByText(/94\/100 Excellent/)).toBeTruthy();
    await click(screen.getByRole('button', { name: /Use Sample Scan/ }));
    expect(getUserMedia).not.toHaveBeenCalled();

    // Review: demo labelled, demo scan quality, editing works as for a real scan.
    expect(router.state.location.pathname).toBe(PATHS.measurements);
    expect(screen.getByText(/Demo sample measurements\./)).toBeTruthy();
    const quality = screen.getByRole('region', { name: 'Scan Quality' });
    expect(within(quality).getByText('Demo sample')).toBeTruthy();
    expect(within(quality).getByText('94')).toBeTruthy();
    expect(within(quality).getByText(/not calculated from a scan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Measurements' }));
    fireEvent.change(within(screen.getByRole('listitem', { name: 'Chest' })).getByRole('textbox'), { target: { value: '110' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Measurements' }));
    expect(useAppStore.getState().measurements).toMatchObject({ demo: true });

    // Results: the existing engine on the edited value (chest 110 → XL on the generic chart), labelled as demo.
    await act(async () => router.navigate(PATHS.results));
    const hero = screen.getByRole('region', { name: 'T-Shirt' });
    expect(within(hero).getByLabelText('Size XL')).toBeTruthy();
    expect(within(hero).getByText(/Based on sample measurements — demonstration only/)).toBeTruthy();
    expect(within(hero).getByText(/Scan quality \(demo sample\): Excellent · 94\/100/)).toBeTruthy();
    // Brand selection still applies (Nike T-shirt XL 112–120 → chest 110 is L).
    fireEvent.click(within(screen.getByRole('group', { name: 'Use reference brand sizing' })).getByRole('radio', { name: 'Nike' }));
    expect(within(screen.getByRole('region', { name: 'T-Shirt' })).getByLabelText('Size L')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Save Fit Profile/ }));
    expect(useAppStore.getState().fitProfile).toMatchObject({ demo: true, size: 'L', brand: 'nike' });
    expect(useAppStore.getState().scanHistory[0]).toMatchObject({ demo: true });

    // Profile: clearly a demo profile.
    await act(async () => router.navigate(PATHS.profile));
    const profileHero = screen.getByRole('region', { name: 'T-Shirt' });
    expect(within(profileHero).getByText('Saved size · Demo profile')).toBeTruthy();
    expect(within(profileHero).getByText(/Saved from Demo Mode sample data — not a real scan/)).toBeTruthy();
    expect(within(profileHero).getByText('Demo scan')).toBeTruthy();

    // Exit Demo Mode from the banner.
    await click(within(banner()!).getByRole('button', { name: /Exit Demo Mode/ }));
    expect(router.state.location.pathname).toBe(PATHS.home);
    expect(useAppStore.getState()).toMatchObject({ demoMode: false, measurements: null, scanMeasurements: null });
    expect(useAppStore.getState().userInfo.name).toBe('');
    expect(banner()).toBeNull();
    // The saved demo profile stays (deletable as usual), still marked as demo.
    expect(useAppStore.getState().fitProfile?.demo).toBe(true);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('offers Start Real Scan on Results, which leaves Demo Mode and starts the normal flow', async () => {
    const router = renderApp();
    await click(screen.getByRole('button', { name: /Try Demo Mode/ }));
    useAppStore.setState({ clothingSelection: { type: 'jeans', fit: 'regular' } });
    await act(async () => router.navigate(PATHS.demoScan));
    await click(screen.getByRole('button', { name: /Use Sample Scan/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Measurements' }));
    await act(async () => router.navigate(PATHS.results));
    // Jeans: waist 84 and hip 100 are M on the generic chart.
    expect(within(screen.getByRole('region', { name: 'Jeans' })).getByLabelText('Size M')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Scan Again/ }).getAttribute('href')).toBe(PATHS.demoScan);
    await click(screen.getByRole('button', { name: /Start Real Scan/ }));
    expect(router.state.location.pathname).toBe(PATHS.userInfo);
    expect(useAppStore.getState().demoMode).toBe(false);
    expect(screen.queryByText(/Sample details for the demo/)).toBeNull();
  });
});

describe('the normal flow is unaffected', () => {
  it('Get Started never enters Demo Mode and Clothing still leads to the camera scan', async () => {
    const router = renderApp();
    await click(screen.getByRole('link', { name: /Get Started/ }));
    expect(useAppStore.getState().demoMode).toBe(false);
    expect(banner()).toBeNull();
    useAppStore.setState({ userInfo: { name: '', gender: 'men', age: 30, heightCm: 175, weightKg: 75 } });
    await act(async () => router.navigate(PATHS.clothing));
    fireEvent.click(screen.getByRole('radio', { name: /T-Shirt/ }));
    await click(screen.getByRole('button', { name: /Continue/ }));
    expect(router.state.location.pathname).toBe(PATHS.scan);
  });

  it('Get Started from inside Demo Mode leaves it', async () => {
    useAppStore.getState().enterDemoMode();
    renderApp();
    expect(banner()).toBeTruthy();
    await click(screen.getByRole('link', { name: /Get Started/ }));
    expect(useAppStore.getState().demoMode).toBe(false);
    expect(useAppStore.getState().userInfo.name).toBe('');
  });

  it('the demo scan page does nothing outside Demo Mode', () => {
    renderApp(PATHS.demoScan);
    expect(screen.getByRole('heading', { name: /Demo Mode is off/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Use Sample Scan/ })).toBeNull();
  });

  it('real profiles and history show no demo labels; demo history entries are labelled', () => {
    const real: FitProfile = {
      id: 'r|t-shirt', garment: 't-shirt', size: 'M', fit: 'good-fit', fitPreference: 'regular', brand: 'generic',
      measuredAt: '2026-03-08T10:00:00.000Z', savedAt: '2026-03-08T10:05:00.000Z', alternativeSize: null, basedOnUncertain: true,
      chartName: 'Generic adult T-shirt chart (chest)', confirmedAt: '2026-03-08T10:01:00.000Z',
      measurements: [{ id: 'chest', name: 'Chest', valueCm: 98, status: 'uncertain', confidence: 0.6, manuallyEdited: false }],
    };
    const demoRecord = { ...toScanRecord({ ...real, id: 'd|t-shirt', measuredAt: '2026-03-01T10:00:00.000Z' }), demo: true as const };
    useAppStore.setState({ fitProfile: real, scanHistory: [toScanRecord(real), demoRecord] });
    renderApp(PATHS.profile);
    const hero = screen.getByRole('region', { name: 'T-Shirt' });
    expect(within(hero).getByText('Saved size')).toBeTruthy();
    expect(within(hero).queryByText(/Demo/)).toBeNull();
    const history = screen.getByRole('heading', { name: 'Measurement History' }).closest('section')!;
    expect(within(history).getByText(/Sample data from Demo Mode, not a real scan/)).toBeTruthy();
    fireEvent.click(within(history).getByRole('button', { name: /Compare with Latest/ }));
    expect(within(history).getByText('This earlier record is Demo Mode sample data.')).toBeTruthy();
  });

  it('the Privacy Center explains Demo Mode', () => {
    renderApp(PATHS.privacy);
    expect(screen.getByText(/Demo Mode never turns on the camera: it uses a fixed set of predefined sample measurements/)).toBeTruthy();
  });
});
