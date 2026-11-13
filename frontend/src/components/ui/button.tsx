import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'primary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'icon';

const variants: Record<Variant, string> = {
  default:
    'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.09] hover:text-white',
  primary:
    'border-transparent bg-accent/90 text-space-950 hover:bg-accent-soft shadow-glow',
  ghost: 'border-transparent bg-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white',
  outline: 'border-white/15 bg-transparent text-slate-200 hover:border-accent/50 hover:text-accent-soft',
  danger: 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[11px]',
  md: 'h-8 px-3 text-xs',
  icon: 'h-8 w-8 p-0',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-lg border font-medium transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
