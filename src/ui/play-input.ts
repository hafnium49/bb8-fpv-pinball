export type PlayControl = 'left' | 'right' | 'launch';
type Controls = Record<PlayControl, boolean>;

/** Each finger/key owns its hold; releasing one cannot release another. */
export class PlayInput {
  private keys = new Map<string, PlayControl>();
  private pointers = new Map<number, PlayControl>();
  constructor(private controls: Controls) {}
  holdKey(code: string, control: PlayControl) { this.keys.set(code, control); this.sync(); }
  releaseKey(code: string) {
    if (!this.keys.delete(code)) return false;
    this.sync(); return true;
  }
  holdPointer(id: number, control: PlayControl) { this.pointers.set(id, control); this.sync(); }
  releasePointer(id: number) { if (this.pointers.delete(id)) this.sync(); }
  clearKeyboard() { this.keys.clear(); this.sync(); }
  clear() { this.keys.clear(); this.pointers.clear(); this.sync(); }
  private sync() {
    for (const control of ['left', 'right', 'launch'] as const)
      this.controls[control] = [...this.keys.values(), ...this.pointers.values()].includes(control);
  }
}

// Mobile focus can change while the page stays visible and a finger is down.
// Background/navigation lifecycle events still pause immediately on all devices.
export function pauseOnWindowBlur(hidden: boolean, coarse: boolean, lastPointerType: string) {
  const touchFocus = lastPointerType === 'touch' || (coarse && lastPointerType === '');
  return hidden || !touchFocus;
}
