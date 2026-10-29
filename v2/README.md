# Marble Merge 2.0 — rigid-body workshop

Experimental **first playable vertical slice** of the new wooden marble racing machine. The classic game at the repository root is preserved.

## What's physically simulated
- 32 independent marbles in a fixed 120 Hz Rapier 3D rigid-body world, with rigid-body rotations and continuous collision detection.
- A steep, quarter-circle oak trough, open 3D trumpet funnel with a center hole, and a downhill exit trough. They use triangle-mesh colliders rather than scripted waypoint movement.
- A four-blade paddle wheel on a revolute axle. Ball hits transfer actual contact forces and angular momentum to the rotor. No automatic animation of the wheel.
- Moderated merge size: each level is 1.17 times the preceding diameter, capped at 2.15 times the initial radius. Effective marble mass is proportional to radius^1.6. A 3.4-second cooldown prevents runaway chain merges.
- Physical velocity and position are preserved across transitions into and out of the funnel. There is no snap into a scripted orbital motion.
- A small-screen racing HUD with horizontal completion markers, marble selection, smooth follow/wide/inside cameras, adjustable race speed, pause and restart.

## Running
Serve the repository via any local static HTTP server, then open `/v2/`. The app imports pinned Three.js 0.180.0 and Rapier 0.19.3 from public ES module CDNs. Network access is needed for the first load.

## Verification and next slices
JavaScript syntax and DOM-selector checks passed. The graphics-free Rapier test was run against the GitHub Pages build in Chrome: a contact-driven paddle axle rotated -2.79 radians with residual angular speed 3.16 rad/s; a separate freely moving ball entered the actual funnel triangle mesh, completed 8.15 natural revolutions, and drained after 27.86 seconds without a scripted orbit. **The cloud test browser cannot create a WebGL context, so the complete 3D scene still requires real-device visual and race-flow testing.** Planned next: add a second multi-lap hall route, a rigid-body seesaw and pendulum gate, tune funnel capture/drain and rotor torque in browser, reduce off-course marbles, and add sound/camera polish. This proof-of-concept deliberately does not claim to be the final race.
