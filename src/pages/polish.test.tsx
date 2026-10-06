// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RootLayout } from '../layouts/RootLayout';
import { PATHS } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import { DemoScanPage } from './DemoScanPage';
import { HomePage } from './HomePage';
import { RouteErrorPage } from './RouteErrorPage';

function Broken(): never {
  throw new Error('Internal detail: something exploded at line 42');
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: PATHS.home,
        element: <RootLayout />,
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: PATHS.demoScan, element: <DemoScanPage /> },
          { path: PATHS.userInfo, element: <h1>Details page</h1> },
          { path: '/broken', element: <Broken /> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  useAppStore.setState({ demoMode: false, fitProfile: null, scanHistory: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('final polish', () => {
  it('Welcome shows the tagline, an honest description, Start New Scan as primary and Try Demo Mode as secondary', () => {
    renderAt(PATHS.home);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Perfect Fit. Powered by AI.');
    expect(screen.getByText(/Estimate clothing-relevant measurements from a guided camera scan/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/guarantee|tailor-level|clinically/i);
    const start = screen.getByRole('link', { name: /Start New Scan/ });
    const demo = screen.getByRole('button', { name: /Try Demo Mode/ });
    expect(start.className).toMatch(/button--primary/);
    expect(demo.className).toMatch(/button--secondary/);
  });

  it('shows a friendly error page without technical details when a page fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderAt('/broken');
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reload Page/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the start' }).getAttribute('href')).toBe(PATHS.home);
    expect(document.body.textContent).not.toMatch(/Internal detail|line 42|Unexpected Application Error/);
  });

  it('the demo scan page outside Demo Mode offers Try Demo Mode and Start New Scan (no dead end)', async () => {
    const router = renderAt(PATHS.demoScan);
    expect(screen.getByRole('link', { name: 'Start New Scan' }).getAttribute('href')).toBe(PATHS.userInfo);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Try Demo Mode/ })));
    expect(useAppStore.getState().demoMode).toBe(true);
    expect(router.state.location.pathname).toBe(PATHS.userInfo);
    useAppStore.getState().exitDemoMode();
  });
});
