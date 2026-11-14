import type { ActionResult, Actor, SimEvent, StepAction } from "@lab-rats/shared";
import { isPrimitive } from "@lab-rats/shared";
import { startProblem, newTask } from "./actions/start.js";
import { coolItems } from "./chemistry/thermal.js";
import { LOG_LIMIT } from "./constants.js";
import { tickEquipment } from "./equipment/run.js";
import { tickPathway } from "./chemistry/pathway.js";
import { checkTimeout, commitScenario } from "./scoring/scenario.js";
import { advanceRobot } from "./robots/advance.js";
import { cloneState, log, type SimState } from "./state.js";
import type { World } from "./world/compile.js";

export interface StepInput {
  actor: Actor;
  action: StepAction;
}

function robotOf(action: StepAction): string | null {
  return "robot" in action ? action.robot : null;
}

function apply(world: World, s: SimState, { actor, action }: StepInput): ActionResult {
  const robotId = robotOf(action);
  const r = robotId ? s.robots[robotId] : undefined;
  if (robotId && !r) return { ok: false, reason: `unknown robot "${robotId}"` };

  if (isPrimitive(action)) {
    const robot = r!;
    const seq = robot.seq++;
    if (s.scenario && s.scenario.status !== "running") {
      robot.last = { seq, type: action.type, status: "invalid", reason: "the session is over", startTick: s.tick, endTick: s.tick };
      return { ok: false, reason: "the session is over", seq };
    }
    if (robot.task) return { ok: false, reason: `${robot.id} is busy with ${robot.task.action.type}`, seq };
    const problem = startProblem(world, s, robot, action);
    if (problem) {
      robot.last = { seq, type: action.type, status: "invalid", reason: problem, startTick: s.tick, endTick: s.tick };
      log(s, "warn", robot.id, `${action.type} rejected: ${problem}`);
      return { ok: false, reason: problem, seq };
    }
    robot.task = newTask(world, s, robot, action, actor, seq);
    return { ok: true, seq };
  }

  switch (action.type) {
    case "cancel":
      if (r!.task) r!.cancelRequested = true;
      return { ok: true };
    case "set_controller":
      if (r!.controller !== action.controller) log(s, "info", r!.id, `controller: ${r!.controller} -> ${action.controller} (${actor})`);
      r!.controller = action.controller;
      return { ok: true };
    case "read_log":
      return { ok: true };
    case "commit": {
      const { item, answer } = action.result;
      if (item && !s.items[item]) return { ok: false, reason: `unknown item "${item}"` };
      const problem = commitScenario(world, s, action.result);
      if (problem) return { ok: false, reason: problem };
      s.commits.push({ tick: s.tick, actor, ...(item ? { item } : {}), ...(answer ? { answer } : {}) });
      log(s, "info", "session", `${actor} committed ${item ? `item ${item}` : "an answer"}`);
      return { ok: true };
    }
  }
}

/**
 * Advances the simulation by one tick. Pure: returns a new state; `prev` is untouched.
 * Order: apply inputs (in the order given) -> robots advance (by id) -> equipment ticks (by id) -> cooling -> tick++.
 */
export function step(world: World, prev: SimState, inputs: StepInput[] = []): { state: SimState; events: SimEvent[] } {
  const s = cloneState(prev);
  const events: SimEvent[] = inputs.map((input) => ({
    tick: s.tick,
    actor: input.actor,
    robot: robotOf(input.action),
    action: input.action,
    result: apply(world, s, input),
  }));
  for (const id of world.robotIds) advanceRobot(world, s, s.robots[id]!);
  coolItems(s, tickEquipment(world, s));
  tickPathway(world, s);
  checkTimeout(world, s);
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
  s.tick++;
  return { state: s, events };
}
