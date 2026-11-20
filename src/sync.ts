// Firebase sync. Layout in Firestore:
//   clubs/{sha256(club code)}                 -> shared: books, currentBookId
//   clubs/{sha256(club code)}/people/{name}   -> that person's progress, answers, notes, own questions
// Each person only writes their own people doc, so the two of you never overwrite each other.
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { getFirestore, doc, collection, onSnapshot, setDoc } from 'firebase/firestore'
import type { State, Book } from './storage'

// These identify the project and are public by design. Access is protected by the Firestore rules + the secret club code.
const app = initializeApp({
  apiKey: 'AIzaSyAHtTjB6AzOiDnJxmipLQwOfKopNrCGScg',
  authDomain: 'book-club-2705c.firebaseapp.com',
  projectId: 'book-club-2705c',
  storageBucket: 'book-club-2705c.firebasestorage.app',
  messagingSenderId: '929789763415',
  appId: '1:929789763415:web:6df7977802649f3c63a812',
})
const auth = getAuth(app)
const db = getFirestore(app)

const clean = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) // Firestore rejects `undefined`

async function hashCode(code: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.trim().toLowerCase()))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

let cid = ''
let club: { books?: Record<string, Book>; currentBookId?: string } = {}
const people: Record<string, any> = {}
let unsubs: (() => void)[] = []

export type Status = 'off' | 'connecting' | 'on' | 'error'

export async function connect(opts: { code: string; me: string; state: State; defaultBook: Book; onChange: () => void; onStatus: (s: Status, msg?: string) => void }) {
  const { code, me, state, defaultBook, onChange, onStatus } = opts
  disconnect()
  onStatus('connecting')
  try {
    await signInAnonymously(auth)
    cid = await hashCode(code)
    pushMine(me, state, true) // send what is already on this device first, so it is not lost
    const merge = () => {
      state.books = [defaultBook, ...Object.values(club.books ?? {}).filter(b => b.id !== defaultBook.id)]
      if (club.currentBookId) state.currentBookId = club.currentBookId
      state.progress = {}; state.answers = []; state.notes = []; state.customQuestions = []
      for (const [p, d] of Object.entries(people)) {
        state.progress[p] = d.progress ?? {}
        state.answers.push(...(d.answers ?? []))
        state.notes.push(...(d.notes ?? []))
        state.customQuestions.push(...(d.customQuestions ?? []))
      }
      onChange()
    }
    const fail = (e: Error) => onStatus('error', e.message)
    unsubs = [
      onSnapshot(doc(db, 'clubs', cid), s => { club = (s.data() as typeof club) ?? {}; onStatus('on'); merge() }, fail),
      onSnapshot(collection(db, 'clubs', cid, 'people'), s => { for (const d of s.docs) people[d.id] = d.data(); merge() }, fail),
    ]
  } catch (e) { onStatus('error', (e as Error).message) }
}

export function disconnect() { unsubs.forEach(u => u()); unsubs = []; cid = ''; club = {}; for (const k of Object.keys(people)) delete people[k] }

// Write only my own slice. `club` also writes the shared books list / current book.
export function pushMine(me: string, s: State, withClub = false) {
  if (!cid) return
  setDoc(doc(db, 'clubs', cid, 'people', me), clean({
    progress: s.progress[me] ?? {},
    answers: s.answers.filter(a => a.person === me),
    notes: s.notes.filter(n => n.person === me),
    customQuestions: s.customQuestions.filter(c => c.person === me),
    updatedAt: new Date().toISOString(),
  })).catch(console.error)
  if (withClub) setDoc(doc(db, 'clubs', cid), clean({
    currentBookId: s.currentBookId,
    books: Object.fromEntries(s.books.map(b => [b.id, b])),
  }), { merge: true }).catch(console.error)
}
