interface GaugeProps {
  value: number;
  min: number;
  max: number;
  unit?: string;
  decimals?: number;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

// 180° (sol) -> 0° (sağ), üstten geçen yarım daire
function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const start = polar(cx, cy, r, fromDeg);
  const end = polar(cx, cy, r, toDeg);
  const largeArc = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
  // büyük açıdan küçük açıya (saat yönünde) -> sweep 1
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export default function Gauge({ value, min, max, unit = "", decimals = 0 }: GaugeProps) {
  const span = max - min || 1;
  const frac = Math.max(0, Math.min(1, (value - min) / span));
  const valueAngle = 180 - frac * 180;

  const cx = 70;
  const cy = 70;
  const r = 56;

  // Renk: orta=yeşil, uçlar=kırmızı/turuncu (basit eşik)
  const color = frac > 0.85 || frac < 0.05 ? "#ef4444" : frac > 0.7 ? "#f59e0b" : "#22c55e";

  return (
    <svg
      viewBox="0 0 140 90"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full max-h-[120px]"
    >
      <path d={arcPath(cx, cy, r, 180, 0)} fill="none" stroke="#e5e7eb" strokeWidth={10} strokeLinecap="round" />
      <path d={arcPath(cx, cy, r, 180, valueAngle)} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
      <text x={cx} y={cy - 4} textAnchor="middle" className="fill-gray-800" style={{ fontSize: 20, fontWeight: 700 }}>
        {value.toFixed(decimals)}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" className="fill-gray-400" style={{ fontSize: 10 }}>
        {unit}
      </text>
    </svg>
  );
}
