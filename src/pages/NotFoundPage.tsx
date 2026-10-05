import { ArrowRight } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PATHS } from '../routes/paths';
import { pageTitle } from '../utils/constants';
import './NotFoundPage.css';

/** Shown for any unknown address. */
export function NotFoundPage() {
  useDocumentTitle(pageTitle('Page not found'));
  return (
    <div className="not-found">
      <BrandLogo />
      <section className="not-found__card" aria-labelledby="not-found-title">
        <h1 id="not-found-title" className="not-found__title">
          Page not found
        </h1>
        <p className="not-found__text">This address doesn’t exist in SizerAI.</p>
        <div className="not-found__actions">
          <Button to={PATHS.home} size="lg">
            Go to the start
            <ArrowRight aria-hidden="true" size={20} />
          </Button>
          <Button to={PATHS.profile} variant="secondary" size="lg">
            My Fit Profile
          </Button>
        </div>
      </section>
    </div>
  );
}
