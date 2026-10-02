import type { SVGProps } from "react";

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 18 18",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 3.5v11M3.5 9h11" />
  </svg>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
  </svg>
);

export const ExpandIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 7V3h4M11 3h4v4M15 11v4h-4M7 15H3v-4" />
  </svg>
);

export const CollapseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 3v4H3M15 7h-4V3M11 15v-4h4M3 11h4v4" />
  </svg>
);

export const ShutterIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="2.5" y="4.5" width="13" height="10" rx="1" />
    <circle cx="9" cy="9.5" r="2.8" />
    <path d="M6.5 4.5l1-2h3l1 2" />
  </svg>
);

export const OrbitIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <ellipse cx="9" cy="9" rx="6.5" ry="2.6" />
    <path d="M14.2 4.8l1.3 1.1-1.6.6" />
    <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const RecentreIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="9" cy="9" r="4.5" />
    <path d="M9 1.5v3M9 13.5v3M1.5 9h3M13.5 9h3" />
  </svg>
);
