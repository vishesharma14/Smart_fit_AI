import type { InputHTMLAttributes } from 'react';
import './TextInput.css';

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  /** Unit or short text shown inside the field, e.g. "cm". */
  suffix?: string;
  invalid?: boolean;
  className?: string;
}

/** Styled text input with an optional unit suffix. */
export function TextInput({ suffix, invalid, className, ...inputProps }: TextInputProps) {
  return (
    <div className={['text-input', invalid ? 'text-input--invalid' : '', className].filter(Boolean).join(' ')}>
      <input className="text-input__control" aria-invalid={invalid || undefined} {...inputProps} />
      {suffix && (
        <span className="text-input__suffix" aria-hidden="true">
          {suffix}
        </span>
      )}
    </div>
  );
}
