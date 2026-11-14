import { useEffect, useRef } from "react";
import type { ClientState } from "../state/store";

/** Lab log tail from the snapshot, newest at the bottom. */
export function LabLog({ state }: { state: ClientState }) {
  const { lab, snapshot } = state;
  const ref = useRef<HTMLDivElement>(null);
  const last = snapshot?.log.at(-1);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [last?.tick, last?.text]);
  if (!snapshot) return null;
  const colors = new Map(lab?.layout.robots.map((r) => [r.id, r.color]));
  return (
    <div className="panel right log" ref={ref}>
      <h2>Lab log</h2>
      {snapshot.log.map((e, i) => (
        <div key={`${e.tick}-${i}`} className={`entry ${e.level}`}>
          <span className="muted">{(e.tick / 10).toFixed(1)}s</span>{" "}
          <span className="src" style={{ color: colors.get(e.source) }}>
            {e.source}
          </span>{" "}
          {e.text}
        </div>
      ))}
    </div>
  );
}
