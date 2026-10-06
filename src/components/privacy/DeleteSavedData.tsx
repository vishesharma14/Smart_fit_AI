import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, Trash2 } from 'lucide-react';
import { Button } from '../Button';
import './PrivacyCenter.css';

interface DeleteSavedDataProps {
  /** Whether a saved fit profile or saved history exists in this browser. */
  hasSavedData: boolean;
  /** The app's existing deletion (the fit slice's `deleteFitProfile`): removes the fit profile and its history. */
  onDelete: () => void;
}

type Phase = 'idle' | 'confirming' | 'deleted';

/**
 * "Delete your saved data" (Step 17): a two-step deletion of the saved fit profile and its history, reusing the
 * existing store action. Focus moves to Cancel when the confirmation opens, back to the button on Cancel, and to the
 * confirmation message after deleting.
 */
export function DeleteSavedData({ hasSavedData, onDelete }: DeleteSavedDataProps) {
  const id = useId();
  const [phase, setPhase] = useState<Phase>('idle');
  const previousPhase = useRef<Phase>('idle');
  const ids = { open: `${id}-open`, cancel: `${id}-cancel`, done: `${id}-done`, title: `${id}-title`, text: `${id}-text` };

  useEffect(() => {
    const target =
      phase === 'confirming' ? ids.cancel : phase === 'deleted' ? ids.done : previousPhase.current === 'confirming' ? ids.open : null;
    previousPhase.current = phase;
    if (target) document.getElementById(target)?.focus();
  }, [phase, ids.cancel, ids.done, ids.open]);

  if (phase === 'deleted') {
    return (
      <p id={ids.done} className="privacy-status-message" role="status" tabIndex={-1}>
        <CircleCheck aria-hidden="true" size={20} />
        Your saved SizerAI data has been deleted from this browser.
      </p>
    );
  }

  if (!hasSavedData) {
    return <p className="privacy-status-message privacy-status-message--empty">No saved SizerAI data found on this browser.</p>;
  }

  if (phase === 'confirming') {
    return (
      <div className="privacy-confirm" role="alertdialog" aria-modal="false" aria-labelledby={ids.title} aria-describedby={ids.text}>
        <p id={ids.title} className="privacy-confirm__title">
          <Trash2 aria-hidden="true" size={18} />
          Delete all saved SizerAI data?
        </p>
        <p id={ids.text} className="result-card__text">
          Your saved fit profile and local scan history will be removed from this browser. This action cannot be undone.
        </p>
        <div className="privacy-confirm__buttons">
          <Button id={ids.cancel} variant="secondary" onClick={() => setPhase('idle')}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            className="privacy-confirm__delete"
            onClick={() => {
              onDelete();
              setPhase('deleted');
            }}
          >
            <Trash2 aria-hidden="true" size={18} />
            Delete Data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="privacy-delete-action">
      <Button id={ids.open} variant="secondary" size="lg" className="privacy-confirm__delete" onClick={() => setPhase('confirming')}>
        <Trash2 aria-hidden="true" size={20} />
        Delete All Saved Data
      </Button>
    </div>
  );
}
