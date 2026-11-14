# agents/scripted/

Deterministic scripted controller. `ScriptedDriver` plays a `ScenarioScript` from
`sim-core/src/players/` (the reference soap player) through the public action space as the `script`
actor: one batch, then the commit.
