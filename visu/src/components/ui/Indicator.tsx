export type IndicatorTone = 'green' | 'blue' | 'red' | 'amber';

export interface IndicatorProps {
  active: boolean;
  tone?: IndicatorTone;
}

export function Indicator({ active, tone = 'green' }: IndicatorProps) {
  return <span className={`indicator ${active ? tone : 'off'}`} aria-hidden="true" />;
}
