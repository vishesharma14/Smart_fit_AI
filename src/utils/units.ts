/** Unit conversion helpers. Canonical storage units are centimetres and kilograms. */

export const CM_PER_INCH = 2.54;
export const INCHES_PER_FOOT = 12;
export const LB_PER_KG = 2.2046226218;

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH;
}

/** Splits centimetres into whole feet and inches (inches rounded to one decimal). */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  let feet = Math.floor(totalInches / INCHES_PER_FOOT);
  let inches = roundTo(totalInches - feet * INCHES_PER_FOOT, 1);
  if (inches >= INCHES_PER_FOOT) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Parses user-typed numeric text. Accepts a comma as decimal separator.
 * Returns null for empty or non-numeric input.
 */
export function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '' || !/^\d*\.?\d+$|^\d+\.$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Formats a number for an input field without trailing zeros. */
export function formatForInput(value: number, decimals: number): string {
  return String(roundTo(value, decimals));
}
