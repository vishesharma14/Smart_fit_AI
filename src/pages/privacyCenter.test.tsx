// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import type { MeasurementId } from '../types/measurement';
import type { FitProfile, SavedMeasurement, ScanRecord } from '../types/profile';
import { toScanRecord } from '../utils/profile/fitProfile';
import { PrivacyCenterPage } from './PrivacyCenterPage';
import { ProfilePage } from './ProfilePage';

// Hand-written saved data (tests only).
const m = (id: MeasurementId, name: string, valueCm: number): SavedMeasurement => ({
  id, name, valueCm, status: 'uncertain', confidence: 0.6, manuallyEdited: false,
});
const profile: FitProfile = {
  id: '2026-03-08T10:00:00.000Z|t-shirt', garment: 't-shirt', size: 'L', fit: 'good-fit', fitPreference: 'relaxed', brand: 'nike',
  measuredAt: '2026-03-08T10:00:00.000Z', savedAt: '2026-03-08T10:05:00.000Z', alternativeSize: null, basedOnUncertain: true,
  chartName: 'Nike reference T-shirt chart (chest)', confirmedAt: '2026-03-08T10:01:00.000Z', measurements: [m('chest', 'Chest', 101)],
};
/** Saved before brands, fit preferences and measurement snapshots existed. */
const oldRecord: ScanRecord = {
  id: '2026-02-01T10:00:00.000Z|jeans', garment: 'jeans', size: 'M', fit: 'good-fit',
  measuredAt: '2026-02-01T10:00:00.000Z', savedAt: '2026-02-01T10:05:00.000Z',
};

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: PATHS.profile, element: <ProfilePage /> },
      { path: PATHS.privacy, element: <PrivacyCenterPage /> },
      { path: PATHS.scan, element: <h1>Body scan page</h1> },
      { path: PATHS.userInfo, element: <h1>Details page</h1> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const section = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!;
const persisted = () => JSON.parse(localStorage.getItem('sizerai-settings') ?? '{}').state;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    fitProfile: profile,
    scanHistory: [toScanRecord(profile), oldRecord],
    measurements: null,
    scanMeasurements: null,
    theme: 'dark',
    heightUnit: 'ft-in',
    weightUnit: 'lb',
    voiceGuidance: false,
    userInfo: { name: '', gender: 'men', age: 30, heightCm: 175, weightKg: 75 },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Privacy Center — content', () => {
  it('renders the title, subtitle, sections and the current privacy setup', () => {
    renderAt(PATHS.privacy);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Privacy Center');
    expect(screen.getByText('Understand what SizerAI processes, stores, and keeps on your device.')).toBeTruthy();
    for (const title of ['Current privacy setup', 'What SizerAI stores', 'What SizerAI does not store', 'Camera processing', 'Where your saved data lives', 'Delete your saved data']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
    const setup = within(section('Current privacy setup')).getAllByRole('listitem').map((li) => li.textContent);
    expect(setup).toContain('Saved profile and history are stored in this browser’s local storage');
    expect(setup).toContain('No SizerAI account is required');
    // No scores or guarantees.
    expect(document.body.textContent).not.toMatch(/100%|fully private|nothing ever leaves|encrypted with/i);
    expect(screen.getByText(/not a legal privacy policy or guarantee/)).toBeTruthy();
  });

  it('describes the stored data model and what is saved right now', () => {
    renderAt(PATHS.privacy);
    const stores = section('What SizerAI stores');
    expect(within(stores).getByText(/Depending on the saved result, SizerAI may keep/)).toBeTruthy();
    expect(within(stores).getByText(/fit preference \(Slim, Regular or Relaxed\) and the reference brand chart, if one was chosen/)).toBeTruthy();
    expect(within(stores).getByText(/confirmed measurements that had a value, in centimetres/)).toBeTruthy();
    expect(within(stores).getByText(/up to 10 saved results/)).toBeTruthy();
    expect(within(stores).getByText(/display settings/)).toBeTruthy();
    const now = within(stores).getByText('Saved in this browser now').parentElement!;
    expect(now.textContent).toMatch(/Fit profile: T-Shirt, size L, saved 8 Mar 2026/);
    expect(now.textContent).toMatch(/2 saved results in history/);
  });

  it('explains what is not stored and how the camera is processed', () => {
    renderAt(PATHS.privacy);
    const notStored = section('What SizerAI does not store').textContent!;
    expect(notStored).toMatch(/Camera frames, photos or video/);
    expect(notStored).toMatch(/segmentation mask/);
    expect(notStored).toMatch(/joint positions and outline edge positions are not part of the saved profile or history/);
    const camera = section('Camera processing').textContent!;
    expect(camera).toMatch(/video only, no microphone/);
    expect(camera).toMatch(/analysed in this browser/);
    expect(camera).toMatch(/not saved with your profile or history/);
    expect(camera).toMatch(/browser vendor’s online voice service/);
    const where = section('Where your saved data lives').textContent!;
    expect(where).toMatch(/local storage on this device/);
    expect(where).toMatch(/does not encrypt/);
    expect(where).toMatch(/Clearing this site’s data/);
  });
});

describe('Privacy Center — navigation', () => {
  it('opens from the Profile page (saved profile)', async () => {
    const router = renderAt(PATHS.profile);
    // An action button with the other profile actions, plus a link in the privacy note.
    const links = screen.getAllByRole('link', { name: 'Privacy Center' });
    expect(links).toHaveLength(2);
    expect(links.some((l) => l.classList.contains('button'))).toBe(true);
    await act(async () => fireEvent.click(links.find((l) => l.classList.contains('button'))!));
    expect(router.state.location.pathname).toBe(PATHS.privacy);
  });

  it('opens from the Profile page empty state', async () => {
    useAppStore.setState({ fitProfile: null, scanHistory: [] });
    const router = renderAt(PATHS.profile);
    const links = screen.getAllByRole('link', { name: 'Privacy Center' });
    expect(links.length).toBeGreaterThanOrEqual(1);
    await act(async () => fireEvent.click(links[links.length - 1]));
    expect(router.state.location.pathname).toBe(PATHS.privacy);
  });
});

describe('Privacy Center — delete saved data', () => {
  it('asks for confirmation and Cancel keeps everything', () => {
    renderAt(PATHS.privacy);
    const open = screen.getByRole('button', { name: 'Delete All Saved Data' });
    fireEvent.click(open);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete all saved SizerAI data?' });
    expect(within(dialog).getByText(/Your saved fit profile and local scan history will be removed from this browser\. This action cannot be undone\./)).toBeTruthy();
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete All Saved Data' }));
    expect(useAppStore.getState().fitProfile).toEqual(profile);
    expect(useAppStore.getState().scanHistory).toHaveLength(2);
  });

  it('deletes the profile and history with the existing store action, and nothing else', async () => {
    localStorage.setItem('another-app', 'keep me');
    const confirmed = { clothingType: 't-shirt' } as never;
    useAppStore.setState({ measurements: confirmed });
    const original = useAppStore.getState().deleteFitProfile;
    const deleteSpy = vi.fn(original);
    useAppStore.setState({ deleteFitProfile: deleteSpy });
    const router = renderAt(PATHS.privacy);
    fireEvent.click(screen.getByRole('button', { name: 'Delete All Saved Data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Data' }));
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    const message = screen.getByText('Your saved SizerAI data has been deleted from this browser.');
    expect(message.getAttribute('role')).toBe('status');
    expect(document.activeElement).toBe(message);
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
    // Saved data gone, in memory and in storage.
    expect(useAppStore.getState()).toMatchObject({ fitProfile: null, scanHistory: [] });
    expect(persisted()).toMatchObject({ fitProfile: null, scanHistory: [], theme: 'dark', heightUnit: 'ft-in', weightUnit: 'lb', voiceGuidance: false });
    // Unrelated data untouched: other storage keys, display settings, the current session's measurements.
    expect(localStorage.getItem('another-app')).toBe('keep me');
    expect(useAppStore.getState().measurements).toBe(confirmed);
    expect(section('What SizerAI stores').textContent).toMatch(/No saved fit profile or history\./);
    // Profile shows the empty state, without the history.
    useAppStore.setState({ deleteFitProfile: original, measurements: null });
    await act(async () => router.navigate(PATHS.profile));
    expect(screen.getByRole('heading', { name: 'No saved fit profile yet' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Measurement History' })).toBeNull();
    expect(screen.queryByText(/Nike/)).toBeNull();
  });

  it('shows that nothing is saved when there is no saved data', () => {
    useAppStore.setState({ fitProfile: null, scanHistory: [] });
    renderAt(PATHS.privacy);
    expect(screen.getByText('No saved SizerAI data found on this browser.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('works with older stored profiles and history (no brand, preference or measurement snapshots)', async () => {
    const olderProfile: Partial<FitProfile> = { ...profile };
    delete olderProfile.brand;
    delete olderProfile.fitPreference;
    localStorage.setItem('sizerai-settings', JSON.stringify({ state: { fitProfile: olderProfile, scanHistory: [oldRecord], theme: 'dark' }, version: 2 }));
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().fitProfile).toMatchObject({ brand: 'generic', fitPreference: 'regular' });
    expect(useAppStore.getState().scanHistory).toEqual([oldRecord]);
    renderAt(PATHS.privacy);
    expect(screen.getByText('Saved in this browser now').parentElement!.textContent).toMatch(/size L.*1 saved result in history/);
    fireEvent.click(screen.getByRole('button', { name: 'Delete All Saved Data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Data' }));
    expect(useAppStore.getState()).toMatchObject({ fitProfile: null, scanHistory: [] });
  });

  it('a history without a profile can still be deleted', () => {
    useAppStore.setState({ fitProfile: null, scanHistory: [oldRecord] });
    renderAt(PATHS.privacy);
    fireEvent.click(screen.getByRole('button', { name: 'Delete All Saved Data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Data' }));
    expect(useAppStore.getState().scanHistory).toEqual([]);
  });
});
