# Sound activation and iPhone playback

The 6 October 2026 report followed a screenshot with **SOUND OFF**. The original app started muted after every reload, had no audible confirmation when sound was enabled, and did not request a media playback audio session. This does not establish which setting caused silence on the reported device.

Enabling sound now requests `navigator.audioSession.type = 'playback'` when supported, creates/resumes Web Audio inside the player's gesture, and plays a short confirmation tone after the context is running. WebKit documents this session choice for playback when an iPhone's ringer switch is silent: [WebKit issue 237322, comment 6](https://bugs.webkit.org/show_bug.cgi?id=237322#c6). The optional API is feature-detected and configuration errors fall back to ordinary Web Audio.

Sound is still muted on a first visit. The selected preference is saved locally; a saved on preference activates on entering/resuming the table or pressing a game control, with no page-load autoplay. The sound button works while the table is initializing. Failed activation returns the button to off and offers a retry. An output gain mutes active tones immediately, and changing the setting while activation is pending cannot emit a late confirmation. Muting releases the playback session back to `auto`. Enabling playback can interrupt other media on platforms that grant exclusive audio focus.

## Verification

Three audio regressions cover the gesture/session ordering, reuse after interruption, muting during a pending resume, unsupported session configuration and rejected resume promises. The original 17 physics and camera tests, 96 valid ground approaches, 81 route variants, two normal-launch returns and production build pass.

`npm run test:audio:browser` exercises desktop classic and mobile circuit pages. It observes real Web Audio output with an analyser, checks the confirmation signal, real keyboard/touch flipper and launch events, suspended-context recovery, persistence across reload, immediate mute and absence of autoplay. Actual desktop and mobile landscape screenshots are captured with rendering restored and inspected. Short audio checks temporarily suppress the software-GPU render call while keeping the normal simulation, animation loop and inputs active.

The [compact browser report](validation/audio.json) states the measured signal and exact scope. Chromium's optional `audioSession` is stubbed for the feature-path check. Speaker audibility, physical iPhone Silent Mode, media volume and Bluetooth routing are not verified by these tests; the Safari change follows WebKit's documented behavior.

To reproduce, install dependencies and a Chromium executable, then run:

```sh
npm test
npm run test:circuit
npm run build
npm run test:audio:browser
```

Browser QA starts an isolated Vite server and accepts `CHROME_PATH` and a JSON array in `CHROME_ARGS`. Full reports and screenshots are written under ignored `artifacts/audio/`. For a device check, reload the deployed game, tap **SOUND OFF**, and listen for the confirmation beep with media volume raised. Try the phone's Silent Mode both on and off and confirm launcher/flipper effects after entering the table.
