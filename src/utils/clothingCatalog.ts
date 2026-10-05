import type { ClothingCategory, ClothingSelection, ClothingType, FitPreference } from '../types/domain';

export interface ClothingItemDefinition {
  type: ClothingType;
  category: ClothingCategory;
  label: string;
  description: string;
  /** Fit preferences that are meaningful for this item. Empty means fit is not asked. */
  fits: FitPreference[];
  /** Explains why some fits are not offered for this item. */
  fitNote?: string;
}

export interface ClothingCategoryDefinition {
  id: ClothingCategory;
  label: string;
}

export const CLOTHING_CATEGORIES: ClothingCategoryDefinition[] = [
  { id: 'tops', label: 'Tops' },
  { id: 'bottoms', label: 'Bottoms' },
  { id: 'formalwear', label: 'Formalwear' },
];

export const CLOTHING_ITEMS: ClothingItemDefinition[] = [
  {
    type: 't-shirt',
    category: 'tops',
    label: 'T-Shirt',
    description: 'Crew and V-neck tees for everyday wear.',
    fits: ['slim', 'regular', 'relaxed'],
  },
  {
    type: 'shirt',
    category: 'tops',
    label: 'Shirt',
    description: 'Button-up casual and dress shirts.',
    fits: ['slim', 'regular', 'relaxed'],
  },
  {
    type: 'jeans',
    category: 'bottoms',
    label: 'Jeans',
    description: 'Denim with a waist and inseam fit.',
    fits: ['slim', 'regular', 'relaxed'],
  },
  {
    type: 'trousers',
    category: 'bottoms',
    label: 'Trousers',
    description: 'Formal pants and tailored chinos.',
    fits: ['slim', 'regular'],
    fitNote: 'Oversized cuts are not offered for tailored trousers.',
  },
  {
    type: 'blazer',
    category: 'formalwear',
    label: 'Blazer',
    description: 'Tailored jackets for work and occasions.',
    fits: ['slim', 'regular'],
    fitNote: 'Oversized cuts are not offered for tailored blazers.',
  },
];

export interface FitDefinition {
  value: FitPreference;
  label: string;
  description: string;
}

export const FIT_DEFINITIONS: Record<FitPreference, FitDefinition> = {
  slim: { value: 'slim', label: 'Slim Fit', description: 'Closer to the body. Picks the smaller size when you are right at a size boundary.' },
  regular: { value: 'regular', label: 'Regular Fit', description: 'Classic, comfortable ease. The size your measurements fall in.' },
  relaxed: { value: 'relaxed', label: 'Relaxed Fit', description: 'Roomier. Picks the larger size when you are near the top of a size.' },
};

/** Fit preference used until the user picks another one (and for data saved before preferences existed). */
export const DEFAULT_FIT_PREFERENCE: FitPreference = 'regular';

export const FIT_PREFERENCES: readonly FitPreference[] = ['slim', 'regular', 'relaxed'];

export function isFitPreference(value: unknown): value is FitPreference {
  return (FIT_PREFERENCES as readonly unknown[]).includes(value);
}

export function getClothingItem(type: ClothingType): ClothingItemDefinition {
  const item = CLOTHING_ITEMS.find((candidate) => candidate.type === type);
  if (!item) throw new Error(`Unknown clothing type: ${type}`);
  return item;
}

export function fitsFor(type: ClothingType | null): FitPreference[] {
  return type ? getClothingItem(type).fits : [];
}

/** The fit to preselect for a clothing type: the current one if it still applies, else the default (Regular). */
export function defaultFitFor(type: ClothingType, current: FitPreference | null): FitPreference | null {
  const fits = fitsFor(type);
  if (current && fits.includes(current)) return current;
  return fits.includes(DEFAULT_FIT_PREFERENCE) ? DEFAULT_FIT_PREFERENCE : (fits[0] ?? null);
}

/** Keeps the fit only if it still applies to the newly selected clothing type. */
export function reconcileFit(type: ClothingType, fit: FitPreference | null): FitPreference | null {
  return fit && fitsFor(type).includes(fit) ? fit : null;
}

export type ClothingSelectionField = 'type' | 'fit';
export type ClothingSelectionErrors = Partial<Record<ClothingSelectionField, string>>;

export interface ClothingSelectionDraft {
  type: ClothingType | null;
  fit: FitPreference | null;
}

export function validateClothingSelection(draft: ClothingSelectionDraft): {
  errors: ClothingSelectionErrors;
  value: ClothingSelection | null;
} {
  if (!draft.type) return { errors: { type: 'Choose a clothing item to continue.' }, value: null };
  const fits = fitsFor(draft.type);
  if (fits.length > 0 && (!draft.fit || !fits.includes(draft.fit))) {
    return { errors: { fit: 'Choose your preferred fit.' }, value: null };
  }
  return { errors: {}, value: { type: draft.type, fit: fits.length > 0 ? draft.fit : null } };
}
