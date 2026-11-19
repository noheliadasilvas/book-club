import './style.css'
import questions from './questions.json'
import { CLUB_NAME, START_DATE, PEOPLE, DEFAULT_BOOK } from './config'
import { localStorageBackend as store, type State, type Book } from './storage'

const state: State = store.load({ books: [DEFAULT_BOOK], currentBookId: DEFAULT_BOOK.id, progress: {}, answers: [], notes: [] })
// The starting book's chapter list always comes from config.ts, so edits there show up
// even if this browser already saved an older copy.
state.books = state.books.map(b => b.id === DEFAULT_BOOK.id ? DEFAULT_BOOK : b)
const app = document.querySelector<HTMLDivElement>('#app')!
type Tab = 'week' | 'answers' | 'reading' | 'books' | 'notes'
const TABS: [Tab, string][] = [['week', '✨ Semana'], ['answers', '💬 Respuestas'], ['reading', '📖 Lectura'], ['books', '📚 Libros'], ['notes', '💡 Notas']]
let tab: Tab = 'week'
let me = localStorage.getItem('bicho-me') ?? PEOPLE[0]

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const today = () => new Date().toISOString().slice(0, 10)
const fmt = (d?: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es', { month: 'short', day: 'numeric' }) : ''
const week = Math.max(1, Math.floor((Date.now() - new Date(START_DATE).getTime()) / (7 * 864e5)) + 1)
const q = questions[(week - 1) % questions.length]
const save = () => { store.save(state); render() }

const book = () => state.books.find(b => b.id === state.currentBookId) ?? state.books[0]
const prog = (p: string, b: Book) => state.progress[p]?.[b.id] ?? {}
const doneCount = (p: string, b: Book) => Object.values(prog(p, b)).filter(c => c.status === 'done').length
const isFinished = (p: string, b: Book) => b.chapters.length > 0 && doneCount(p, b) === b.chapters.length
const finishDate = (p: string, b: Book) => Object.values(prog(p, b)).map(c => c.doneAt ?? '').sort().pop()

function weekView() {
  const mine = state.answers.find(a => a.person === me && a.week === week)
  const others = state.answers.filter(a => a.person !== me && a.week === week)
  return `
    <p class="tag">${esc(q.type)} · semana ${week}</p>
    <h2>${esc(q.text)}</h2>
    <form id="answer">
      <textarea name="text" rows="4" placeholder="Tu respuesta…" required>${esc(mine?.text ?? '')}</textarea>
      <label>Mente explotada (1-10) <input type="number" name="mb" min="1" max="10" value="${mine?.mindBlown ?? ''}"></label>
      <button>${mine ? 'Actualizar' : 'Publicar'} respuesta</button>
    </form>
    <h3>Su respuesta</h3>
    ${mine ? (others.map(a => `<blockquote><b>${esc(a.person)}</b>: ${esc(a.text)}${a.mindBlown ? ` <span class="muted">(🤯 ${a.mindBlown}/10)</span>` : ''}</blockquote>`).join('') || '<p class="muted">Todavía nada.</p>')
           : '<p class="muted">Publica la tuya para ver la suya 🔒</p>'}`
}

function answersView() {
  const weeks = Array.from({ length: week }, (_, i) => week - i)
  return `<h2>Preguntas y respuestas</h2>` + weeks.map(w => {
    const qq = questions[(w - 1) % questions.length]
    const mine = state.answers.find(a => a.person === me && a.week === w)
    const rows = PEOPLE.map(p => {
      const a = state.answers.find(x => x.person === p && x.week === w)
      if (!a) return `<div class="muted">${esc(p)}: sin responder</div>`
      if (p !== me && !mine) return `<div class="muted">${esc(p)}: ya respondió 🔒 (publica la tuya para verla)</div>`
      return `<blockquote><b>${esc(p)}</b>: ${esc(a.text)}${a.mindBlown ? ` <span class="muted">(🤯 ${a.mindBlown}/10)</span>` : ''}</blockquote>`
    }).join('')
    return `<div class="card"><p class="tag">semana ${w} · ${esc(qq.type)}</p><b>${esc(qq.text)}</b>${rows}</div>`
  }).join('')
}

function readingView() {
  const b = book()
  const bars = PEOPLE.map(p => `<div class="card"><div class="row"><b>${esc(p)}</b><span class="muted">${doneCount(p, b)}/${b.chapters.length}</span></div>
    <div class="bar"><i style="width:${Math.round(doneCount(p, b) / b.chapters.length * 100)}%"></i></div>
    <div class="planets">${b.chapters.map((c, i) => `<span class="planet ${prog(p, b)[i]?.status ?? ''}" style="--h:${300 + i * 8}" title="${esc(c)}"></span>`).join('')}</div></div>`).join('')
  const chapters = b.chapters.map((name, i) => {
    const mine = prog(me, b)[i]
    return `<div class="chapter"><div><b>${esc(name)}</b>
        <select data-chapter="${i}">
          <option value="">sin empezar</option>
          <option value="reading" ${mine?.status === 'reading' ? 'selected' : ''}>📖 leyendo</option>
          <option value="done" ${mine?.status === 'done' ? 'selected' : ''}>✅ listo</option>
        </select></div>
      ${PEOPLE.map(p => { const c = prog(p, b)[i]; return `<span class="chip ${c?.status ?? ''}">${esc(p)}: ${c ? (c.status === 'done' ? `listo ${fmt(c.doneAt)}` : `leyendo desde ${fmt(c.startedAt)}`) : '—'}</span>` }).join('')}
    </div>`
  }).join('')
  return `<h2>${esc(b.title)}</h2><p class="muted">${esc(b.author)}</p>${bars}${chapters}`
}

function booksView() {
  const events = state.books.flatMap(b => PEOPLE.flatMap(p => Object.entries(prog(p, b)).flatMap(([i, c]) => [
    c.startedAt && { d: c.startedAt, t: `${p} empezó ${b.chapters[+i]} · ${b.title}` },
    c.doneAt && { d: c.doneAt, t: `${p} terminó ${b.chapters[+i]} · ${b.title}` },
  ]))).filter((e): e is { d: string; t: string } => !!e).sort((a, b) => b.d.localeCompare(a.d))
  return `
    <h2>Libros</h2>
    ${state.books.map(b => `<div class="book"><b>${esc(b.title)}</b> <span class="muted">${esc(b.author)}</span>
      ${PEOPLE.map(p => `<div class="muted">${esc(p)}: ${isFinished(p, b) ? `🏆 terminó ${fmt(finishDate(p, b))}` : `${doneCount(p, b)}/${b.chapters.length} capítulos`}</div>`).join('')}
      ${b.id === state.currentBookId ? '<span class="chip reading">actual</span>' : `<button data-current="${esc(b.id)}">Poner como actual</button>`}</div>`).join('')}
    <h3>Agregar un libro</h3>
    <form id="addbook"><input name="title" placeholder="Título" required><input name="author" placeholder="Autor/a">
      <label>Capítulos <input type="number" name="n" min="1" max="100" value="10"></label><button>Agregar libro</button></form>
    <h3>Línea de tiempo</h3>
    ${events.map(e => `<div class="muted">${fmt(e.d)} — ${esc(e.t)}</div>`).join('') || '<p class="muted">Todavía nada. Marca un capítulo como "leyendo" para empezar.</p>'}`
}

function notesView() {
  const b = book()
  return `
    <form id="note">
      <select name="chapter">${b.chapters.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join('')}</select>
      <input name="quote" placeholder="Cita o idea favorita" required>
      <label><input type="checkbox" name="confused"> ¿cómo? (confundida/o)</label>
      <button>Agregar</button>
    </form>
    ${state.notes.slice().reverse().map(n => { const nb = state.books.find(x => x.id === n.bookId)
      return `<blockquote>${n.confused ? '🤔 ' : '💡 '}<b>${esc(n.person)}</b> · ${esc(nb?.chapters[n.chapter] ?? '')}: ${esc(n.quote)}</blockquote>` }).join('')}`
}

function render() {
  app.innerHTML = `
    <div class="layout">
      <nav>${TABS.map(([t, label]) => { const [ic, ...rest] = label.split(' '); return `<button data-tab="${t}" class="t-${t} ${t === tab ? 'on' : ''}" title="${esc(rest.join(' '))}"><span class="ic">${ic}</span><span class="lb">${esc(rest.join(' '))}</span></button>` }).join('')}</nav>
      <div class="content">
        <header><h1>🐛📚 ${esc(CLUB_NAME)}</h1>
          <label>Soy <select id="me">${PEOPLE.map(p => `<option ${p === me ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
        </header>
        <main>${{ week: weekView, answers: answersView, reading: readingView, books: booksView, notes: notesView }[tab]()}</main>
      </div>
    </div>`

  app.querySelector<HTMLSelectElement>('#me')!.onchange = e => { me = (e.target as HTMLSelectElement).value; localStorage.setItem('bicho-me', me); render() }
  app.querySelectorAll<HTMLButtonElement>('nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab as Tab; render() })
  app.querySelector<HTMLFormElement>('#answer')?.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target as HTMLFormElement)
    state.answers = state.answers.filter(a => !(a.person === me && a.week === week))
    state.answers.push({ person: me, week, text: String(f.get('text')), mindBlown: Number(f.get('mb')) || undefined, at: new Date().toISOString() }); save()
  })
  app.querySelectorAll<HTMLSelectElement>('select[data-chapter]').forEach(s => s.onchange = () => {
    const i = Number(s.dataset.chapter), b = book(), mine = ((state.progress[me] ??= {})[b.id] ??= {})
    if (!s.value) delete mine[i]
    else mine[i] = { status: s.value as 'reading' | 'done', startedAt: mine[i]?.startedAt ?? today(), doneAt: s.value === 'done' ? today() : undefined }
    save()
  })
  app.querySelectorAll<HTMLButtonElement>('button[data-current]').forEach(b => b.onclick = () => { state.currentBookId = b.dataset.current!; save() })
  app.querySelector<HTMLFormElement>('#addbook')?.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target as HTMLFormElement), n = Number(f.get('n')) || 1
    const nb: Book = { id: crypto.randomUUID(), title: String(f.get('title')), author: String(f.get('author')), chapters: Array.from({ length: n }, (_, i) => `Capítulo ${i + 1}`) }
    state.books.push(nb); state.currentBookId = nb.id; save()
  })
  app.querySelector<HTMLFormElement>('#note')?.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target as HTMLFormElement)
    state.notes.push({ person: me, bookId: book().id, chapter: Number(f.get('chapter')), quote: String(f.get('quote')), confused: f.has('confused'), at: new Date().toISOString() }); save()
  })
}
render()
