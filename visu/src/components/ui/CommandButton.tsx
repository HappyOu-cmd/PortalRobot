import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

const commandButtonVariants = cva('command-button', {
  variants: {
    tone: {
      primary: 'primary',
      stop: 'stop',
      neutral: 'neutral',
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
});

export interface CommandButtonProps extends VariantProps<typeof commandButtonVariants> {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

export function CommandButton({ label, icon: Icon, tone = 'neutral', onClick }: CommandButtonProps) {
  return <button className={cn(commandButtonVariants({ tone }))} onClick={onClick} type="button"><Icon size={18} /><span>{label}</span></button>;
}
