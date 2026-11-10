/**
 * the mark: a tiny table. a header row and two body rows, all the same width, fading as they
 * go down (hi → mute → line-2). the body rows are split into a key cell and a value cell, so it
 * reads as a table and never as a menu icon. java.lang.everything's mark is three layers
 * narrowing; this one is three rows. never recolour it, never light all three.
 */
export function Mark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      aria-hidden
      className={className}
      shapeRendering="crispEdges"
    >
      <rect x="0" y="1" width="14" height="4" fill="var(--hi)" />
      <rect x="0" y="7" width="4" height="2" fill="var(--mute)" />
      <rect x="5" y="7" width="9" height="2" fill="var(--mute)" />
      <rect x="0" y="11" width="4" height="2" fill="var(--line-2)" />
      <rect x="5" y="11" width="9" height="2" fill="var(--line-2)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Mark />
      <span className="font-mono text-13 tracking-[-0.01em] whitespace-pre">
        <span className="text-faint">{"select * from "}</span>
        <span className="font-medium text-hi">everything</span>
      </span>
    </span>
  );
}
