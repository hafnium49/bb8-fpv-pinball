# FPV immersion and droid voice refinement

The overhead radar is removed from the markup, frame loop and styles, and its renderer module is deleted. It cannot reappear on start, pause, restart, a circuit shot or a lost-head spin. Stable FPV and the existing 5% per-launch, three-simulation-second spin remain. Flipper warnings still take priority over the spin's nonverbal panic reaction.

The original nonverbal voice is regenerated at 60% of the previous carrier pitch while retaining every cue's duration and warning rhythm. Quantized pitch steps, stronger FM colour, a sub-octave body and shaped harmonics produce a fuller electronic sound. A 2.6 kHz smoothing filter softens the thin high-frequency edge. The procedural decoding fallback uses the same lower register. Captions describe beeps, burbles and electronic cries; no English speech or downloaded character recording is used.

All fifteen event motifs remain: directional warnings, ready, launch, surprise, impact, ramp, bridge, tunnel, save, circuit, drain and game over. The short left/right/both/danger rhythms remain distinguishable on mono speakers and finish in less than half a second. Their meaning also remains available through captions and flipper highlights.

The shipped PCM's mean energy-weighted spectral centroid across the fifteen clips changed from 1,821.8 Hz to 851.8 Hz. This describes the lower frequency balance; it does not measure a listener's judgement of the character's expressiveness. The generated asset is original synthesis and remains embedded in the online/offline builds.

Browser QA checks a single game canvas and no radar during the forced spin, alongside actual decoded voice output, direction, priority, fallback, pause/blur, live reduced motion, touch controls and the three-ball lifecycle. See the [validation record](validation/fpv-immersion-voice.json) for the exact checks and source/build hashes.

The [reference cabinet and UI study](reference-cabinet-ui-study.md) records the design direction for the next visual pass, separately from the changes implemented here.
