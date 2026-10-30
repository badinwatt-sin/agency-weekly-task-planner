// Small built-in icon set (no external icon dependency).
const PATHS: Record<string, string[]> = {
  board: ["M3 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z", "M10 5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1z", "M17 5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z"],
  list: ["M9 6h12", "M9 12h12", "M9 18h12", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  calendar: ["M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M16 2v4", "M8 2v4", "M3 10h18"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"],
  users: ["M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1", "M16 3.5a4 4 0 0 1 0 8", "M22 21v-1a5 5 0 0 0-3.5-4.8"],
  chart: ["M4 20V11", "M10 20V4", "M16 20v-6", "M21 20H3"],
  trend: ["M3 17l6-6 4 4 8-8", "M14 7h7v7"],
  meeting: ["M9 3h6v4H9z", "M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2", "M9 12h6", "M9 16h4"],
  settings: ["M4 21v-7", "M4 10V3", "M12 21v-9", "M12 8V3", "M20 21v-5", "M20 12V3", "M1 14h6", "M9 8h6", "M17 16h6"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  plus: ["M12 5v14", "M5 12h14"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-3.5-3.5"],
  left: ["M15 18l-6-6 6-6"],
  right: ["M9 18l6-6-6-6"],
  alert: ["M12 3l10 18H2z", "M12 10v4", "M12 17.5v.01"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"],
  link: ["M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1", "M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"],
  message: ["M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z"],
  history: ["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5", "M12 7v5l3 2"],
  carry: ["M5 12h12", "M13 6l6 6-6 6", "M3 5v14"],
  folder: ["M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  filter: ["M3 5h18l-7 8v6l-4 2v-8z"],
  shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"],
  menu: ["M3 6h18", "M3 12h18", "M3 18h18"],
  x: ["M18 6L6 18", "M6 6l12 12"],
  check: ["M20 6L9 17l-5-5"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "M13 7l4 4"],
  archive: ["M4 4h16a1 1 0 0 1 1 1v3H3V5a1 1 0 0 1 1-1z", "M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8", "M10 12h4"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  mail: ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M3 7l9 6 9-6"],
  lock: ["M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z", "M8 11V7a4 4 0 0 1 8 0v4"],
  flag: ["M4 21V4", "M4 4h12l-2 4 2 4H4"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "", label }: { name: IconName; size?: number; className?: string; label?: string }) {
  const strokeWidth = name === "grip" || name === "more" ? 3 : 1.8;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
