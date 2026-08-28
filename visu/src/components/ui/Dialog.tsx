import closeIcon from '@iconify-icons/mdi/close';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export interface DialogProps {
  title: ReactNode;
  description?: ReactNode;
  trigger?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function Dialog({ title, description, trigger, children, footer, open, defaultOpen, onOpenChange, className }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-[#162b3c]/30" />
        <DialogPrimitive.Content
          aria-describedby={description ? undefined : undefined}
          className={cn('touch-scroll-surface fixed left-1/2 top-1/2 z-[101] max-h-[calc(100vh-64px)] w-[min(680px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[var(--radius-panel)] border border-[#d8e3ea] bg-white text-[#193247] shadow-[0_18px_45px_rgba(25,50,71,0.18)] focus:outline-none', className)}
        >
          <header className="flex min-h-16 items-start justify-between gap-5 border-b border-[#e0e7ec] px-6 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="m-0 text-lg font-semibold tracking-normal text-[#193247]">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mb-0 mt-1 text-sm leading-5 text-[#718698]">{description}</DialogPrimitive.Description> : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" icon={closeIcon} aria-label="Закрыть окно" className="-mr-2 -mt-2 shrink-0" />
            </DialogPrimitive.Close>
          </header>
          <div className="px-6 py-5">{children}</div>
          {footer ? <footer className="flex min-h-16 items-center justify-end gap-3 border-t border-[#e0e7ec] px-6 py-3">{footer}</footer> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;
