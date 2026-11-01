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

## Geometry correction release (v2.1)

- Trumpet profile now steepens toward its neck (approximately 39° outer slope, 75° throat slope), with a physical discharge neck and an open entrance in the low rim.
- Receiving-track slope and neck clearance accommodate larger merged marbles. The decorative broad skirt was removed.
- Track surfaces have visible wooden undersides and edge thickness. Funnel supports meet its actual underside.
- Wheel bearings stay stationary; hub collision matches the visible hub. Restart uses the same axle center as construction.
- Merges preserve total physical mass, linear momentum and angular momentum (including orbital contribution), and keep the followed marble's orientation. Radius still grows moderately and is capped: this is an explicit arcade size rule, so density increases with merges.
- A merge is deferred if no nearby clear placement exists. Small upward placement offsets can add potential energy: merging remains an arcade event, not a simulation of real glass fusion.
- Real contact manifolds trigger merges, replacing the old overlap-distance threshold.

See [the before/after geometry review](geometry-review.html).

## Validation

Run `npm ci`, `npm run check`, then `npm test` (Node 22+). Three seeded runs construct the actual playable course and exercise its live merge and progress rules. Separate regression checks cover mass, linear velocity, spin and wheel reset. These checks gate GitHub Pages publication.

Both `?race-test=1` and `?physics-test=1` run the shared live-rules diagnostic without a GPU. `&seed=7` changes the small initial velocity perturbation. The test stops at 120 seconds or when all remaining marbles have finished or fallen. Merged-away marbles are counted as merges, not falls or finishers.

Observed runs for seeds 1, 7 and 42 completed in approximately 54–56 seconds, with first finishes at 44–49 seconds, 20–23 merges, and zero stalled survivors. Results may differ slightly between runtime versions. This is not a guarantee against jams for all starts.

| Seed | Merges | Finishers | Falls | Stalled | First finish | Race ends |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 20 | 9 | 3 | 0 | 47.33 s | 56.23 s |
| 7 | 23 | 7 | 2 | 0 | 48.72 s | 54.70 s |
| 42 | 21 | 8 | 3 | 0 | 44.46 s | 54.43 s |

All three conserved total physical mass to the reported precision. Surviving racers equal 32 minus merges. The incoming trough floor and sidewalls blend into the bowl to remove the observed entry pocket.

## Current limitations

- The cloud QA browser lacks WebGL. The complete rendered scene and performance still need iPhone Safari verification.
- Physical marbles do not merge; capped size growth and occasional placement offsets are deliberate game rules.
- Independent split routes, an additional funnel, a hinged seesaw and improved audio remain future work.
- A full photographic before/after audit of every obstacle remains outstanding; the included review plots actual funnel profiles and explains the implemented corrections.
- Runtime dependencies remain pinned CDN imports, requiring an initial network connection.
