import type { AudioCommand } from '../lib/reelAudio';
import { audioOutput, playEffect } from '../sound/web';

interface Playing { source: AudioBufferSourceNode; gain: GainNode }
// The narration leads; music sits about 20 dB below it and effects stay under both.
// The music file is mastered 3 dB under the voice, so its gain makes up the rest.
const VOICE_GAIN = 1;
const MUSIC_GAIN = .14;
const LAND = { soft: .22, lively: .3 };
const CHIME = { soft: .2, lively: .28 };
const MUSIC_IN = .5;

// Plays what audioCommands decides. Files are decoded into memory instead of streamed:
// the offline cache answers with whole files, which <audio> cannot seek on every browser.
export function createReelAudioEngine() {
  let voiceBuffer: AudioBuffer | null = null;
  let musicBuffer: AudioBuffer | null = null;
  let voice: Playing | null = null;
  let music: Playing | null = null;
  let closed = false;

  async function decode(url: string | null): Promise<AudioBuffer | null> {
    const audio = url ? audioOutput() : null;
    if (!url || !audio) return null;
    try {
      const response = await fetch(url);
      return response.ok ? await audio.context.decodeAudioData(await response.arrayBuffer()) : null;
    } catch { return null; }
  }
  function start(buffer: AudioBuffer, offset: number, duration: number | undefined, volume: number, fadeIn: number): Playing | null {
    const audio = audioOutput();
    if (!audio || offset >= buffer.duration) return null;
    if (audio.context.state !== 'running') void audio.context.resume().catch(() => undefined);
    const now = audio.context.currentTime;
    const source = audio.context.createBufferSource();
    const gain = audio.context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + fadeIn);
    source.connect(gain).connect(audio.output);
    source.start(now, offset, duration);
    return { source, gain };
  }
  function stop(playing: Playing | null, fade: number): null {
    const audio = playing ? audioOutput() : null;
    if (!playing || !audio) return null;
    const now = audio.context.currentTime;
    playing.gain.gain.cancelScheduledValues(now);
    playing.gain.gain.setValueAtTime(playing.gain.gain.value, now);
    playing.gain.gain.linearRampToValueAtTime(0, now + fade);
    try { playing.source.stop(now + fade + .02); } catch { /* already stopped */ }
    return null;
  }
  return {
    async load(files: { voice: string | null; music: string | null }): Promise<boolean> {
      const [voiceLoaded, musicLoaded] = await Promise.all([decode(files.voice), decode(files.music)]);
      if (closed) return false;
      voiceBuffer = voiceLoaded; musicBuffer = musicLoaded;
      return true;
    },
    apply(commands: readonly AudioCommand[]) {
      if (closed) return;
      for (const command of commands) {
        if (command.type === 'voice') { voice = stop(voice, .025); if (voiceBuffer) voice = start(voiceBuffer, command.offset, command.duration, VOICE_GAIN, .02); }
        else if (command.type === 'stopVoice') voice = stop(voice, .025);
        else if (command.type === 'music') { music = stop(music, .05); if (musicBuffer) music = start(musicBuffer, command.position, undefined, MUSIC_GAIN, command.position < .1 ? MUSIC_IN : .08); }
        else if (command.type === 'stopMusic') music = stop(music, command.fade);
        else if (command.type === 'land') playEffect('tap', LAND);
        else playEffect('step', CHIME);
      }
    },
    close() { closed = true; voice = stop(voice, .025); music = stop(music, .05); voiceBuffer = null; musicBuffer = null; },
  };
}
