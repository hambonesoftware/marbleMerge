# Marble Merge Grand Prix

A bright, glossy 3D marble race for the browser, built using [Three.js](https://threejs.org/). Host it directly on GitHub Pages; no build step, accounts, or server are required.

## Play

- **Follow** watches the chosen marble from a smooth chase camera.
- **Inside Ball** puts a stabilized first-person camera in the transparent marble, while the colored glass lens spins visually.
- **Aerial** gives a wider TV-style track view.
- Select a color or a racer in the standings to change the followed marble.
- Pause/resume, replay, and 2× simulation speed controls are provided.

The first racer across the finish line wins. Tracks are designed for roughly one-minute races, not an exact 60-second stop.

## Physics model

This initial release uses a **fixed 120 Hz track-constrained simulation**. Along-track and lateral velocities, collision impulses, rolling drag, gradual steering, and momentum-conserving same-tier merges drive the race. Marble mass doubles and radius scales by the cube root of mass when equal numbered marbles merge. Rendering interpolates between simulation steps, and the camera uses exponential damping to prevent jerkiness.

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
