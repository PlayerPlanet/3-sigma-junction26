/**
 * @lab-rats/sim-core — the deterministic, headless lab simulation.
 *
 * Rules: no DOM, no rendering, no network, no wall-clock time, no Math.random.
 * All randomness comes from rng/, all state is serializable integers.
 *
 *   compileWorld(layout, types)  static world (validated)
 *   createInitialState(world, seed)
 *   step(world, state, inputs)   pure tick
 *   new Sim(world, { seed })     queues, macros, controllers, event log
 *   replay(world, seed, events, endTick)
 *   snapshot(world, state)       render/controller view
 */
export const SIM_CORE_VERSION = "0.3.0";

export * from "./constants.js";
export * from "./rng/index.js";
export * from "./events/index.js";
export * from "./world/rails.js";
export * from "./world/validate.js";
export * from "./world/stations.js";
export * from "./world/compile.js";
export * from "./world/path.js";
export * from "./world/view.js";
export * from "./robots/kinematics.js";
export * from "./state.js";
export * from "./step.js";
export * from "./sim.js";
export { expandMacro } from "./actions/macros.js";
export { behaviorFor } from "./equipment/index.js";
export { DISPENSE_UNITS } from "./equipment/dispenser.js";
export { evaluateYield } from "./chemistry/pathway.js";
export { scoreOrder, scoreResearch, researchTruth } from "./scoring/scenario.js";
export { FAULTS } from "./faults/index.js";
export { ANALYSIS_TICKS } from "./equipment/analyzer.js";
export { runDemo } from "./demo.js";
export { playSoapOrder, oracleSoapPlan, soapScript, planConditions, FAIR_SOAP_PLAN, type SoapPlan, type ScenarioScript } from "./players/soapOrder.js";
export { briefing, RULES } from "./agent/briefing.js";
