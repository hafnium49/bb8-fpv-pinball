import test from 'node:test';
import assert from 'node:assert/strict';
import { fullscreenAPI, fullscreenElement, standaloneDisplay } from '../src/ui/fullscreen';

test('fullscreen requires a complete element API and honors disabled support', () => {
  const enter = async () => {}, exit = async () => {};
  assert.equal(fullscreenAPI({} as HTMLElement, {} as Document), null);
  assert.equal(fullscreenAPI({ requestFullscreen: enter } as HTMLElement, {} as Document), null);
  assert.equal(fullscreenAPI({ requestFullscreen: enter } as HTMLElement, { exitFullscreen: exit, fullscreenEnabled: false } as Document), null);
  assert.equal(fullscreenAPI({ webkitEnterFullscreen: enter } as unknown as HTMLElement, {} as Document), null, 'video-only fullscreen is not supported');
});
test('standard and prefixed fullscreen calls preserve their receivers', async () => {
  for (const prefix of ['', 'webkit']) {
    let entered = 0, exited = 0;
    const el: any = {}, doc: any = {};
    el[prefix ? 'webkitRequestFullscreen' : 'requestFullscreen'] = function () { assert.equal(this, el); entered++; };
    doc[prefix ? 'webkitExitFullscreen' : 'exitFullscreen'] = function () { assert.equal(this, doc); exited++; };
    const api = fullscreenAPI(el, doc)!; await api.enter(); await api.exit();
    assert.equal(entered, 1); assert.equal(exited, 1);
    doc[prefix ? 'webkitFullscreenElement' : 'fullscreenElement'] = el;
    assert.equal(fullscreenElement(doc), el);
  }
});
test('standard API wins, errors are observable, and inactive fullscreen is null', async () => {
  const doc: any = { exitFullscreen: async () => {} };
  const el: any = { requestFullscreen: async () => { throw new Error('denied'); }, webkitRequestFullscreen: () => assert.fail('wrong API') };
  await assert.rejects(fullscreenAPI(el, doc)!.enter, /denied/);
  assert.equal(fullscreenElement(doc), null);
});
test('standalone detection supports legacy iOS and both app display modes', () => {
  assert.equal(standaloneDisplay({} as Navigator, false, false), false);
  assert.equal(standaloneDisplay({ standalone: true } as any, false, false), true);
  assert.equal(standaloneDisplay({} as Navigator, true, false), true);
  assert.equal(standaloneDisplay({} as Navigator, false, true), true);
});
