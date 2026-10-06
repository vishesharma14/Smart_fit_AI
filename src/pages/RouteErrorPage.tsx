import { RotateCcw } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PATHS } from '../routes/paths';
import { pageTitle } from '../utils/constants';
import { MAIN_CONTENT_ID } from '../layouts/RootLayout';
import '../layouts/RootLayout.css';
import { NotFoundPage } from './NotFoundPage';
import './NotFoundPage.css';

/**
 * Shown when a page fails unexpectedly, instead of the router's default screen with a stack trace. The technical
 * error is only logged to the browser console (for developers); users get a plain explanation and a way back.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  useDocumentTitle(pageTitle('Something went wrong'));
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <main id={MAIN_CONTENT_ID} className="root-layout__main" tabIndex={-1}>
        <NotFoundPage />
      </main>
    );
  }
  console.error(error);
  return (
    <main id={MAIN_CONTENT_ID} className="root-layout__main" tabIndex={-1}>
      <div className="not-found">
        <BrandLogo />
        <section className="not-found__card" aria-labelledby="route-error-title">
          <h1 id="route-error-title" className="not-found__title">
            Something went wrong
          </h1>
          <p className="not-found__text">
            This page couldn’t be shown. Your saved fit profile is not affected. Reload the page or go back to the start.
          </p>
          <div className="not-found__actions">
            <Button size="lg" onClick={() => window.location.reload()}>
              <RotateCcw aria-hidden="true" size={20} />
              Reload Page
            </Button>
            <Button to={PATHS.home} variant="secondary" size="lg">
              Go to the start
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
