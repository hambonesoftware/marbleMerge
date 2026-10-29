# Marble Merge Grand Prix

A glossy 3D marble race down a long polished wooden trough, built using [Three.js](https://threejs.org/). Host it directly on GitHub Pages; no build step, accounts, or server are required.

## Play

- **Follow** watches the chosen marble from a smooth chase camera.
- **Inside Ball** puts a stabilized first-person camera in the transparent marble, while the colored glass lens spins visually.
- **Aerial** gives a wider TV-style track view.
- **Track Tour** displays each actual mechanism close-up. Tap it again to cycle to the next station.
- Select a color or tap a miniature marble on the horizontal progress tracker to change the followed marble. The tracker shows every surviving marble's actual percentage of the course.
- Pause/resume, replay, and 2× simulation speed controls are provided.

The first racer across the finish line wins. The downhill course runs approximately 859 units in plan, with a main 208-unit descent plus staged drop chutes and two 10.3-unit funnel transitions, averaging about a 13.6-degree incline along the principal route. It traces the outer walls of an enclosed wooden race hall, then makes progressively smaller turns toward the center of the room. The hall includes plaster walls, wood paneling, framed windows, ceiling beams, lighting fixtures, a wood floor, and track brackets and posts. The standard track has a 5.8-unit-wide, smoothly curved cross section describing the **bottom quarter of a circle** (90 degrees total, from -45 to +45 degrees), with no permanent center channel. Special fork sections deliberately introduce a short divider. The trough has a procedurally grained oak finish with rounded wooden lips. Each marble has two visible swirling colors and a polished clearcoat finish. Typical races are targeted around one minute, depending on collisions, merges, and funnel travel.

### Track features

The course is now an obstacle sequence rather than a uniform chute:

- **Vortex funnels** are separate steep wooden trumpet bowls. Marbles orbit inward and accelerate angularly before dropping through the central drain and rejoining the chute.
- **Drop chutes** introduce three localized descents beyond the principal incline.
- **Ball-powered wheels** begin motionless and gain angular momentum from marble impacts, then coast down through bearing friction.
- **Contact spinners** turn under marble impacts; **seesaw bridges** and **pendulum gates** respond and spring back as they move.
- **Fork guide sections** use a raised central divider with two marked routes. Marbles are guided to one side, and marbles on opposite sides of a divider cannot collide or merge through it.

The race is still constrained to the continuous track's longitudinal path; fork sections divide that path laterally rather than create independent spatial route networks. The obstacle contacts are game-physics approximations, not full rigid-body interactions.

## Physics model

This initial release uses a **fixed 120 Hz track-constrained simulation**. Along-track and lateral velocities, collision impulses, rolling drag, circular-trough gravity and turn forces, and momentum-conserving same-tier merges drive the race. Marble mass doubles and radius scales by the cube root of mass when equal numbered marbles merge. Rendering interpolates between simulation steps, and the camera uses exponential damping to prevent jerkiness. The marble's visible rotation is computed from its actual 3D displacement and the local curved-track contact normal: its rolling axis and accumulated angular displacement adjust naturally through corners and while moving laterally across the trough.

The physics are a game-oriented approximation, **not a general-purpose 3D rigid-body solver**. This approach makes the first race highly stable on phones; a later version can replace the track-constrained engine with Rapier for true free-body tumbling and track contact.

## Publish on GitHub Pages

1. Open the repository's **Settings → Pages**.
2. Choose **Deploy from a branch**.
3. Select the **main** branch and the **/(root)** folder, then save.
4. The page will be served at `https://hambonesoftware.github.io/marbleMerge/` once GitHub completes publication.

All file references are relative, so the game works under a GitHub Pages repository subpath. Three.js loads from the pinned jsDelivr import-map URLs; an internet connection is required.

## Local preview

Serve the repository using any static server, for example `python -m http.server 8000`, and open `http://localhost:8000`.

## Planned next steps

- Steering controls for the player's selected marble (without breaking the physics simulation).
- More track layouts and physics-based obstacles.
- Optional full-rotation onboard camera for advanced players.
- More sophisticated rigid-body contacts, track banks, and spectator replay controls.

## Kinetic wooden-machine upgrade

- **Steeper, faster course:** the outer-wall circuit now descends from 240 to 32 world units before staged chute drops. The racing hall ceiling is raised accordingly. Rolling acceleration comes from the downhill tangent and size-dependent aerodynamic resistance, so larger merged marbles retain speed better.
- **Two large vortex funnels:** genuinely separate wooden trumpet-shaped surfaces, with a gap in the regular trough, a sloped circular bowl, several inward revolutions calculated in polar coordinates, a center drain, and a visible tube rejoining the track. A funnel orbit averages roughly three turns before the drain.
- **Ball-powered devices:** both axle wheels and horizontal spinners start stationary and receive angular momentum when marbles hit them. Rotational damping slows them down. Seesaw bridge and pendulum gates also move only on contact and spring back under gravity.
- **Track Tour camera:** use the TRACK TOUR button, tapping again to advance through each module. Each station is marked by a visible arch and sign.
- **Mobile performance:** no heavyweight physics dependency is required for this version. The general track uses fixed-step constrained motion, while funnels use a dedicated orbital simulation and mechanisms use angular impulse and damping. This is a physics-inspired hybrid rather than a general-purpose rigid-body solver.
