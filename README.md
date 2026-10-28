# Marble Merge Grand Prix

A glossy 3D marble race down a long polished wooden trough, built using [Three.js](https://threejs.org/). Host it directly on GitHub Pages; no build step, accounts, or server are required.

## Play

- **Follow** watches the chosen marble from a smooth chase camera.
- **Inside Ball** puts a stabilized first-person camera in the transparent marble, while the colored glass lens spins visually.
- **Aerial** gives a wider TV-style track view.
- Select a color or tap a miniature marble on the horizontal progress tracker to change the followed marble. The tracker shows every surviving marble's actual percentage of the course.
- Pause/resume, replay, and 2× simulation speed controls are provided.

The first racer across the finish line wins. The downhill course runs approximately 859 units in plan and drops 117 units. It traces the outer walls of an enclosed wooden race hall, then makes progressively smaller turns toward the center of the room. The hall includes plaster walls, wood paneling, framed windows, ceiling beams, lighting fixtures, a wood floor, and track brackets and posts. The track has a 5.8-unit-wide, smoothly curved cross section describing the **bottom quarter of a circle** (90 degrees total, from -45 to +45 degrees), with no central channel or lane dividers. The trough has a procedurally grained oak finish with rounded wooden lips. Each marble has two visible swirling colors and a polished clearcoat finish. Typical races are targeted at roughly 80–100 seconds, depending on collisions and merges.

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
