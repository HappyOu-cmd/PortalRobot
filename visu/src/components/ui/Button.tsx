import { Icon, type IconProps } from '@iconify/react';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border px-4 text-sm font-semibold tracking-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1769d2]/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#dfe5e9] disabled:bg-[#f3f5f6] disabled:text-[#a8b2ba]',
  {
    variants: {
      variant: {
        primary: 'border-[#1769d2] bg-[#1769d2] text-white hover:border-[#0f56b2] hover:bg-[#0f56b2]',
        secondary: 'border-[#cfd9e0] bg-white text-[#344d60] hover:border-[#9fb2c0] hover:bg-[#f7f9fa]',
        success: 'border-[#38a968] bg-white text-[#1f9855] hover:border-[#238b51] hover:text-[#187c45]',
        danger: 'border-[#d96369] bg-white text-[#c83f46] hover:border-[#bd454c] hover:text-[#ad3037]',
        ghost: 'border-transparent bg-transparent text-[#52697b] hover:bg-[#edf2f5] hover:text-[#203b50]',
      },
      size: {
        sm: 'min-h-9 px-3 text-xs',
        md: 'min-h-11 px-4 text-sm',
        lg: 'min-h-[52px] px-5 text-[15px]',
        icon: 'size-11 min-h-11 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  icon?: IconProps['icon'];
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, icon, loading = false, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : icon ? <Icon icon={icon} width="20" height="20" aria-hidden="true" /> : null}
      {children}
    </button>
  ),
);

Button.displayName = 'Button';
