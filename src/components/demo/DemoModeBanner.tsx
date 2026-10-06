import { FlaskConical, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PATHS } from '../../routes/paths';
import { useAppStore } from '../../store/useAppStore';
import { DEMO_NOTICE } from '../../utils/demo/demoData';
import './demo.css';

/** Small "DEMO MODE" label for cards and headings (Step 18). */
export function DemoBadge({ label = 'Demo Mode' }: { label?: string }) {
  return (
    <span className="demo-badge">
      <FlaskConical aria-hidden="true" size={14} />
      {label}
    </span>
  );
}

/** Shown at the top of every page while Demo Mode is active, with a way out. */
export function DemoModeBanner() {
  const demoMode = useAppStore((s) => s.demoMode);
  const exitDemoMode = useAppStore((s) => s.exitDemoMode);
  const navigate = useNavigate();
  if (!demoMode) return null;
  return (
    <aside className="demo-banner" aria-label="Demo Mode">
      <p className="demo-banner__text">
        <DemoBadge />
        <span>{DEMO_NOTICE}</span>
      </p>
      <button
        type="button"
        className="demo-banner__exit"
        onClick={() => {
          exitDemoMode();
          navigate(PATHS.home);
        }}
      >
        <LogOut aria-hidden="true" size={16} />
        Exit Demo Mode
      </button>
    </aside>
  );
}
