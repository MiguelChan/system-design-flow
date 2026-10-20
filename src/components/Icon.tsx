import type {JSX} from 'react';

const ICONS = {
  source: (
    <>
      <path d="M9 20v-2a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v2M14.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M4 20v-2a5 5 0 0 1 3-4.6M6 4a3 3 0 0 0 0 6" />
    </>
  ),
  lb: (
    <>
      <path d="M4 12h5m0 0 5-7h6M9 12l5 7h6M18 3l2 2-2 2m0 10 2 2-2 2" />
    </>
  ),
  service: (
    <>
      <rect x="4" y="3" width="16" height="7" rx="2" />
      <rect x="4" y="14" width="16" height="7" rx="2" />
      <path d="M8 6.5h.01M8 17.5h.01M13 6.5h4m-4 11h4" />
    </>
  ),
  queue: (
    <>
      <rect x="3" y="5" width="5" height="14" rx="1" />
      <rect x="10" y="5" width="5" height="14" rx="1" />
      <path d="M18 5h3v14h-3M5.5 9v6m7-6v6" />
    </>
  ),
  cache: (
    <>
      <path d="m13 2-9 12h7l-1 8 10-13h-8z" />
    </>
  ),
  db: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
    </>
  ),
  sink: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8m-4-4v4m-5-10 3 3 6-6" />
    </>
  ),
  play: (
    <>
      <path d="m8 4 12 8-12 8z" />
    </>
  ),
  pause: (
    <>
      <path d="M8 4v16M16 4v16" />
    </>
  ),
  reset: (
    <>
      <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  burst: (
    <>
      <path d="m13 2-9 12h7l-1 8 10-13h-8z" />
    </>
  ),
  export: (
    <>
      <path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5" />
    </>
  ),
  import: (
    <>
      <path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8.5a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2.5M12 17h.01" />
    </>
  ),
  fit: (
    <>
      <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: (
    <>
      <path d="m5 12 4 4L19 6" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </>
  ),
};
export function Icon({name}: {name: keyof typeof ICONS}): JSX.Element {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
