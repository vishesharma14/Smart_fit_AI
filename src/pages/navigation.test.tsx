// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import { HomePage } from './HomePage';
import { NotFoundPage } from './NotFoundPage';
import { ProfilePage } from './ProfilePage';

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
beforeEach(() => useAppStore.setState({ fitProfile: null, scanHistory: [] }));
afterEach(cleanup);

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: PATHS.home, element: <HomePage /> },
      { path: PATHS.userInfo, element: <h1>Details page</h1> },
      { path: PATHS.profile, element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('navigation', () => {
  it('Get Started leads to the details step; no profile link without a saved profile', async () => {
    const router = renderAt(PATHS.home);
    expect(screen.queryByRole('link', { name: /My Fit Profile/ })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('link', { name: /Get Started/ })));
    expect(router.state.location.pathname).toBe(PATHS.userInfo);
  });

  it('shows My Fit Profile on the welcome page once a profile is saved', async () => {
    useAppStore.setState({
      fitProfile: {
        id: 'a|t-shirt', garment: 't-shirt', size: 'M', fit: 'good-fit', fitPreference: 'regular', brand: 'generic', measuredAt: '2026-01-01T00:00:00.000Z',
        savedAt: '2026-01-01T00:01:00.000Z', alternativeSize: null, basedOnUncertain: false, chartName: 'chart',
        confirmedAt: '2026-01-01T00:00:30.000Z', measurements: [],
      },
    });
    const router = renderAt(PATHS.home);
    await act(async () => fireEvent.click(screen.getByRole('link', { name: /My Fit Profile/ })));
    expect(router.state.location.pathname).toBe(PATHS.profile);
    expect(screen.getByLabelText('Size M')).toBeTruthy();
  });

  it('unknown addresses show a not-found page with a way back', async () => {
    const router = renderAt('/no-such-page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('link', { name: /Go to the start/ })));
    expect(router.state.location.pathname).toBe(PATHS.home);
  });
});
