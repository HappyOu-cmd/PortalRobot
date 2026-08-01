export interface RingStatProps {
  value: number;
  total: number;
  tone: 'blue' | 'green';
  label: string;
}

export function RingStat({ value, total, tone, label }: RingStatProps) {
  const percent = total > 0 ? Math.round(value / total * 100) : 0;
  const circumference = 2 * Math.PI * 44;

  return (
    <div className={`ring-stat ${tone}`}>
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <circle className="track" cx="52" cy="52" r="44" />
        <circle className="value" cx="52" cy="52" r="44" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} />
      </svg>
      <div><strong>{percent}%</strong><span>{value} из {total}</span></div>
      <p>{label}</p>
    </div>
  );
}
