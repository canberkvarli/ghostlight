import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The recogniser going deaf. Apple's recogniser listens through an audio
 * engine it builds at each start and never watches: if that engine is
 * stopped under it (the session reconfigured mid-run), it goes on "listening"
 * to nothing, with no error, until something restarts it. The level readings
 * come off the same input, through silence as much as speech, so their
 * stopping is the engine stopping.
 */

type Listener = (e: unknown) => void;
const listeners = new Map<string, Listener[]>();
const module = {
  start: vi.fn(),
  abort: vi.fn(() => emit('end', {})),
  addListener: vi.fn((name: string, fn: Listener) => {
    listeners.set(name, [...(listeners.get(name) ?? []), fn]);
    return { remove: () => listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn)) };
  }),
  supportsOnDeviceRecognition: () => true,
  isRecognitionAvailable: () => true,
};
function emit(name: string, e: unknown) {
  for (const fn of listeners.get(name) ?? []) fn(e);
}

vi.mock('expo-speech-recognition', () => ({ ExpoSpeechRecognitionModule: module }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const { Mic, DEAF_AFTER_MS } = await import('./mic');

function makeMic() {
  const onDeaf = vi.fn();
  const mic = new Mic({ onTranscript: () => {}, onOverheard: () => {}, onQuiet: () => {}, onFailed: () => {}, onDeaf });
  mic.attach();
  return { mic, onDeaf };
}

describe('Mic, the engine going deaf', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listeners.clear();
    module.start.mockClear();
    module.abort.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('asks for level readings when it starts', () => {
    const { mic } = makeMic();
    mic.listen();
    expect(module.start).toHaveBeenCalledWith(expect.objectContaining({ volumeChangeEventOptions: expect.objectContaining({ enabled: true }) }));
  });

  it('leaves a live engine alone through a long silence', () => {
    const { mic, onDeaf } = makeMic();
    mic.listen();
    for (let t = 0; t < 10_000; t += 250) {
      emit('volumechange', { value: -2 }); // silence still reads
      vi.advanceTimersByTime(250);
    }
    expect(module.abort).not.toHaveBeenCalled();
    expect(onDeaf).not.toHaveBeenCalled();
  });

  it('restarts the recogniser when the readings stop', () => {
    const { mic, onDeaf } = makeMic();
    mic.listen();
    emit('volumechange', { value: 3 });
    vi.advanceTimersByTime(DEAF_AFTER_MS + 1100);
    expect(module.abort).toHaveBeenCalledTimes(1);
    expect(module.start).toHaveBeenCalledTimes(2); // the end that abort sends starts it again
    expect(onDeaf).toHaveBeenCalledTimes(1);
  });

  it('gives a fresh start time to come up before judging it', () => {
    const { mic } = makeMic();
    mic.listen(); // no reading yet: Apple takes most of a second to start
    vi.advanceTimersByTime(DEAF_AFTER_MS - 200);
    expect(module.abort).not.toHaveBeenCalled();
  });

  it('does not watch once stopped', () => {
    const { mic } = makeMic();
    mic.listen();
    mic.stop();
    module.abort.mockClear();
    vi.advanceTimersByTime(DEAF_AFTER_MS * 3);
    expect(module.abort).not.toHaveBeenCalled();
  });
});
