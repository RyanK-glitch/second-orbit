import type { SVGProps } from "react";

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
});

export const SearchIcon = ({ size = 18 }) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
);
export const CartIcon = ({ size = 22 }) => (
  <svg {...base(size)}><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" /><circle cx="10" cy="20.5" r="1.3" /><circle cx="17" cy="20.5" r="1.3" /></svg>
);
export const MenuIcon = ({ size = 22 }) => (
  <svg {...base(size)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const UserIcon = ({ size = 22 }) => (
  <svg {...base(size)}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
);
export const ChatIcon = ({ size = 22 }) => (
  <svg {...base(size)}><path d="M4 5h16v11H8l-4 4z" /></svg>
);
export const ShieldIcon = ({ size = 24 }) => (
  <svg {...base(size)}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
);
export const GradeIcon = ({ size = 24 }) => (
  <svg {...base(size)}><circle cx="12" cy="9" r="6" /><path d="M8.5 14L7 21l5-3 5 3-1.5-7" /></svg>
);
export const AlertIcon = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.5" /></svg>
);
export const CheckIcon = ({ size = 32 }) => (
  <svg {...base(size)} strokeWidth={2.4}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const BadgeIcon = ({ size = 14 }) => (
  <svg {...base(size)} strokeWidth={2.4}><path d="M12 2l2.6 2.2 3.4-.3.8 3.3 2.9 1.8-1.4 3.1 1.4 3.1-2.9 1.8-.8 3.3-3.4-.3L12 22l-2.6-2.2-3.4.3-.8-3.3-2.9-1.8 1.4-3.1-1.4-3.1 2.9-1.8.8-3.3 3.4.3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
);
export const ChevronLeft = ({ size = 20 }) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M15 5l-7 7 7 7" /></svg>
);
export const ChevronRight = ({ size = 20 }) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M9 5l7 7-7 7" /></svg>
);
export const TruckIcon = ({ size = 20 }) => (
  <svg {...base(size)}><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>
);
export const HeartIcon = ({ size = 20, filled = false }) => (
  <svg {...base(size)} fill={filled ? "currentColor" : "none"}><path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z" /></svg>
);
export const FilterIcon = ({ size = 18 }) => (
  <svg {...base(size)}><path d="M4 6h16M7 12h10M10 18h4" /></svg>
);
export const UploadIcon = ({ size = 22 }) => (
  <svg {...base(size)}><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" /></svg>
);
export const FlagIcon = ({ size = 16 }) => (
  <svg {...base(size)}><path d="M5 21V4h11l-2 4 2 4H5" /></svg>
);
export const SunIcon = ({ size = 22 }) => (
  <svg {...base(size)} className="icon-sun"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const MoonIcon = ({ size = 22 }) => (
  <svg {...base(size)} className="icon-moon"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);
