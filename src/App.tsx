import { MotionConfig } from 'framer-motion';
import { RouterProvider } from 'react-router/dom';
import { router } from './routes/router';

export function App() {
  return (
    // Respect the user's OS-level "reduce motion" preference for all animations.
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}
