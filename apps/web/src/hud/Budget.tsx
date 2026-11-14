import { useState } from "react";
import { toast, type ClientState } from "../state/store";

const clock = (ticks: number) => {
  const s = Math.max(0, Math.floor(ticks / 10));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

async function newRun(scenario: string | null) {
  const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }) });
  if (!res.ok) toast(`Could not start: ${(await res.json()).reason}`);
}

/** The order (goal, target, budget left) and the result once committed or timed out. */
export function Budget({ state }: { state: ClientState }) {
  const [open, setOpen] = useState(true);
  const { snapshot: snap, lab } = state;
  if (!snap || !lab) return null;
  const sc = lab.scenario;
  const s = snap.session;
  return (
    <div className="panel top-center">
      {sc && s ? (
        <>
          <div className="row">
            <strong>{sc.title}</strong>
            <span className="muted">target ≥ {sc.targetYield}% yield</span>
            <button className="link" onClick={() => setOpen(!open)}>
              {open ? "hide" : "brief"}
            </button>
          </div>
          {open && <div className="small brief">{sc.brief}</div>}
          {open && lab.pathway && <div className="small muted brief">{lab.pathway.summary}</div>}
          <div className="budget">
            <span>
              <span className="muted">time left</span> <b className={s.ticksLeft < 600 ? "bad" : ""}>{clock(s.ticksLeft)}</b>
            </span>
            <span>
              <span className="muted">reagents left</span> <b className={s.reagentsLeft < 0 ? "bad" : ""}>{s.reagentsLeft} u</b>
            </span>
            <span>
              <span className="muted">waste</span> <b className={snap.waste ? "bad" : ""}>{snap.waste} u</b>
            </span>
          </div>
          {s.status !== "running" && (
            <div className="result">
              {s.status === "timeout" ? "Time is up." : `Committed ${s.committedItem}: true yield ${s.trueYield}%.`} Score <b>{s.score}/100</b>{" "}
              <button onClick={() => newRun(sc.id)}>New batch</button>
            </div>
          )}
        </>
      ) : (
        <div className="budget">
          <span className="muted">sandbox</span>
          <span>
            <span className="muted">time</span> <b>{clock(snap.tick)}</b>
          </span>
          <span>
            <span className="muted">reagents</span> <b>{snap.reagentsUsed} u</b>
          </span>
          <button onClick={() => newRun("soap_order")}>Start soap order</button>
        </div>
      )}
    </div>
  );
}
