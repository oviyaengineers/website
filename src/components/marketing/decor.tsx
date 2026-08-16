// Shared decorative visuals for the marketing site — pure inline SVG / CSS gradients,
// no external image dependencies. Server components (no interactivity).

export function GridGlow({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-amber-500/20 blur-[120px]" />
      <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px]" />
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.07]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

/** Abstract circuit-board style linework, used as a hero-side illustration. */
export function CircuitIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 480"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="circuitStroke" x1="0" y1="0" x2="480" y2="480" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id="circuitGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="240" cy="240" r="220" fill="url(#circuitGlow)" />

      {/* Outer isometric gear ring */}
      <g opacity="0.9">
        <circle cx="240" cy="240" r="150" stroke="url(#circuitStroke)" strokeWidth="1.5" strokeDasharray="2 10" />
        <circle cx="240" cy="240" r="110" stroke="#3f3f46" strokeWidth="1" />
      </g>

      {/* Circuit traces */}
      <g stroke="url(#circuitStroke)" strokeWidth="2" strokeLinecap="round">
        <path d="M60 120 H180 V80" />
        <path d="M420 360 H300 V400" />
        <path d="M60 360 H140 V300" />
        <path d="M420 120 H340 V180" />
        <path d="M240 40 V90" />
        <path d="M240 440 V390" />
      </g>
      <g fill="#22d3ee">
        <circle cx="60" cy="120" r="5" />
        <circle cx="420" cy="360" r="5" />
        <circle cx="60" cy="360" r="5" />
        <circle cx="420" cy="120" r="5" />
      </g>
      <g fill="#fbbf24">
        <circle cx="180" cy="80" r="4" />
        <circle cx="300" cy="400" r="4" />
        <circle cx="140" cy="300" r="4" />
        <circle cx="340" cy="180" r="4" />
      </g>

      {/* Central gear/hex nut motif */}
      <g transform="translate(240 240)">
        <polygon
          points="0,-70 60,-35 60,35 0,70 -60,35 -60,-35"
          fill="none"
          stroke="url(#circuitStroke)"
          strokeWidth="2.5"
        />
        <circle r="34" fill="#09090b" stroke="#f59e0b" strokeWidth="2" />
        <circle r="10" fill="#f59e0b" />
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * Math.PI) / 4;
          const x1 = Math.cos(angle) * 34;
          const y1 = Math.sin(angle) * 34;
          const x2 = Math.cos(angle) * 46;
          const y2 = Math.sin(angle) * 46;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
          );
        })}
      </g>
    </svg>
  );
}

/** Small isometric-cube dot pattern used to add texture to section backgrounds. */
export function DotGrid({ className = "" }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <pattern id="dotgrid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.3" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dotgrid)" />
    </svg>
  );
}
