import { motion } from 'framer-motion';
import { ArrowRight, FlaskConical, Shirt, Sparkles, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { PATHS, WELCOME_NEXT_PATH } from '../routes/paths';
import { useAppStore } from '../store/useAppStore';
import { APP_DESCRIPTION, pageTitle } from '../utils/constants';
import { EASE_OUT, fadeUpItem as item, staggerContainer as container } from '../utils/motion';
import './HomePage.css';

const START_UNAVAILABLE_NOTE_ID = 'start-unavailable-note';

/** Welcome page: brand introduction and entry point into the SizerAI flow. */
export function HomePage() {
  useDocumentTitle(pageTitle());
  const hasSavedProfile = useAppStore((s) => s.fitProfile !== null);
  const enterDemoMode = useAppStore((s) => s.enterDemoMode);
  const exitDemoMode = useAppStore((s) => s.exitDemoMode);
  const navigate = useNavigate();

  return (
    <div className="welcome">
      <motion.div className="welcome__brand" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <BrandLogo />
      </motion.div>

      <section className="welcome__hero" aria-labelledby="welcome-title">
        <motion.div className="welcome__copy" variants={container} initial="hidden" animate="visible">
          <motion.p className="welcome__eyebrow" variants={item}>
            <Sparkles aria-hidden="true" size={16} strokeWidth={2} />
            On-device AI body scan
          </motion.p>

          <motion.h1 id="welcome-title" className="welcome__title" variants={item}>
            Perfect Fit.
            <span className="welcome__title-accent"> Powered by AI.</span>
          </motion.h1>

          <motion.p className="welcome__description" variants={item}>
            {APP_DESCRIPTION}
          </motion.p>

          <motion.div className="welcome__actions" variants={item}>
            {WELCOME_NEXT_PATH ? (
              <>
                {/* The normal flow always starts outside Demo Mode. */}
                <Button to={WELCOME_NEXT_PATH} size="lg" onClick={exitDemoMode}>
                  Get Started
                  <ArrowRight aria-hidden="true" size={20} />
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  aria-describedby="welcome-demo-note"
                  onClick={() => {
                    enterDemoMode();
                    navigate(PATHS.userInfo);
                  }}
                >
                  <FlaskConical aria-hidden="true" size={20} />
                  Try Demo Mode
                </Button>
                {hasSavedProfile && (
                  <Button to={PATHS.profile} variant="secondary" size="lg">
                    <UserRound aria-hidden="true" size={20} />
                    My Fit Profile
                  </Button>
                )}
                <p id="welcome-demo-note" className="welcome__note">
                  Demo Mode shows the full journey with fixed sample data — no camera needed.
                </p>
              </>
            ) : (
              <>
                <Button size="lg" aria-disabled="true" aria-describedby={START_UNAVAILABLE_NOTE_ID}>
                  Get Started
                  <ArrowRight aria-hidden="true" size={20} />
                </Button>
                <p id={START_UNAVAILABLE_NOTE_ID} className="welcome__note">
                  The next step is coming soon.
                </p>
              </>
            )}
          </motion.div>
        </motion.div>

        <motion.div
          className="welcome__visual"
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }}
        >
          <div className="welcome__orb welcome__orb--primary" />
          <div className="welcome__orb welcome__orb--secondary" />
          <div className="welcome__ring welcome__ring--outer" />
          <div className="welcome__ring welcome__ring--inner" />
          <div className="welcome__glass">
            <Shirt size={56} strokeWidth={1.25} />
          </div>
        </motion.div>
      </section>
    </div>
  );
}
