// Storage sits behind an interface so localStorage can later be swapped
// for Supabase/Firebase to sync between two people.
export type Book = { id: string; title: string; author: string; chapters: string[] }
export type ChapterProgress = { status: 'reading' | 'done'; startedAt?: string; doneAt?: string } // ISO dates (YYYY-MM-DD)
// person -> bookId -> chapter index -> progress
export type Progress = Record<string, Record<string, Record<number, ChapterProgress>>>
export type Answer = { person: string; week: number; q?: number | string; text: string; mindBlown?: number; at: string }
export type Note = { person: string; bookId: string; chapter: number; quote: string; confused: boolean; at: string }
export type CustomQuestion = { id: string; week: number; text: string; person: string; at: string }
export interface State { customQuestions: CustomQuestion[]; books: Book[]; currentBookId: string; progress: Progress; answers: Answer[]; notes: Note[] }

export interface Storage { load(defaults: State): State; save(s: State): void }

const KEY = 'bicho-book-club-v2'
export const localStorageBackend: Storage = {
  load(defaults) {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } }
    catch { return defaults }
  },
  save(s) { localStorage.setItem(KEY, JSON.stringify(s)) },
}
