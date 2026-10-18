# Full-screen play from an iPhone Home Screen app

## What changes

- The manifest requests `fullscreen`, with `standalone` as its explicit display override fallback. iOS may choose standalone; that still removes normal Safari URL/tab bars when launched from the Home Screen. Existing app identity and scope remain unchanged.
- Installed launches and successful native fullscreen activate a compact touch-game HUD. The score, balls, pause, launch and both flippers remain on screen; sound and graphics settings are available inside Pause. The canvas covers the entire viewport, including behind safe areas; only interactive controls are inset.
- On touch devices, pressing Start requests native element fullscreen synchronously in that user gesture if the browser exposes a complete, enabled API. Already-installed apps do not need a request. Unsupported or denied automatic requests continue normal gameplay without opening an informational modal. Explicit fullscreen-button failures still show their recoverable guide.
- No forced orientation, autoplay on load, video fullscreen trick, CSS-only claim of Safari toolbar removal, or silent installation.

## iPhone launch acceptance

1. Open the deployed game in Safari or Chrome on iPhone.
2. Share → Add to Home Screen; leave Open as Web App enabled if offered, and Add.
3. Close the tab and launch ORBIT from the Home Screen icon.
4. Press Start and verify the game has no normal browser URL/tab toolbar. In portrait and both landscape directions, verify that score, pause, launch and both flippers remain usable around the notch/home indicator. OS status/home-indicator behavior remains controlled by iOS.
5. Test launch, simultaneous flippers, Pause → sound/graphics → Resume, background/relaunch and rotation during a held launch. Rotation cancels held input safely without restarting the run; phone-look rotation rebases the view.

Adding and launching the Home Screen app is an iOS-controlled user step. This change cannot convert an existing Safari tab into standalone mode. The prior screenshot showed Safari's bottom URL/navigation toolbar with a guide over gameplay; it was not an installed launch.

## Verification

The browser regression suite covers standard/prefixed native-API fixtures, real desktop engine fullscreen where supported, rejected automatic Start requests including delayed error events, unsupported ordinary tabs, all three installed-mode signals, portrait/landscape rotation, full canvas bounds, simulated safe-area control bounds, settings access, and production-subpath manifest/icons. Installed-mode screenshots are explicitly captured after resuming any lifecycle pause, so they show playable gameplay rather than an instruction or pause modal.

CI runs Chromium and Linux WebKit with actual WebGL drawing and screenshot artifacts. Injected installed-mode signals and simulated safe-area values test application behavior only. They do not prove iOS installation, physical-iPhone browser-toolbar removal, actual notch dimensions, or device performance. Physical iPhone launch acceptance remains a separate check.

Primary platform references:
- https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#every-site-can-be-a-web-app-on-ios-and-ipados
- https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DiOS&hl=en


## Fullscreen and phone-look integration

The compact pause menu retains graphics, sound and experimental look settings together. Automatic fullscreen is limited to Start/Restart; enabling phone look from the intro or game-over state starts a paused run without requesting fullscreen, preserving the gesture for motion permission. The fullscreen browser suite includes standard, prefixed and installed-mode cases with `?look=1`, an activation-consuming fullscreen fixture, calibration, settings, Resume, reachable live look/flipper/launch controls and Follow ball. The independent sensor/lifecycle suite stays in a deterministic unsupported-fullscreen tab.

Physical device permission sheets, installation and browser-toolbar behavior still require the device acceptance check above.
