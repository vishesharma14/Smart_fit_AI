import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import type { ScanQuality } from '../../types/scanQuality';
import { fadeUpItem } from '../../utils/motion';
import { LEVEL_LABELS } from '../../utils/scanQuality/scanQuality';
import './ScanQualityCard.css';

/** Informational scan-quality summary (Step 14): score, level, the measured factors and tips for weak ones. */
export function ScanQualityCard({ quality }: { quality: ScanQuality }) {
  const { score, level, factors, recommendations, cappedBecause } = quality;
  const shown = factors.filter((f) => f.score !== null);
  return (
    <motion.section className="scan-quality" data-level={level} aria-labelledby="scan-quality-title" variants={fadeUpItem}>
      <div className="scan-quality__head">
        <div>
          <h2 id="scan-quality-title" className="scan-quality__title">
            Scan Quality
          </h2>
          <p className="scan-quality__level">{LEVEL_LABELS[level]}</p>
        </div>
        <p className="scan-quality__score" aria-label={`Scan quality ${score} out of 100, ${LEVEL_LABELS[level]}`}>
          <span className="scan-quality__value">{score}</span>
          <span className="scan-quality__max"> / 100</span>
        </p>
      </div>

      <ul className="scan-quality__factors" aria-label="Scan quality factors">
        {shown.map((f) => (
          <li key={f.id} className="scan-quality__factor" data-weak={f.score! < 75 ? 'true' : 'false'}>
            <div className="scan-quality__factor-row">
              <span className="scan-quality__factor-label">{f.label}</span>
              <span className="scan-quality__factor-score">{f.score}</span>
            </div>
            <div className="scan-quality__bar" role="presentation">
              <span className="scan-quality__bar-fill" style={{ width: `${f.score}%` }} />
            </div>
            <span className="scan-quality__factor-detail">{f.detail}</span>
          </li>
        ))}
      </ul>

      {cappedBecause && <p className="scan-quality__note">{cappedBecause} The score is limited to Fair.</p>}

      {recommendations.length > 0 && (
        <div className="scan-quality__tips">
          <p className="scan-quality__tips-title">
            <Lightbulb aria-hidden="true" size={16} /> To improve your next scan
          </p>
          <ul>
            {recommendations.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="scan-quality__note">
        Calculated on this device from how clearly each view was captured. It does not change your measurements or
        your size.
      </p>
    </motion.section>
  );
}
