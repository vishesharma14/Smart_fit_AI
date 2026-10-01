import { createLucideIcon, Shirt } from 'lucide-react';

/*
 * Lucide has no icons for these garments, so they are drawn on Lucide's
 * 24×24 grid and created with its own factory. They render and accept props
 * exactly like built-in Lucide icons (size, strokeWidth, className…).
 */

/** Short-sleeve tee — Lucide's built-in shirt icon. */
export const TShirtIcon = Shirt;

/** Long-sleeve, collared button-up shirt. */
export const ButtonShirtIcon = createLucideIcon('sizer-button-shirt', [
  ['path', { d: 'M8 3 4.5 4.6 2 13l3 .7 1-4.2V21h12V9.5l1 4.2 3-.7-2.5-8.4L16 3', key: 'body' }],
  ['path', { d: 'm8 3 2 4 2-1.6L14 7l2-4', key: 'collar' }],
  ['path', { d: 'M12 5.4V21', key: 'placket' }],
]);

/** Five-pocket jeans. */
export const JeansIcon = createLucideIcon('sizer-jeans', [
  ['path', { d: 'M6 3h12l1 18h-5l-2-11-2 11H5z', key: 'body' }],
  ['path', { d: 'M6.2 6.5h11.6', key: 'waistband' }],
  ['path', { d: 'M8.5 6.5c0 1.6-.8 2.6-2.4 2.9', key: 'pocket-left' }],
  ['path', { d: 'M15.5 6.5c0 1.6.8 2.6 2.4 2.9', key: 'pocket-right' }],
]);

/** Tailored trousers with pressed creases. */
export const TrousersIcon = createLucideIcon('sizer-trousers', [
  ['path', { d: 'M6.5 3h11l1 18h-4.5L12 9.5 10 21H5.5z', key: 'body' }],
  ['path', { d: 'M6.6 6h10.8', key: 'waistband' }],
  ['path', { d: 'm8.6 9-.6 9', key: 'crease-left' }],
  ['path', { d: 'm15.4 9 .6 9', key: 'crease-right' }],
]);

/** Single-breasted blazer with lapels. */
export const BlazerIcon = createLucideIcon('sizer-blazer', [
  ['path', { d: 'M8 3 4.5 4.6 3 21h18L19.5 4.6 16 3', key: 'body' }],
  ['path', { d: 'm8 3 4 9 4-9', key: 'lapels' }],
  ['path', { d: 'M12 12v9', key: 'front' }],
  ['path', { d: 'M12 15h.01', key: 'button-1' }],
  ['path', { d: 'M12 18h.01', key: 'button-2' }],
]);
