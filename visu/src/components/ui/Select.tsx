import checkIcon from '@iconify-icons/mdi/check';
import chevronDownIcon from '@iconify-icons/mdi/chevron-down';
import { Icon } from '@iconify/react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}

export function Select({ value, defaultValue, onValueChange, options, placeholder = 'Выберите значение', disabled, ariaLabel, className }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn('inline-flex min-h-11 min-w-52 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[#cfd9e0] bg-white px-3.5 text-sm text-[#263f53] outline-none hover:border-[#9fb2c0] focus-visible:border-[#1769d2] focus-visible:ring-2 focus-visible:ring-[#1769d2]/20 disabled:cursor-not-allowed disabled:bg-[#f3f5f6] disabled:text-[#a8b2ba]', className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild><Icon icon={chevronDownIcon} width="20" height="20" className="text-[#667b8c]" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="z-[115] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-control)] border border-[#cfd9e0] bg-white shadow-[0_10px_28px_rgba(25,50,71,0.14)]">
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled} className="relative flex min-h-10 cursor-default select-none items-center rounded-[3px] py-2 pl-9 pr-3 text-sm text-[#263f53] outline-none data-[disabled]:text-[#a8b2ba] data-[highlighted]:bg-[#edf4fb] data-[highlighted]:text-[#1769d2]">
                <SelectPrimitive.ItemIndicator className="absolute left-3 inline-flex items-center"><Icon icon={checkIcon} width="18" height="18" /></SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
