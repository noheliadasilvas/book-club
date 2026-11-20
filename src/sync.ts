// Firebase sync. Layout in Firestore:
//   clubs/bicho                 -> shared: books, currentBookId
//   clubs/bicho/people/{name}   -> that person's progress, answers, notes, own questions
// Each person only writes their own people doc, so the two of you never overwrite each other.
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { getFirestore, doc, collection, onSnapshot, setDoc } from 'firebase/firestore'
import type { State, Book } from './storage'

// These identify the project and are public by design. Access is protected by Google sign-in + the Firestore rules, which only allow the two club emails.
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

const CLUB = 'bicho'
export const watchUser = (cb: (u: User | null) => void) => onAuthStateChanged(auth, cb)
export const signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider())
export const signOutUser = () => signOut(auth)

let cid = ''
let club: { books?: Record<string, Book>; currentBookId?: string } = {}
const people: Record<string, any> = {}
let unsubs: (() => void)[] = []

export type Status = 'off' | 'connecting' | 'on' | 'error'

export async function connect(opts: { me: string; state: State; defaultBook: Book; onChange: () => void; onStatus: (s: Status, msg?: string) => void }) {
  const { me, state, defaultBook, onChange, onStatus } = opts
  disconnect()
  onStatus('connecting')
  try {
    cid = CLUB
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
