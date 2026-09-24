import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const Icons = {
  select: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 3.5l13 7.2-5.6 1.5 3.3 6.1-2.3 1.2-3.3-6.1L5.8 17z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  arrow: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 19L18 6" />
      <path d="M10 5.5h8.5V14" />
    </Svg>
  ),
  line: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5 19L19 5" />
    </Svg>
  ),
  rect: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="5.5" width="16" height="13" rx="1.5" />
    </Svg>
  ),
  ellipse: (p: IconProps) => (
    <Svg {...p}>
      <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
    </Svg>
  ),
  pen: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 17c2.5-5 4.5-9 6.5-9s1 6 3.5 6 2.5-4 6-7" />
    </Svg>
  ),
  highlight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14.5 4.5l5 5-8 8H6.5v-5z" />
      <path d="M4 20.5h16" strokeWidth="2.6" opacity="0.55" />
    </Svg>
  ),
  text: (p: IconProps) => (
    <Svg {...p}>
      <path d="M5.5 6V4.5h13V6M12 4.5v15M9 19.5h6" />
    </Svg>
  ),
  callout: (p: IconProps) => (
    <Svg {...p}>
      <path
        d="M5.5 4h13A2.5 2.5 0 0121 6.5v6a2.5 2.5 0 01-2.5 2.5h-6.2L6.5 20.5 8 15H5.5A2.5 2.5 0 013 12.5v-6A2.5 2.5 0 015.5 4z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M7.5 8.5h9M7.5 11.3h6" stroke="var(--icon-contrast, #fff)" strokeWidth="1.6" />
    </Svg>
  ),
  undo: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 13.5L4.5 9 9 4.5" />
      <path d="M4.5 9H14a5.5 5.5 0 010 11h-3" />
    </Svg>
  ),
  redo: (p: IconProps) => (
    <Svg {...p}>
      <path d="M15 13.5L19.5 9 15 4.5" />
      <path d="M19.5 9H10a5.5 5.5 0 000 11h3" />
    </Svg>
  ),
  trash: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l1 13h9l1-13" />
    </Svg>
  ),
  copy: (p: IconProps) => (
    <Svg {...p}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" />
    </Svg>
  ),
  save: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
      <path d="M5 16.5v2A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5v-2" />
    </Svg>
  ),
  front: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="9" width="10" height="10" rx="1.5" opacity="0.5" />
      <rect x="10" y="5" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    </Svg>
  ),
  back: (p: IconProps) => (
    <Svg {...p}>
      <rect x="10" y="5" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" opacity="0.5" />
      <rect x="4" y="9" width="10" height="10" rx="1.5" />
    </Svg>
  ),
  zoomIn: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 6v12M6 12h12" />
    </Svg>
  ),
  zoomOut: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 12h12" />
    </Svg>
  ),
  capture: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16" />
      <path d="M12 9v6M9 12h6" />
    </Svg>
  ),
  open: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3.5 7.5A1.5 1.5 0 015 6h4l2 2h8a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0119 19H5a1.5 1.5 0 01-1.5-1.5z" />
    </Svg>
  ),
  paste: (p: IconProps) => (
    <Svg {...p}>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 5V3.5h6V5M8.5 11h7M8.5 14.5h5" />
    </Svg>
  ),
  shield: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3l7 3v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z" />
      <path d="M12 8v5M12 16v.01" />
    </Svg>
  )
}
