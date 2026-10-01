import { useId, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert } from 'lucide-react';
import './FormField.css';

export interface FieldControlProps {
  /** id for the primary control (use on the <input>, or the first input in a group). */
  id: string;
  /** Space-separated ids of the hint and error, for aria-describedby. */
  describedBy: string | undefined;
  invalid: boolean;
}

interface FormFieldProps {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  /** Render as <fieldset>/<legend> when the field contains several controls (radio cards, ft + in). */
  group?: boolean;
  /** Extra control shown next to the label, e.g. a unit switch. */
  labelAction?: ReactNode;
  /** Explicit id for the primary control; generated when omitted. */
  controlId?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/** Label, hint and accessible error message around one form control or control group. */
export function FormField({ label, optional, hint, error, group, labelAction, controlId, children }: FormFieldProps) {
  const generatedId = useId();
  const id = controlId ?? `${generatedId}-control`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;
  const describedBy = [hintId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  const labelContent = (
    <>
      {label}
      {optional && <span className="form-field__optional"> (optional)</span>}
    </>
  );

  const Wrapper = group ? 'fieldset' : 'div';

  return (
    <Wrapper className={['form-field', error ? 'form-field--invalid' : ''].filter(Boolean).join(' ')}>
      {/* A <legend> must be the fieldset's first child; the visible label below is decorative for groups. */}
      {group && <legend className="visually-hidden">{label}{optional ? ' (optional)' : ''}</legend>}
      <div className="form-field__header">
        {group ? (
          <span className="form-field__label" aria-hidden="true">
            {labelContent}
          </span>
        ) : (
          <label className="form-field__label" htmlFor={id}>
            {labelContent}
          </label>
        )}
        {labelAction}
      </div>

      {hint && (
        <p id={hintId} className="form-field__hint">
          {hint}
        </p>
      )}

      {children({ id, describedBy, invalid: Boolean(error) })}

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            key="error"
            id={errorId}
            className="form-field__error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            <CircleAlert aria-hidden="true" size={16} strokeWidth={2} />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </Wrapper>
  );
}
