import './magazine-calibration.css';

export function MagazineCalibrationPreview({ rows, columns, selected, configured }: {
  rows: number;
  columns: number;
  selected: number;
  configured: readonly boolean[];
}) {
  const safeRows = Math.max(2, Math.min(12, rows));
  const safeColumns = Math.max(2, Math.min(10, columns));
  const pitch = 14;
  const left = 28;
  const top = 24;
  const width = (safeColumns - 1) * pitch;
  const height = (safeRows - 1) * pitch;
  const right = left + width;
  const bottom = top + height;
  const references = [
    { x: left, y: bottom, slot: 1, name: 'A', textY: bottom + 18, anchor: 'start' as const },
    { x: right, y: bottom, slot: safeColumns, name: 'B', textY: bottom + 18, anchor: 'end' as const },
    { x: left, y: top, slot: (safeRows - 1) * safeColumns + 1, name: 'C', textY: 10, anchor: 'start' as const },
  ];
  const selectedReference = references[selected];
  return <svg className="magazine-calibration-preview" viewBox={`0 0 ${width + 56} ${height + 48}`} role="img"
    aria-label={`Опорные слоты A, B и C${selectedReference ? `. Выбран слот ${selectedReference.slot}` : ''}`}>
    <rect className="magazine-calibration-preview__outline" x={left - 8} y={top - 8} width={width + 16} height={height + 16} rx="3" />
    <path className="magazine-calibration-preview__guides" d={`M${left} ${top}V${bottom}H${right}`} />
    <g key={`${safeRows}x${safeColumns}`}>
      {Array.from({ length: safeRows * safeColumns }, (_, index) => <g key={index}
        className="magazine-calibration-preview__slot"
        style={{ animationDelay: `${(Math.floor(index / safeColumns) + index % safeColumns) * 16}ms` }}>
        <title>{`Слот ${index + 1}`}</title>
        <circle cx={left + (index % safeColumns) * pitch}
          cy={bottom - Math.floor(index / safeColumns) * pitch} r="2" />
      </g>)}
    </g>
    {references.map((reference, index) => <g key={reference.name} className={index === selected ? 'selected' : configured[index] ? 'configured' : ''}>
      <title>{`${reference.name} · слот ${reference.slot}`}</title>
      {index === selected && <circle cx={reference.x} cy={reference.y} r="6.5" className="magazine-calibration-preview__halo" />}
      <circle cx={reference.x} cy={reference.y} r="4.5" className="magazine-calibration-preview__reference" />
      <circle cx={reference.x} cy={reference.y} r="1.4" className="magazine-calibration-preview__reference-core" />
      <text x={reference.x} y={reference.textY} textAnchor={reference.anchor}>{reference.name} · {reference.slot}</text>
    </g>)}
  </svg>;
}
