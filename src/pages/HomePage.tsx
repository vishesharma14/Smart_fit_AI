import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { APP_NAME, APP_TAGLINE, pageTitle } from '../utils/constants';
import './HomePage.css';

/**
 * Temporary placeholder for "/". It only confirms that the application runs;
 * the real Welcome page is built in a later step.
 */
export function HomePage() {
  useDocumentTitle(pageTitle());

  return (
    <section className="home-page" aria-labelledby="home-title">
      <motion.div
        className="home-page__content"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <Sparkles className="home-page__icon" aria-hidden="true" size={28} strokeWidth={1.75} />
        <h1 id="home-title" className="home-page__title">
          {APP_NAME}
        </h1>
        <p className="home-page__tagline">{APP_TAGLINE}</p>
      </motion.div>
    </section>
  );
}
