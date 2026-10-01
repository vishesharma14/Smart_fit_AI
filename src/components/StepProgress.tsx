import { motion } from 'framer-motion';
import './StepProgress.css';

interface StepProgressProps {
  /** 1-based index of the current step. */
  current: number;
  total: number;
  /** Name of the current step, e.g. "Your details". */
  label: string;
}

/** Compact "Step X of Y" indicator with a segmented bar. */
export function StepProgress({ current, total, label }: StepProgressProps) {
  return (
    <div className="step-progress">
      <p className="step-progress__text">
        <span className="step-progress__count">
          Step {current} of {total}
        </span>
        <span className="step-progress__label">{label}</span>
      </p>
      <div className="step-progress__bar" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className="step-progress__segment">
            {index < current && (
              <motion.span
                className="step-progress__fill"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.6, delay: 0.2 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
