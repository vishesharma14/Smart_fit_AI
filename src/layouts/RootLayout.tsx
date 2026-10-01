import { Outlet, ScrollRestoration } from 'react-router';
import { SkipLink } from '../components/SkipLink';
import './RootLayout.css';

export const MAIN_CONTENT_ID = 'main-content';

/** Application shell shared by all routes. */
export function RootLayout() {
  return (
    <>
      <SkipLink targetId={MAIN_CONTENT_ID} />
      <main id={MAIN_CONTENT_ID} className="root-layout__main" tabIndex={-1}>
        <Outlet />
      </main>
      {/* Start each new page at the top; restore position on back/forward. */}
      <ScrollRestoration />
    </>
  );
}
