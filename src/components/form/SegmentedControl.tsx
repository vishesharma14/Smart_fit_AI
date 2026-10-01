import { useId } from 'react';
import { motion } from 'framer-motion';
import './SegmentedControl.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Accessible label when the visible label is an abbreviation. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name for the whole control, e.g. "Height unit". */
  legend: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Compact switch between a few options. Built on native radio inputs for keyboard and screen-reader support. */
export function SegmentedControl<T extends string>({ legend, options, value, onChange }: SegmentedControlProps<T>) {
  const name = useId();

  return (
    <fieldset className="segmented">
      <legend className="visually-hidden">{legend}</legend>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label key={option.value} className="segmented__option">
            <input
              className="segmented__input visually-hidden"
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              aria-label={option.ariaLabel}
            />
            {checked && (
              <motion.span
                className="segmented__indicator"
                layoutId={`${name}-indicator`}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="segmented__label">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
