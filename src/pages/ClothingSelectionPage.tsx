import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PATHS } from '../routes/paths';
import { pageTitle } from '../utils/constants';
import './ClothingSelectionPage.css';

/** Placeholder so the User Information step has a destination. Clothing Selection is built in a later step. */
export function ClothingSelectionPage() {
  useDocumentTitle(pageTitle('Clothing selection'));

  return (
    <section className="placeholder-page" aria-labelledby="clothing-title">
      <h1 id="clothing-title" className="placeholder-page__title">
        Clothing selection
      </h1>
      <p className="placeholder-page__text">This step is coming next.</p>
      <Button to={PATHS.userInfo} variant="secondary">
        <ArrowLeft aria-hidden="true" size={18} />
        Back to your details
      </Button>
    </section>
  );
}
