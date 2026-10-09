import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

export function AnimatedPresence({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const contentRef = useRef<ReactElement<{ className?: string }> | null>(
    isValidElement(children) ? children as ReactElement<{ className?: string }> : null,
  );
  if (isValidElement(children)) contentRef.current = children as ReactElement<{ className?: string }>;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    setExiting(true);
    const timeoutId = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
      contentRef.current = null;
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [open, mounted]);

  if (!mounted || !contentRef.current) return null;
  const child = contentRef.current;
  return cloneElement(child, {
    className: `${child.props.className ?? ''} ios-motion${exiting ? ' ios-motion-exiting' : ''}`.trim(),
  });
}
