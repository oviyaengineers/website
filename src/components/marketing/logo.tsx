function GearTeeth({
  cx,
  cy,
  radius,
  count,
  toothW,
  toothH,
  color,
}: {
  cx: number;
  cy: number;
  radius: number;
  count: number;
  toothW: number;
  toothH: number;
  color: string;
}) {
  const teeth = Array.from({ length: count }, (_, i) => {
    const angleDeg = 180 + (i * 180) / (count - 1);
    const angle = (angleDeg * Math.PI) / 180;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    const rotate = angleDeg + 90;
    return (
      <rect
        key={i}
        x={x - toothW / 2}
        y={y - toothH}
        width={toothW}
        height={toothH}
        fill={color}
        transform={`rotate(${rotate} ${x} ${y})`}
      />
    );
  });
  return <>{teeth}</>;
}

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  const INK = "#4b4fa0";
  return (
    <svg
      viewBox="0 0 44 44"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* half-gear */}
      <path
        d="M6 21.5 A16 16 0 0 1 38 21.5 Z"
        fill="none"
        stroke={INK}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <GearTeeth cx={22} cy={21.5} radius={16} count={12} toothW={2.6} toothH={4} color={INK} />

      {/* abstract figure mark */}
      <path
        d="M22 25.5c1.6 0 2.7-1.3 2.7-2.9 0-1.5-1.2-2.4-2.7-2.4s-2.7.9-2.7 2.4c0 1.6 1.1 2.9 2.7 2.9Z"
        fill={INK}
      />
      <path
        d="M12 36.5 21 27.5 22 26.5 23 27.5 32 36.5"
        fill="none"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="39.5" r="1.6" fill={INK} />
    </svg>
  );
}
