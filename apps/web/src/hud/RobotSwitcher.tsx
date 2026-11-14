import { CONTROLLER_KINDS, type ControllerKind } from "@lab-rats/shared";
import { sendAction } from "../net/socket";
import { setUi, toast, type ClientState } from "../state/store";
import type { ConnectionStatus } from "../net/socket";

const STATUS_COLORS: Record<ConnectionStatus, string> = { open: "var(--ok)", connecting: "var(--warn)", closed: "var(--bad)" };

/** Connection status, and one row per robot: select it (or press its number), switch its controller. */
export function RobotSwitcher({ state }: { state: ClientState }) {
  const { status, hello, lab, snapshot, ui } = state;
  const setController = (robot: string, controller: ControllerKind) => {
    if (!sendAction({ type: "set_controller", robot, controller })) toast("Not connected");
  };
  return (
    <div className="panel top-left">
      <h1>Lab Rats</h1>
      <div className="muted small">
        <span className="dot" style={{ background: STATUS_COLORS[status] }} />
        {status}
        {hello && <> · AI: {hello.llm.available ? `${hello.llm.provider} / ${hello.llm.model}` : "not configured (llm robots wander)"}</>}
      </div>
      {lab && snapshot && (
        <ul className="robots">
          {snapshot.robots.map((r, i) => {
            const p = lab.layout.robots.find((x) => x.id === r.id);
            return (
              <li key={r.id} className={r.id === ui.activeRobot ? "active" : ""} onClick={() => setUi({ activeRobot: r.id, controlIdx: 0 })}>
                <kbd>{i + 1}</kbd>
                <span className="dot" style={{ background: p?.color }} />
                <span className="name">{p?.label ?? r.id}</span>
                <select value={r.controller} onClick={(e) => e.stopPropagation()} onChange={(e) => setController(r.id, e.target.value as ControllerKind)}>
                  {CONTROLLER_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
      <div className="muted small">
        <kbd>H</kbd> help · <kbd>T</kbd> take over · set a robot to <b>script</b> to watch it play
      </div>
    </div>
  );
}
