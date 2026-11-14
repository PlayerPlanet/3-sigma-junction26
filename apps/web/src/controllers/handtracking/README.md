# controllers/handtracking/ — PLACEHOLDER

Camera hand-pose teleoperation. Not implemented in the MVP.

Belongs here: a controller that reads hand pose from the webcam and emits the same primitive actions
as `keyboard/` (`set_hand_height`, `extend_hand`, `grip`, `release`, `tilt_pour`). It must not
bypass the action schema, so every teleop session stays replayable.
