import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary';
type ButtonSize = 'md' | 'lg';

interface CommonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

interface LinkButtonProps extends CommonProps {
  /** Router path. When set, the button renders as a navigation link. */
  to: string;
  /** Runs before navigating (e.g. to reset a mode). */
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

interface NativeButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> {
  to?: undefined;
}

export type ButtonProps = LinkButtonProps | NativeButtonProps;

function buttonClassName(variant: ButtonVariant, size: ButtonSize, extra?: string): string {
  return ['button', `button--${variant}`, `button--${size}`, extra].filter(Boolean).join(' ');
}

/** Shared button that renders as a router `<Link>` when `to` is given, otherwise a native `<button>`. */
export function Button({ children, variant = 'primary', size = 'md', className, ...rest }: ButtonProps) {
  const classes = buttonClassName(variant, size, className);

  if (rest.to !== undefined) {
    return (
      <Link to={rest.to} className={classes} onClick={rest.onClick}>
        {children}
      </Link>
    );
  }

  const { to: _to, type = 'button', ...buttonProps } = rest;
  return (
    <button type={type} className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
