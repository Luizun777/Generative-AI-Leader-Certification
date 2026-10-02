export interface World { id: number; title: string; shortTitle: string; description: string }
export interface Unit { id: string; worldId: number; title: string; lessonIds: string[] }
export interface Lesson { id: string; unitId: string; worldId: number; title: string; idea: string; keyPoints: string[]; example: string; distinctions: string; sourceUrl: string }
export interface Question { id: string; unitId: string | null; lessonIds: string[]; kind: 'single' | 'multiple'; prompt: string; options: {id: string; text: string}[]; correctIds: string[]; explanation: string; exam: boolean; sourceLabel: string; sourceUrl?: string; provenance?: {activityType: string; url: string; language: string; courseVersion: string; verification: string; reviewedAt: string} }
export interface MatchingSet { id: string; unitId: string; title: string; pairs: {id: string; term: string; definition: string}[] }
export interface Curriculum { version: string; sourceDate: string; worlds: World[]; units: Unit[]; lessons: Lesson[]; questions: Question[]; matches: MatchingSet[] }
export type SessionMode = 'lesson' | 'quick' | 'exam';
export interface Session { id: string; mode: SessionMode; lessonId?: string; questionIds: string[]; index: number; responses: {questionId: string; selectedIds: string[]; correct: boolean}[]; startedAt: string; stage: 'intro' | 'question' | 'feedback' | 'results'; selectedIds: string[] }
export interface Progress { schemaVersion: 1; contentVersion: string; xp: number; completedLessons: string[]; answers: Record<string,{attempts: number; correct: number; lastCorrect: boolean; lastAnsweredAt: string}>; streak: {current: number; best: number; lastStudyDate: string | null}; settings: {reducedMotion: boolean}; activeSession: Session | null; completedMatching: string[] }
export interface Backup { app: 'pliegue-ia'; schemaVersion: 1; exportedAt: string; progress: Progress }
