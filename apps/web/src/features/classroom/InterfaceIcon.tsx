const paths = {
  music:
    "M9 18V5l12-2v13M9 8l12-2M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Zm12-2a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2Z",
  chevron: "m6 9 6 6 6-6",
  more: "M12 4v1m0 6v1m0 6v1",
  people:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-2a7 7 0 0 1 14 0v2M17 4a4 4 0 0 1 0 8m1 3a6 6 0 0 1 4 6",
  planet:
    "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM4 11C-2 16 1 21 12 16S26 5 20 5",
  picture: "M3 3h18v18H3ZM3 17l6-6 5 5 3-3 4 4M8 7h.01",
  message: "M21 11a9 9 0 0 1-9 9c-2 0-3-.5-4-1l-5 2 1-5a9 9 0 1 1 17-5Z",
  check: "m6 12 4 4 8-8",
  arrow: "M4 12h16m-6-6 6 6-6 6",
} as const;
export function InterfaceIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="interface-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
