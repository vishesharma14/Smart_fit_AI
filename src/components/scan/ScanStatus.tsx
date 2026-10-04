import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, CircleCheck, Info, ScanLine, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { GuidanceTone, ScanGuidance } from '../../utils/scanGuidance';
import './ScanStatus.css';

const TONE_ICON: Record<GuidanceTone, LucideIcon> = {
  neutral: Info,
  info: ScanLine,
  warning: TriangleAlert,
  success: CircleCheck,
  error: CircleAlert,
};

/** Current scan guidance (with auto-capture progress when holding). Announced politely to screen readers when it changes. */
export function ScanStatus({ guidance }: { guidance: ScanGuidance }) {
  const Icon = TONE_ICON[guidance.tone];
  return (
    <div className={`scan-status scan-status--${guidance.tone}`} role="status" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={guidance.title}
          className="scan-status__content"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          <span className="scan-status__icon" aria-hidden="true">
            <Icon size={20} strokeWidth={2} />
          </span>
          <span className="scan-status__text">
            <span className="scan-status__title">{guidance.title}</span>
            <span className="scan-status__detail">{guidance.detail}</span>
          </span>
        </motion.div>
      </AnimatePresence>
      {guidance.progress !== undefined && (
        // Auto-capture hold progress. Decorative: the title already says a capture is in progress.
        <span className="scan-status__progress" aria-hidden="true">
          <span className="scan-status__progress-fill" style={{ transform: `scaleX(${guidance.progress})` }} />
        </span>
      )}
    </div>
  );
}
