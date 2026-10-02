export const FPS = 12;
export const FRAME_MS = 1000 / FPS;
const MAX_DELTA_MS = 1000;

export type Accent = 'blue' | 'orange' | 'yellow';
interface SceneBase { seconds: number; accent?: Accent }
export type Scene =
  | SceneBase & { kind: 'hook'; title: string; line: string }
  | SceneBase & { kind: 'concept'; art: string; artAlt: string; lines: string[] }
  | SceneBase & { kind: 'list'; title: string; points: string[] }
  | SceneBase & { kind: 'versus'; a: { term: string; line: string }; b: { term: string; line: string } }
  | SceneBase & { kind: 'example'; lines: string[]; art?: string; artAlt?: string }
  | SceneBase & { kind: 'cta'; line: string };
export interface Reel { unitId: string; title: string; scenes: Scene[] }
export interface ReelSet { version: 1; fps: number; reels: Reel[] }

export interface Playback { scene: number; frame: number; playing: boolean; ended: boolean }
export type PlaybackAction = { type: 'tick'; frames: number } | { type: 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'restart' };

export const sceneFrames = (scene: Scene) => Math.max(1, Math.round(scene.seconds * FPS));
export const reelFrames = (reel: Reel) => reel.scenes.reduce((total, scene) => total + sceneFrames(scene), 0);
export const startPlayback = (playing = true): Playback => ({ scene: 0, frame: 0, playing, ended: false });

// Real time becomes whole frames, even when rAF is throttled; a long gap (hidden tab) skips one second at most.
export function advanceClock(restMs: number, deltaMs: number): { frames: number; restMs: number } {
  const total = restMs + Math.min(Math.max(deltaMs, 0), MAX_DELTA_MS);
  const frames = Math.floor(total / FRAME_MS + 1e-9);
  return { frames, restMs: Math.max(0, total - frames * FRAME_MS) };
}

export function locate(reel: Reel, frame: number): { scene: number; frame: number } {
  let rest = Math.max(0, Math.floor(frame));
  for (let scene = 0; scene < reel.scenes.length; scene++) {
    const length = sceneFrames(reel.scenes[scene]);
    if (rest < length) return { scene, frame: rest };
    rest -= length;
  }
  const last = reel.scenes.length - 1;
  return { scene: last, frame: sceneFrames(reel.scenes[last]) };
}

export function absoluteFrame(reel: Reel, state: Playback): number {
  return reel.scenes.slice(0, state.scene).reduce((total, scene) => total + sceneFrames(scene), 0) + state.frame;
}

export function step(state: Playback, reel: Reel, action: PlaybackAction): Playback {
  const last = reel.scenes.length - 1;
  const finished: Playback = { scene: last, frame: sceneFrames(reel.scenes[last]), playing: false, ended: true };
  switch (action.type) {
    case 'tick': {
      if (!state.playing || action.frames <= 0) return state;
      let scene = state.scene;
      let frame = state.frame + action.frames;
      while (frame >= sceneFrames(reel.scenes[scene])) {
        if (scene === last) return finished;
        frame -= sceneFrames(reel.scenes[scene]);
        scene += 1;
      }
      return { ...state, scene, frame };
    }
    case 'play': return state.ended ? startPlayback() : { ...state, playing: true };
    case 'pause': return state.playing ? { ...state, playing: false } : state;
    case 'toggle': return state.ended ? startPlayback() : { ...state, playing: !state.playing };
    // Jumping to a scene always plays it, so a paused viewer never lands on an empty first frame.
    case 'next': return state.scene === last ? finished : { scene: state.scene + 1, frame: 0, playing: true, ended: false };
    case 'prev': {
      const replay = state.ended || state.frame > FPS;
      return { scene: replay ? state.scene : Math.max(0, state.scene - 1), frame: 0, playing: true, ended: false };
    }
    case 'restart': return startPlayback();
  }
}

export function segmentFill(reel: Reel, state: Playback): number[] {
  return reel.scenes.map((scene, index) => index < state.scene ? 1 : index > state.scene ? 0 : Math.min(1, state.frame / sceneFrames(scene)));
}

export function sceneText(scene: Scene): string[] {
  switch (scene.kind) {
    case 'hook': return [scene.title, scene.line];
    case 'concept': return scene.lines;
    case 'list': return [scene.title, ...scene.points];
    case 'versus': return [scene.a.term, scene.a.line, scene.b.term, scene.b.line];
    case 'example': return scene.lines;
    case 'cta': return [scene.line];
  }
}

export function firstPendingLesson(lessonIds: readonly string[], completed: readonly string[]): string {
  return lessonIds.find(id => !completed.includes(id)) ?? lessonIds[0];
}
