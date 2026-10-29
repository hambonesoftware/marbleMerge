# Marble Merge 2.0 — The Oak Race Hall

Physics-based experimental race at `/v2/`, developed on the `v2` branch. The original Grand Prix remains at the repository root.

## New full-room race
- The opening wooden trough follows the perimeter of a tall oak gallery on several walls before descending inward to a steep trumpet funnel.
- The main perimeter circuit is approximately 276 world units long and loses 62.4 units of elevation. Mean incline is about 13°; localized runs approach 19°.
- The narrow track is a quarter-circular open U section. Corners bank gradually; low wooden edge lips offer natural contact while faster marbles **can jump or fall off**. There is no central channel.
- A physics-simulated trumpet vortex drains into a downhill lower run containing a four-paddle contact wheel. Its offset paddles turn under actual marble impacts, and the near-side railing is deliberately interrupted around the paddle sweep so the blades do not lock against the wood. A hinged pendulum gate swings under real marble impact.
- Marbles have colorful glass swirls and true rigid-body spin. The race uses 120 Hz fixed physics timesteps, CCD for fast spheres, and real 3D triangle-mesh track colliders.
- Size and merging are moderated: tier radius grows 17% per level (capped), effective mass grows more gently than volume, and new merges have a 3.4-second cooldown.

## Rules and controls
- A falling marble is **eliminated**. It is not teleported or rescued.
- The first successful finisher wins. A 120-second upper limit assigns remaining marbles DNF, avoiding endless races.
- Follow/Wide/Inside camera modes, color selection, horizontal race-progress tracker, speed control, pause, and restart.

## Automated browser physics tests
Append `?physics-test=1` to validate the rotating axle and natural funnel without WebGL. It previously observed 8.15 physical revolutions and a 27.86-second drain for a tangent-entry marble.

Append `?race-test=1` to run 32 real Rapier sphere bodies along the full wooden course without WebGL. The current deterministic 120-second test reports **32 funnel entries, 30 drains, 1.9 net physically driven wheel revolutions (2.01 total travel), 12 finishes, 14 fall-offs and 6 DNFs**, with the first finisher at **46.4 seconds**. Marbles do not receive any scripted motion or fall-off protection. Earlier versions revealed and helped us fix a funnel-entry seam and a rail/wheel interference problem; the automated test now reports actual wheel rotation and waiters in addition to finishers.

## Current limitations
- The cloud QA browser lacks WebGL, so the complete rendered scene still needs iPhone Safari visual testing.
- Full-race diagnostics model individual sphere motion and obstacle contact, but do **not** reproduce merge events yet.
- Additional independent split-path modules, a real hinged seesaw bridge, a second funnel and improved audio remain planned.
- The physics engine is imported via pinned CDN modules, so an initial network connection is required.
