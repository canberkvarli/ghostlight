import { describe, expect, it } from 'vitest';

import { cameraTrouble } from './camera-trouble';

describe('cameraTrouble', () => {
  it('names the shared screen for reason 4', () => {
    expect(cameraTrouble('Camera interrupted, reason 4')).toMatch(/restart the phone/);
  });
  it('stays quiet when the app only went to the background', () => {
    expect(cameraTrouble('Camera interrupted, reason 1')).toBeNull();
  });
  it('says the camera did not start', () => {
    expect(cameraTrouble('Camera did not start: running=false inputs=1 outputs=1 device=true')).toMatch(/didn’t start/);
  });
  it('ignores a rebuild notice', () => {
    expect(cameraTrouble('Camera was rebuilt after being detached')).toBeNull();
  });
});
