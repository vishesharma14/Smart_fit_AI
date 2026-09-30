import './SkipLink.css';

interface SkipLinkProps {
  targetId: string;
  label?: string;
}

/** Lets keyboard users jump past repeated navigation to the main content. */
export function SkipLink({ targetId, label = 'Skip to main content' }: SkipLinkProps) {
  return (
    <a className="skip-link" href={`#${targetId}`}>
      {label}
    </a>
  );
}
