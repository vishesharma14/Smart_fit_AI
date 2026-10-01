import type { Variants } from 'framer-motion';

/** Shared easing and entrance variants so every page animates the same way. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Parent that reveals its `fadeUpItem` children one after another. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};

export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
};
