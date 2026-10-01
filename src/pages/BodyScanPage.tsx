import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PATHS } from '../routes/paths';
import { pageTitle } from '../utils/constants';
import './BodyScanPage.css';

/** Placeholder so Clothing Selection has a destination. Body Scan is built in a later step. */
export function BodyScanPage() {
  useDocumentTitle(pageTitle('Body scan'));

  return (
    <section className="placeholder-page" aria-labelledby="body-scan-title">
      <h1 id="body-scan-title" className="placeholder-page__title">
        Body scan
      </h1>
      <p className="placeholder-page__text">Body Scan is the next step. It is not available yet.</p>
      <Button to={PATHS.clothing} variant="secondary">
        <ArrowLeft aria-hidden="true" size={18} />
        Back to clothing selection
      </Button>
    </section>
  );
}
