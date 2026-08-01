import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

export interface TooltipProps {
  children: ReactElement;
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

export function Tooltip({ children, content, side = 'top', delayDuration = 350 }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[120] max-w-64 rounded-[4px] border border-[#344d60] bg-[#243b4d] px-3 py-2 text-xs leading-4 text-white shadow-[0_6px_18px_rgba(25,50,71,0.18)]">
            {content}
            <TooltipPrimitive.Arrow className="fill-[#243b4d]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
