# Working on ORBIT

Use `npm ci`, `npm test`, and `npm run build`. Keep simulation rules in `src/physics/` and camera/render behavior in `src/render/`. Table dimensions in `table.ts` are shared by physics, rendering, and the radar.

Preserve fixed-step physics and ball CCD. Do not attach the stabilized FPV camera to the ball's rotation. Treat the deliberate Spin mode separately. Test keyboard and simultaneous touch input, pause/blur handling, launch-lane exit, and the three-ball lifecycle after relevant changes.

For visible changes, launch the app and inspect screenshots in both desktop and mobile landscape viewports. Report the checks actually run and any remaining playability limits.
