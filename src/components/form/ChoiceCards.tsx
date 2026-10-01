import { useId, type ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, type LucideProps } from 'lucide-react';
import './ChoiceCards.css';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: ComponentType<LucideProps>;
}

interface ChoiceCardsProps<T extends string> {
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  onBlur?: () => void;
  /** id applied to the first radio, so a FormField label/error can target the group. */
  firstId?: string;
  describedBy?: string;
  invalid?: boolean;
  /**
   * Radio group name. Pass the same name to several ChoiceCards to make them
   * one group (single selection, arrow keys move across all of them).
   */
  name?: string;
  className?: string;
}

/**
 * Single-choice selectable cards. Uses native radio inputs, so Tab enters the
 * group and arrow keys move between options. Wrap in a FormField with `group`.
 */
export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  onBlur,
  firstId,
  describedBy,
  invalid,
  name: sharedName,
  className,
}: ChoiceCardsProps<T>) {
  const generatedName = useId();
  const name = sharedName ?? generatedName;

  return (
    <div className={['choice-cards', invalid ? 'choice-cards--invalid' : '', className].filter(Boolean).join(' ')}>
      {options.map((option, index) => {
        const checked = option.value === value;
        const Icon = option.icon;
        return (
          <label key={option.value} className="choice-card">
            <input
              id={index === 0 ? firstId : undefined}
              className="choice-card__input visually-hidden"
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              onBlur={onBlur}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
            <span className="choice-card__body">
              {Icon && (
                <span className="choice-card__icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
              )}
              <span className="choice-card__text">
                <span className="choice-card__label">{option.label}</span>
                {option.description && <span className="choice-card__description">{option.description}</span>}
              </span>
              <span className="choice-card__check" aria-hidden="true">
                <AnimatePresence initial={false}>
                  {checked && (
                    <motion.span
                      className="choice-card__check-mark"
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Check size={14} strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
