/** A restored context cannot rescue evidence gathered after any context loss.
 * Listen immediately after renderer creation, and poll around every async or
 * render boundary because the loss event itself can be delivered later.
 */
export function watchRenderHealth(
  canvas: EventTarget,
  context: { isContextLost(): boolean },
  onFailure: (error: Error) => void,
) {
  let failure: Error | undefined;
  const latch = (phase: string) => {
    if (!failure) {
      failure = new Error(`WebGL context lost ${phase}; discard this page's screenshots and measurements.`);
      onFailure(failure);
    }
    return failure;
  };
  const onLost = () => { latch('during the fixed-pose benchmark'); };
  canvas.addEventListener('webglcontextlost', onLost);
  return {
    assertHealthy(phase: string) {
      if (context.isContextLost()) latch(phase);
      if (failure) throw failure;
    },
    dispose() { canvas.removeEventListener('webglcontextlost', onLost); },
  };
}
