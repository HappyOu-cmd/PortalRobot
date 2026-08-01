import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '../../lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...props }, ref) => <TabsPrimitive.List ref={ref} className={cn('inline-flex min-h-11 items-center border-b border-[#d8e3ea]', className)} {...props} />,
);
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn('relative min-h-11 border-0 bg-transparent px-5 text-sm font-medium text-[#667b8c] outline-none transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-transparent hover:text-[#203b50] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1769d2]/30 data-[state=active]:text-[#1769d2] data-[state=active]:after:bg-[#1769d2] disabled:cursor-not-allowed disabled:text-[#a8b2ba]', className)}
      {...props}
    />
  ),
);
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({ className, ...props }, ref) => <TabsPrimitive.Content ref={ref} className={cn('pt-5 outline-none focus-visible:ring-2 focus-visible:ring-[#1769d2]/30', className)} {...props} />,
);
TabsContent.displayName = 'TabsContent';
