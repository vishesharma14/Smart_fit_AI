import { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { ClothingType, FitPreference } from '../types/domain';
import {
  type ClothingSelectionDraft,
  type ClothingSelectionErrors,
  type ClothingSelectionField,
  defaultFitFor,
  fitsFor,
  validateClothingSelection,
} from '../utils/clothingCatalog';

export interface UseClothingSelectionForm {
  draft: ClothingSelectionDraft;
  /** Fit options for the selected item; empty when nothing is selected or fit does not apply. */
  availableFits: FitPreference[];
  /** Errors are shown only after the user tries to continue. */
  visibleErrors: ClothingSelectionErrors;
  selectType: (type: ClothingType) => void;
  selectFit: (fit: FitPreference) => void;
  /** Saves to the store when valid. Returns the first invalid field, or null on success. */
  submit: () => ClothingSelectionField | null;
}

/** Form state for the Clothing Selection step. Restores and saves the selection in the user slice. */
export function useClothingSelectionForm(): UseClothingSelectionForm {
  const saved = useAppStore((s) => s.clothingSelection);
  const setClothingSelection = useAppStore((s) => s.setClothingSelection);

  const [draft, setDraft] = useState<ClothingSelectionDraft>(() => ({
    type: saved?.type ?? null,
    // Regular Fit is preselected so nobody is blocked; a saved choice is restored.
    fit: saved?.type ? defaultFitFor(saved.type, saved.fit) : null,
  }));
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const { errors, value } = useMemo(() => validateClothingSelection(draft), [draft]);

  const selectType = (type: ClothingType) => {
    setDraft((prev) => ({ type, fit: defaultFitFor(type, prev.fit) }));
  };

  const selectFit = (fit: FitPreference) => {
    setDraft((prev) => ({ ...prev, fit }));
  };

  const submit = () => {
    setSubmitAttempted(true);
    if (!value) return errors.type ? 'type' : 'fit';
    setClothingSelection(value);
    return null;
  };

  return {
    draft,
    availableFits: fitsFor(draft.type),
    visibleErrors: submitAttempted ? errors : {},
    selectType,
    selectFit,
    submit,
  };
}
