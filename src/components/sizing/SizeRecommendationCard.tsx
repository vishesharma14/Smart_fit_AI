import { motion } from 'framer-motion';
import type { SizeRecommendation } from '../../types/sizing';
import { getClothingItem } from '../../utils/clothingCatalog';
import { FIT_LABELS } from '../../utils/sizing/recommendSize';
import { fadeUpItem } from '../../utils/motion';
import './SizeRecommendationCard.css';

const STATUS_TITLES: Record<Exclude<SizeRecommendation['status'], 'recommended'>, string> = {
  'insufficient-data': 'Insufficient measurements',
  'outside-range': 'No size on this chart fits',
  unsupported: 'No recommendation available',
};

/** Shows a size recommendation from the rule-based engine (Step 10). Presentation only. */
export function SizeRecommendationCard({ recommendation }: { recommendation: SizeRecommendation }) {
  const { status, size, fit, alternativeSize, measurementsUsed, reason, chartName, garment, basedOnUncertain } = recommendation;
  const garmentLabel = garment ? getClothingItem(garment).label : null;

  return (
    <motion.section className="size-rec" aria-labelledby="size-rec-title" data-status={status} variants={fadeUpItem}>
      <h2 id="size-rec-title" className="size-rec__title">
        Size recommendation{garmentLabel ? ` · ${garmentLabel}` : ''}
      </h2>

      {status === 'recommended' && size ? (
        <div className="size-rec__result">
          <p className="size-rec__size" aria-label={`Recommended size ${size}`}>
            {size}
          </p>
          <div className="size-rec__fit">
            <span className="size-rec__fit-pill" data-fit={fit}>
              {FIT_LABELS[fit]}
            </span>
            {alternativeSize && <span className="size-rec__alt">Also consider {alternativeSize}</span>}
            {basedOnUncertain && <span className="size-rec__alt">Based on estimated measurements</span>}
          </div>
        </div>
      ) : (
        <p className="size-rec__unavailable">
          <span className="size-rec__fit-pill" data-fit={fit}>
            {FIT_LABELS[fit]}
          </span>{' '}
          {STATUS_TITLES[status as keyof typeof STATUS_TITLES]}
        </p>
      )}

      <p className="size-rec__reason">{reason}</p>

      {measurementsUsed.length > 0 && (
        <dl className="size-rec__used">
          {measurementsUsed.map((m) => (
            <div key={m.id}>
              <dt>{m.label}</dt>
              <dd>
                {m.valueCm.toLocaleString('en', { maximumFractionDigits: 1 })} cm
                {m.manuallyEdited ? ' (edited by you)' : m.status === 'uncertain' ? ' (uncertain)' : ''}
                {m.sizeForMeasurement ? ` → ${m.sizeForMeasurement}` : ''}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="size-rec__note">
        {chartName ? `${chartName}. ` : ''}A rule-based comparison of your measurements with a generic size chart, not a
        brand's chart and not a machine-learning prediction. Sizes vary between brands.
      </p>
    </motion.section>
  );
}
