const scales = [1, .85, .7, .6, .5] as const;

/** Frame delivery includes GPU/compositor load; use sustained pressure, never a single hiccup. */
export class RenderBudget {
  enabled = true;
  level = 0;
  get scale() { return scales[this.level]; }
  private slowSeconds = 0;
  private fastSeconds = 0;
  private slowSamples = 0;
  private warmup = 3;
  private costs = new Float32Array(30);
  private pressure = new Uint8Array(30);
  private cursor = 0;
  private count = 0;
  private total = 0;
  private pressured = 0;

  reset() { this.level = 0; this.warmup = 3; this.clearWindow(); }
  private clearCounters() { this.slowSeconds = this.fastSeconds = this.slowSamples = 0; }
  private clearWindow() {
    this.clearCounters(); this.costs.fill(0); this.pressure.fill(0);
    this.cursor = this.count = this.total = this.pressured = 0;
  }
  sample(frameMs: number, submitMs: number, active: boolean) {
    if (!this.enabled || !active || !Number.isFinite(frameMs) || !Number.isFinite(submitMs) || frameMs <= 0 || frameMs > 10000 || submitMs < 0) {
      this.clearWindow(); return false;
    }
    if (this.warmup > 0) { this.warmup--; return false; }
    const seconds = Math.min(frameMs, 250) / 1000;
    this.total -= this.costs[this.cursor]; this.pressured -= this.pressure[this.cursor];
    this.costs[this.cursor] = Math.min(250, Math.max(frameMs, submitMs / .75));
    const currentPressure = frameMs > 22 || submitMs > 14;
    this.pressure[this.cursor] = currentPressure ? 1 : 0;
    this.total += this.costs[this.cursor]; this.pressured += this.pressure[this.cursor];
    this.cursor = (this.cursor + 1) % this.costs.length; this.count = Math.min(this.costs.length, this.count + 1);
    const average = this.total / this.count;
    // Two pressured deliveries reject a lone compilation/OS hiccup. Rolling
    // costs still catch GPU backpressure alternating with fast RAF bursts.
    if (average > 22 && this.pressured >= 2) {
      this.slowSeconds += seconds; this.slowSamples++; this.fastSeconds = 0;
      if (currentPressure && this.slowSeconds >= .7 && this.slowSamples >= 6 && this.level < scales.length - 1) {
        this.level = Math.min(scales.length - 1, this.level + (average > 50 ? 2 : 1));
        this.clearWindow(); this.warmup = 3; return true;
      }
    } else if (average <= 18.5 && submitMs < 11) {
      this.fastSeconds += seconds; this.slowSeconds = this.slowSamples = 0;
      if (this.fastSeconds >= 6 && this.level > 0) {
        this.level--; this.clearWindow(); this.warmup = 3; return true;
      }
    } else this.clearCounters();
    return false;
  }
}

/** Cap render pixels, not CSS/HUD size. Native 1080p is preserved in High. */
export function renderPixelRatio(width: number, height: number, deviceRatio: number, high: boolean, scale = 1) {
  const pixelBudget = high ? 3_000_000 : 2_000_000;
  const ratio = Math.min(Math.max(.5, deviceRatio), high ? 1.5 : 1, Math.sqrt(pixelBudget / Math.max(1, width * height)));
  return ratio * Math.max(.5, Math.min(1, scale));
}
