export const FPS = 12;
export const FRAME_MS = 1000 / FPS;
const MAX_DELTA_MS = 1000;

export type Accent = 'blue' | 'orange' | 'yellow';
// `from` cites the lessons a scene adapts and `say` replaces the narrated text; both only serve the scripts.
interface SceneBase { seconds: number; accent?: Accent; from?: string[]; say?: string }
export type Scene =
  | SceneBase & { kind: 'hook'; title: string; line: string }
  | SceneBase & { kind: 'concept'; art: string; artAlt: string; lines: string[] }
  | SceneBase & { kind: 'list'; title: string; points: string[] }
  | SceneBase & { kind: 'versus'; a: { term: string; line: string }; b: { term: string; line: string } }
  | SceneBase & { kind: 'example'; lines: string[]; art?: string; artAlt?: string }
  | SceneBase & { kind: 'cta'; line: string };
// Every reel belongs to a unit; the ones made for one lesson also carry that lesson's id.
export interface Reel { unitId: string; lessonId?: string; title: string; scenes: Scene[] }
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

// A cut-out takes this many frames to drop into place; the narration waits for the first one.
export const LAND_FRAMES = 4;
export const VOICE_FRAME = 4;

// Entry frame of every cut-out of a scene, in reading order. Templates and sound share them,
// so what is heard always matches what lands.
export function sceneCues(scene: Scene): number[] {
  switch (scene.kind) {
    case 'hook': {
      const words = scene.title.split(' ').map((_, index) => 8 + index * 3);
      const strip = Math.max(22, words[words.length - 1] + 3);
      return [4, ...words, strip, strip + 6];
    }
    case 'concept': return [1, ...scene.lines.map((_, index) => 9 + index * 7)];
    case 'versus': return [1, 6, 16, 20];
    case 'list': return [1, ...scene.points.map((_, index) => 10 + index * 14)];
    case 'example': return scene.art ? [1, 4, 12] : [1, 12];
    case 'cta': return [1, 8, 16];
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

// The key names a reel's audio and art files: its lesson when it has one, its unit otherwise.
export const reelKey = (reel: Reel) => reel.lessonId ?? reel.unitId;
// A unit with a single lesson has a single reel: that lesson opens the unit's.
export function reelForLesson(byKey: ReadonlyMap<string, Reel>, lesson: { id: string }, unit: { id: string; lessonIds: readonly string[] }): Reel | undefined {
  return byKey.get(lesson.id) ?? (unit.lessonIds.length === 1 ? byKey.get(unit.id) : undefined);
}

export function firstPendingLesson(lessonIds: readonly string[], completed: readonly string[]): string {
  return lessonIds.find(id => !completed.includes(id)) ?? lessonIds[0];
}

// Feed order follows the course: each unit's own reel, then the reel of each of its lessons.
export function feedOrder(reels: readonly Reel[], units: readonly { id: string; lessonIds: readonly string[] }[]): Reel[] {
  const byKey = new Map(reels.map(reel => [reelKey(reel), reel]));
  const seen = new Set<Reel>();
  const ordered: Reel[] = [];
  for (const unit of units) {
    for (const key of [unit.id, ...unit.lessonIds]) {
      const reel = byKey.get(key);
      if (reel && !seen.has(reel)) { seen.add(reel); ordered.push(reel); }
    }
  }
  return ordered;
}

// The playlist groups the feed by world and unit; every entry points at its position in the feed.
export interface PlaylistItem { index: number; title: string; tag: string }
export interface PlaylistUnit { id: string; title: string; items: PlaylistItem[] }
export interface PlaylistWorld { id: number; title: string; units: PlaylistUnit[] }
export function playlist(feed: readonly Reel[], worlds: readonly { id: number; title: string }[], units: readonly { id: string; worldId: number; title: string }[]): PlaylistWorld[] {
  return worlds.map(world => ({ id: world.id, title: world.title, units: units.filter(unit => unit.worldId === world.id).map(unit => ({
    id: unit.id, title: unit.title,
    items: feed.flatMap((reel, index) => reel.unitId === unit.id ? [{ index, title: reel.title, tag: reel.lessonId ? `Lección ${reel.lessonId}` : 'Unidad' }] : []),
  })).filter(unit => unit.items.length) })).filter(world => world.units.length);
}
