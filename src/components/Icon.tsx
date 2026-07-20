import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  } as const;
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 3.2c.5 0 .9 0 1.3.1l.5-1.2 1.6.7-.3 1.3c.7.5 1.2 1 1.6 1.7l1.3-.2.5 1.7-1.2.6a5 5 0 0 1 0 2.2l1.1.6-.6 1.6-1.3-.2a5 5 0 0 1-1.6 1.6l.2 1.3-1.6.6-.6-1.2a5 5 0 0 1-2.2 0l-.6 1.2-1.6-.6.2-1.3a5 5 0 0 1-1.6-1.6l-1.3.2-.6-1.6 1.1-.6a5 5 0 0 1 0-2.2l-1.1-.6.5-1.7 1.3.2c.4-.7 1-1.3 1.6-1.7l-.3-1.3 1.6-.7.5 1.2c.4-.1.9-.1 1.3-.1Z" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.75" />
      <path d="M13.4 1.9v2.7h-2.7" />
    </svg>
  );
}

export function HouseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.8 6.8 8 2.4l5.2 4.4" />
      <path d="M4 6.6v6h8v-6" />
    </svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.6 11.6l3.2-3.4 2.6 2 4.8-5" />
      <path d="M13.2 8.4V5.2H10" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.6c.5 2.6 1.4 3.5 4 4-2.6.5-3.5 1.4-4 4-.5-2.6-1.4-3.5-4-4 2.6-.5 3.5-1.4 4-4Z" />
      <path d="M12.6 10.6c.2 1.1.6 1.5 1.7 1.7-1.1.2-1.5.6-1.7 1.7-.2-1.1-.6-1.5-1.7-1.7 1.1-.2 1.5-.6 1.7-1.7Z" />
    </svg>
  );
}

/** The Orbit mark: a ring with a small satellite dot. */
export function OrbitMark({ size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      {...props}
    >
      <defs>
        <linearGradient id="orbit-mark-g" x1="2" y1="2" x2="18" y2="18">
          <stop offset="0" stopColor="var(--claude-1, #e67d22)" />
          <stop offset="0.5" stopColor="var(--codex-3, #8188ff)" />
          <stop offset="1" stopColor="var(--antigravity-4, #55bc70)" />
        </linearGradient>
      </defs>
      <circle
        cx="10"
        cy="10"
        r="6.6"
        stroke="url(#orbit-mark-g)"
        strokeWidth="2.4"
      />
      <circle cx="15.7" cy="4.6" r="2.1" fill="var(--codex-4, #596af7)" />
    </svg>
  );
}
