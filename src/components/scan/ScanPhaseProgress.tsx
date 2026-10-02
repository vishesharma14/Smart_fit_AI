import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { ScanPhaseId, ScanPhaseStatus } from '../../types/scan';
import { SCAN_PHASES } from '../../utils/scanPhases';
import './ScanPhaseProgress.css';

const STATUS_TEXT: Record<ScanPhaseStatus, string> = {
  pending: 'Not started',
  active: 'In progress',
  captured: 'Captured',
};

interface ScanPhaseProgressProps {
  phases: Record<ScanPhaseId, ScanPhaseStatus>;
}

/** Ordered list of scan angles with their status (✓ only for angles the pose model confirmed). */
export function ScanPhaseProgress({ phases }: ScanPhaseProgressProps) {
  return (
    <ol className="scan-phases" aria-label="Scan angles">
      {SCAN_PHASES.map((phase) => {
        const status = phases[phase.id];
        return (
          <li
            key={phase.id}
            className={`scan-phases__item scan-phases__item--${status}`}
            aria-current={status === 'active' ? 'step' : undefined}
          >
            <span className="scan-phases__marker" aria-hidden="true">
              {status === 'captured' && <Check size={14} strokeWidth={3} />}
              {status === 'active' && (
                <motion.span
                  className="scan-phases__dot"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.25 }}
                />
              )}
            </span>
            <span className="scan-phases__label">{phase.label}</span>
            <span className="scan-phases__status">{STATUS_TEXT[status]}</span>
          </li>
        );
      })}
    </ol>
  );
}
