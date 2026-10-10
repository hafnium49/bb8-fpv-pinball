import { voiceBank, type VoiceKey } from './voice-bank';

export interface VoiceClip { offset: number; duration: number; variant: number }

// Rotate per event family after a cue is accepted. Warnings have one stable
// variant so a player can learn the rhythm; flavour never repeats immediately.
export class VoiceSelector {
  private next = new Map<VoiceKey, number>();
  select(key: VoiceKey): VoiceClip {
    const clips = voiceBank[key].variants;
    const variant = (this.next.get(key) ?? 0) % clips.length;
    this.next.set(key, (variant + 1) % clips.length);
    return { ...clips[variant], variant };
  }
}
