import type { MeasurementStatus } from '../../types/measurement';
import { confidenceLevel } from '../../utils/measurement/review';

export interface MeasurementListItem {
  id: string;
  name: string;
  valueCm: number;
  status: MeasurementStatus;
  confidence: number | null;
  manuallyEdited: boolean;
  /** Optional trailing note, e.g. "→ M". */
  note?: string;
}

const formatCm = (cm: number) => `${cm.toLocaleString('en', { maximumFractionDigits: 1 })} cm`;

/** Compact list of measurements with value, confidence and whether the user edited it. */
export function MeasurementList({ items, label }: { items: MeasurementListItem[]; label: string }) {
  return (
    <ul className="result-measurements" aria-label={label}>
      {items.map((m) => {
        const level = m.confidence === null ? null : confidenceLevel({ confidence: m.confidence, status: m.status });
        const detail = m.manuallyEdited
          ? 'Edited by you'
          : [m.status === 'uncertain' ? 'Estimate' : null, level ? `${level} confidence` : null].filter(Boolean).join(' · ');
        return (
          <li key={m.id} className="result-measurements__item" data-status={m.status}>
            <span className="result-measurements__name">{m.name}</span>
            <span className="result-measurements__value">
              {formatCm(m.valueCm)}
              {m.note && <span className="result-measurements__note"> {m.note}</span>}
            </span>
            {detail && <span className="result-measurements__detail">{detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}
