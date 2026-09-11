import React from 'react';

/** Ícones SVG inline (sem dependências externas — funcionam offline). */
const wrap = (children, viewBox = '0 0 24 24', width = 18, height = 18) => (
  <svg
    viewBox={viewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width={width}
    height={height}
    style={{ display: 'inline-flex', flexShrink: 0 }}
  >
    {children}
  </svg>
);

export const Icon = {
  home: () => wrap(<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />),
  dashboard: () => wrap(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  school: () => wrap(<><path d="M3 21h18" /><path d="M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>),
  program: () => wrap(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><circle cx="12" cy="10" r="3" /></>),
  indicator: () => wrap(<><circle cx="12" cy="12" r="9" /><path d="m14 8-4 4" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></>),
  result: () => wrap(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h4" /></>),
  goal: () => wrap(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>),
  trophy: () => wrap(<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 5M17 6h3a3 3 0 0 1-3 5" /></>),
  analytics: () => wrap(<><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></>),
  chart: () => wrap(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>),
  report: () => wrap(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15h6M9 11h2" /></>),
  upload: () => wrap(<><circle cx="12" cy="12" r="10" /><path d="m16 12-4-4-4 4" /><path d="M12 16V8" /></>),
  users: () => wrap(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  shield: () => wrap(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>),
  audit: () => wrap(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>),
  bell: () => wrap(<><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  user: () => wrap(<><circle cx="12" cy="8" r="4" /><path d="M6 20v-1a6 6 0 0 1 12 0v1" /></>),
  settings: () => wrap(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  search: () => wrap(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  download: () => wrap(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>),
  plus: () => wrap(<>+</>),
  edit: () => wrap(<><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></>),
  trash: () => wrap(<><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>),
  check: () => wrap(<path d="m5 13 4 4L19 7" />),
  clock: () => wrap(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  doc: () => wrap(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>),
  filter: () => wrap(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />),
  lock: () => wrap(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  logout: () => wrap(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>),
  chevronDown: () => wrap(<polyline points="6 9 12 15 18 9" />, '0 0 24 24', 16, 16),
  chevronUp: () => wrap(<polyline points="18 15 12 9 6 15" />, '0 0 24 24', 16, 16),
  book: () => wrap(<><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-0-5H20" /></>),
  bulb: () => wrap(<><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.3 4.7 3.2 6h7.6c1.9-1.3 3.2-3.5 3.2-6a7 7 0 0 0-7-7z" /></>),
  cpeLogo: () => (
    <svg viewBox="0 0 36 36" fill="none" width="28" height="28" style={{ display: 'inline-flex' }}>
      <circle cx="18" cy="18" r="17" fill="url(#cpe-grad)" />
      <path
        d="M23 12.5C21.8 11.5 20 11 18 11C13.6 11 10.5 14.1 10.5 18C10.5 21.9 13.6 25 18 25C20 25 21.8 24.5 23 23.5"
        stroke="#ffffff"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="18" cy="18" r="3.2" fill="#38bdf8" />
      <defs>
        <linearGradient id="cpe-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" />
          <stop offset="1" stopColor="#0284c7" />
        </linearGradient>
      </defs>
    </svg>
  ),
};

