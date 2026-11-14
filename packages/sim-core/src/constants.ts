/** Kinematics and timing. All state quantities are integers; see docs/DECISIONS.md (M3). */
export const SPEED_MM_PER_TICK = 60; // carriage: 0.6 m/s at 10 ticks/s
export const HAND_LEVEL_TICKS = 4; // ticks per mast level
export const EXTEND_PER_TICK = 10; // percent per tick
export const GRIP_TICKS = 2;
export const POUR_PER_TICK = 10; // units per tick
export const REACH_TOLERANCE = 10; // percent either side of a station's reach
export const MAX_BLOCKED_TICKS = 100; // a move waiting this long for the rail fails with "blocked"
export const AMBIENT_TEMP = 20;
export const LOG_LIMIT = 2000; // lab log entries kept in state

/** Invented vessel properties (units, grams). */
export const VESSELS = {
  flask: { capacity: 250, tare: 120 },
  beaker: { capacity: 150, tare: 80 },
} as const;

/** Hood worktop capacity (items). */
export const HOOD_CAPACITY = 4;
