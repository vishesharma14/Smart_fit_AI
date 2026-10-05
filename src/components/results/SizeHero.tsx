import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { ClothingType } from '../../types/domain';
import type { FitStatus, SizeLabel } from '../../types/sizing';
import { getClothingItem } from '../../utils/clothingCatalog';
import { fadeUpItem } from '../../utils/motion';
import { FIT_LABELS } from '../../utils/sizing/recommendSize';
import './results.css';

interface SizeHeroProps {
  titleId: string;
  /** Small label above the size, e.g. "Recommended size". */
  eyebrow: string;
  garment: ClothingType | null;
  size: SizeLabel | null;
  fit: FitStatus;
  alternativeSize?: SizeLabel | null;
  basedOnUncertain?: boolean;
  /** Shown instead of a size when there is none. */
  emptyTitle?: string;
  children?: ReactNode;
}

/** The headline result: garment, size (never invented — `emptyTitle` when there is none) and fit. */
export function SizeHero({ titleId, eyebrow, garment, size, fit, alternativeSize, basedOnUncertain, emptyTitle, children }: SizeHeroProps) {
  const garmentLabel = garment ? getClothingItem(garment).label : 'No garment selected';
  return (
    <motion.section className="result-hero" aria-labelledby={titleId} data-has-size={size ? 'true' : 'false'} variants={fadeUpItem}>
      <div className="result-hero__main">
        {size ? (
          <p className="result-hero__size" aria-label={`Size ${size}`}>
            {size}
          </p>
        ) : (
          <p className="result-hero__size result-hero__size--none" aria-hidden="true">
            –
          </p>
        )}
        <div className="result-hero__text">
          <p className="result-hero__eyebrow">{eyebrow}</p>
          <h2 id={titleId} className="result-hero__garment">
            {size ? garmentLabel : (emptyTitle ?? 'No size available')}
          </h2>
          {!size && garment && <p className="result-hero__sub">{garmentLabel}</p>}
          <div className="result-hero__tags">
            <span className="result-pill" data-fit={fit}>
              {FIT_LABELS[fit]}
            </span>
            {alternativeSize && <span className="result-tag">Also consider {alternativeSize}</span>}
            {basedOnUncertain && <span className="result-tag">Based on estimated measurements</span>}
          </div>
        </div>
      </div>
      {children}
    </motion.section>
  );
}
