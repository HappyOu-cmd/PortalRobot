import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const dotVariants = cva('inline-block shrink-0 rounded-full', {
  variants: {
    status: {
      success: 'bg-[#25a45a]',
      warning: 'bg-[#e0a22d]',
      danger: 'bg-[#d84949]',
      info: 'bg-[#2678df]',
      off: 'bg-[#aab4bd]',
    },
    size: {
      sm: 'size-2',
      md: 'size-2.5',
      lg: 'size-3',
    },
  },
  defaultVariants: {
    status: 'off',
    size: 'md',
  },
});

export interface StatusIndicatorProps extends VariantProps<typeof dotVariants> {
  label: string;
  value?: string;
  className?: string;
}

export function StatusIndicator({ status, size, label, value, className }: StatusIndicatorProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 text-sm text-[#667b8c]', className)} role="status" aria-label={value ? `${label}: ${value}` : label}>
      <span className={dotVariants({ status, size })} aria-hidden="true" />
      <span className="truncate">{label}</span>
      {value ? <strong className="truncate font-semibold text-[#203b50]">{value}</strong> : null}
    </span>
  );
}
