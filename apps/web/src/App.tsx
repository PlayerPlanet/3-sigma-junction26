import { useEffect, useMemo, useRef } from "react";
import { connect, sendAction } from "./net/socket";
import { receiveSnapshot, setState, toast, useClientState, getState } from "./state/store";
import { LabScene } from "./scene/LabScene";
import { LabelLayer, labelSpecs } from "./scene/Labels";
import { useKeyboard } from "./controllers/keyboard/useKeyboard";
import { RobotSwitcher } from "./hud/RobotSwitcher";
import { ActivePanel } from "./hud/ActivePanel";
import { LabLog } from "./hud/LabLog";
import { Budget } from "./hud/Budget";
import { Help } from "./hud/Help";
import { Toast } from "./hud/Toast";

export function App() {
  const state = useClientState();
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const robotIds = state.snapshot?.robots.map((r) => r.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const labels = useMemo(() => (state.lab ? labelSpecs(state.lab, state.snapshot) : []), [state.lab, robotIds]);
  useKeyboard();

  useEffect(
    () =>
      connect(
        (msg) => {
          if (msg.type === "hello") setState({ hello: msg });
          if (msg.type === "lab") setState({ lab: msg.lab });
          if (msg.type === "snapshot") receiveSnapshot(msg.snapshot);
          if (msg.type === "action_result") {
            setState({ lastResult: msg.result });
            if (!msg.result.ok) toast(msg.result.reason ?? "Rejected");
          }
        },
        (status) => setState({ status }),
      ),
    [],
  );

  const goToStation = (station: string) => {
    const { ui, snapshot } = getState();
    const pose = snapshot?.robots.find((r) => r.id === ui.activeRobot);
    if (!pose) return;
    if (pose.controller !== "human") return toast("Take over the robot first (T)");
    if (!sendAction({ type: "go_to", robot: pose.id, station })) toast("Not connected");
  };

  return (
    <>
      <LabScene lab={state.lab} snapshot={state.snapshot} activeRobot={state.ui.activeRobot} labels={labels} labelRefs={labelRefs} />
      <LabelLayer specs={labels} refs={labelRefs} visible={state.ui.showLabels} onStation={goToStation} />
      <RobotSwitcher state={state} />
      <Budget state={state} />
      <ActivePanel state={state} />
      <LabLog state={state} />
      <Toast state={state} />
      {state.ui.showHelp && <Help />}
    </>
  );
}
