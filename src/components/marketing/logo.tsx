export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="oe-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="55%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path
        d="M20 1.5 36.7 11v18L20 38.5 3.3 29V11L20 1.5Z"
        fill="url(#oe-logo-grad)"
      />
      <path
        d="M20 1.5 36.7 11v18L20 38.5 3.3 29V11L20 1.5Z"
        fill="none"
        stroke="#000"
        strokeOpacity="0.12"
        strokeWidth="0.75"
      />
      <text
        x="20"
        y="25.5"
        textAnchor="middle"
        fontFamily="ui-serif, Georgia, serif"
        fontWeight="800"
        fontSize="15"
        fill="#0a0a0a"
      >
        OE
      </text>
    </svg>
  );
}
