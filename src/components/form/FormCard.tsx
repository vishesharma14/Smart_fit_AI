import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { fadeUpItem } from '../../utils/motion';
import './FormCard.css';

interface FormCardProps {
  titleId: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/** Glass section card with a titled header. Reveals with the parent form's stagger. */
export function FormCard({ titleId, title, subtitle, children }: FormCardProps) {
  return (
    <motion.section className="form-card" aria-labelledby={titleId} variants={fadeUpItem} exit="hidden">
      <header className="form-card__header">
        <h2 id={titleId} className="form-card__title">
          {title}
        </h2>
        {subtitle && <p className="form-card__subtitle">{subtitle}</p>}
      </header>
      {children}
    </motion.section>
  );
}
