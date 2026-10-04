import { AnimatePresence, motion } from 'framer-motion';
import type { ScanGuidance } from '../../utils/scanGuidance';
import './ScanInstruction.css';

/**
 * The single primary instruction, large and high-contrast over the camera
 * preview so it can be read from a scanning distance. Decorative for screen
 * readers: the status panel announces the same text.
 */
export function ScanInstruction({ guidance }: { guidance: ScanGuidance }) {
  return (
    <div className={`scan-instruction scan-instruction--${guidance.tone}`} aria-hidden="true">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={guidance.title}
          className="scan-instruction__text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {guidance.title}
        </motion.p>
      </AnimatePresence>
      {guidance.progress !== undefined && (
        <span className="scan-instruction__progress">
          <span className="scan-instruction__progress-fill" style={{ transform: `scaleX(${guidance.progress})` }} />
        </span>
      )}
    </div>
  );
}
