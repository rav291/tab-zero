import { extractTranscript } from './extract.js'
import { openHistory, HISTORY_DAYS } from './history.js'
import {
  videoId, cleanTitle, today, sweepPath, toMarkdown, indexMarkdown, combinedMarkdown, fileName, wordCount, ago,
} from './lib.js'

const TIMEOUT = 15000
// Extensions can only save inside Downloads. To keep the files elsewhere, make
// this folder a directory junction (see README).
const ROOT = 'Tab Zero'
const $ = (s) => document.querySelector(s)
const self = await chrome.tabs.getCurrent()

// ---------- log: page, console, and the .log file saved with the sweep ----------

const t0 = performance.now()
const logLines = []
const log = (msg) => {
  const line = `[${((performance.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${msg}`
  logLines.push(line)
  console.log(line)
  $('#log').textContent += line + '\n'
}
const short = (tab) => `tab ${tab.id} "${cleanTitle(tab.title).slice(0, 50)}"`

const history = await openHistory(chrome.storage.local)
log(`history: ${history.all().length} videos read in the last ${HISTORY_DAYS} days${history.pruned ? `, ${history.pruned} older ones removed` : ''}`)

// ---------- the list ----------

// One tab per video: the same video open twice is collected once.
const seen = new Set()
const tabs = (await chrome.tabs.query({ url: 'https://www.youtube.com/watch*' })).filter((t) => {
  const id = videoId(t.url)
  return id && !seen.has(id) && seen.add(id)
})

const rows = new Map() // tab.id -> { li, box, state }
for (const t of tabs) {
  const li = document.createElement('li')
  li.className = 'row'
  const label = document.createElement('label')
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = true
  const title = document.createElement('span')
  title.className = 'title'
  title.textContent = cleanTitle(t.title)
  const state = document.createElement('span')
  state.className = 'state'
  state.textContent = t.discarded || t.status === 'unloaded' ? 'asleep' : 'awake'
  // Already read: unchecked by default. Checking it takes the transcript from history.
  const seenMeta = history.meta(videoId(t.url))
  if (seenMeta) {
    box.checked = false
    li.classList.add('off')
    state.textContent = `read ${ago(seenMeta.savedAt)}`
  }
  label.append(box, title, state)
  li.append(label)
  $('#list').append(li)
  rows.set(t.id, { li, box, state })
  box.onchange = () => {
    li.classList.toggle('off', !box.checked)
    syncSelection()
  }
}

const selected = () => tabs.filter((t) => rows.get(t.id).box.checked)

const setCount = (n, label) => {
  const el = $('#count')
  if (el.textContent !== String(n)) {
    el.textContent = n
    el.classList.remove('tick')
    void el.offsetWidth // restart the animation
    el.classList.add('tick')
  }
  el.classList.toggle('zero', n === 0 && tabs.length > 0)
  $('#count-label').textContent = label
}

function syncSelection() {
  const n = selected().length
  $('#all').checked = n === tabs.length
  $('#all').indeterminate = n > 0 && n < tabs.length
  $('#all-label').textContent = `${n} of ${tabs.length} selected`
  $('#go').disabled = n === 0
  $('#go').textContent = n === 1 ? 'Collect 1 video' : `Collect ${n} videos`
  setCount(n, n === 1 ? 'video to read' : 'videos to read')
}

$('#all').onchange = () => {
  for (const { li, box } of rows.values()) {
    box.checked = $('#all').checked
    li.classList.toggle('off', !box.checked)
  }
  syncSelection()
}

if (tabs.length === 0) {
  setCount(0, 'No YouTube tabs open')
  $('#summary').textContent = 'Open the videos you want to read, then open this page again.'
  $('.list').hidden = true
} else syncSelection()

const setStatus = (tab, text, cls = '') => {
  const r = rows.get(tab.id)
  r.state.textContent = text
  r.li.classList.remove('active', 'ok', 'bad')
  if (cls) r.li.classList.add(cls)
}

// ---------- reading one tab ----------

// Resolves when the tab has finished loading. Listener first, then the
// check, so a load that finishes in between is not lost.
const loaded = (tabId) =>
  new Promise((resolve) => {
    const done = (id, info) => {
      if (id !== tabId || info.status !== 'complete') return
      chrome.tabs.onUpdated.removeListener(done)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(done)
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && !t.discarded && done(tabId, t))
  })

const extract = async (tabId, pause) => {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractTranscript,
    args: [TIMEOUT, pause],
  })
  if (!result) throw new Error('the in-tab script returned nothing (page error, or the tab navigated or closed)')
  return result
}

async function collectOne(tab) {
  // An asleep tab (Memory Saver, or restored after a restart) has no page to
  // read. Wake it, let YouTube load it as usual, read the panel, then put it
  // back to sleep. Awake tabs are left exactly as they were (no pause).
  const asleep = tab.discarded || tab.status === 'unloaded'
  log(`${short(tab)} start: discarded=${tab.discarded} status=${tab.status} window=${tab.windowId} url=${tab.url}`)
  if (asleep) {
    setStatus(tab, 'waking', 'active')
    const ready = loaded(tab.id)
    await chrome.tabs.reload(tab.id)
    log(`${short(tab)} reload sent, waiting for load`)
    await ready
    log(`${short(tab)} loaded`)
  }
  setStatus(tab, 'reading', 'active')
  let res = await extract(tab.id, asleep)
  log(`${short(tab)} read (hidden): ${res.status}, ${res.segments.length} segments`)
  res.log?.forEach((l) => log(`    ${l}`))

  // A hidden tab may render only the player: no description, no button, no
  // panel. Show it for a moment, then return to this page.
  // Known issue: this switches the active tab, which ends full screen in the
  // window and costs ~15 s on a video that has no transcript (see PRD, section 9).
  if (res.status !== 'ok') {
    setStatus(tab, 'reading, tab shown', 'active')
    log(`${short(tab)} retry with the tab visible`)
    await chrome.windows.update(tab.windowId, { focused: true })
    await chrome.tabs.update(tab.id, { active: true })
    res = await extract(tab.id, asleep)
    await chrome.windows.update(self.windowId, { focused: true })
    await chrome.tabs.update(self.id, { active: true })
    log(`${short(tab)} read (visible): ${res.status}, ${res.segments.length} segments`)
    res.log?.forEach((l) => log(`    ${l}`))
  }

  if (asleep) {
    await chrome.tabs
      .discard(tab.id)
      .then(() => log(`${short(tab)} put back to sleep`))
      .catch((err) => log(`${short(tab)} could not discard: ${err.message}`))
  }
  return res
}

// The browser renames a file to match its MIME type: a ".log" sent as
// text/markdown was saved as ".md" (and then "(1).md" next to the transcript).
// octet-stream has no preferred extension, so the name is kept as given.
const download = (path, text) =>
  chrome.downloads.download({
    url: URL.createObjectURL(new Blob([text], { type: path.endsWith('.md') ? 'text/markdown' : 'application/octet-stream' })),
    filename: `${ROOT}/${path}`,
    conflictAction: 'uniquify',
    saveAs: false,
  })

// A video read in the last 30 days: no tab wake, no YouTube request.
async function fromHistory(tab, id) {
  const meta = history.meta(id)
  if (!meta) return null
  const segments = await history.load(id).catch(() => null)
  if (!segments?.length) {
    log(`${short(tab)} in history but its transcript is missing; reading it again`)
    return null
  }
  log(`${short(tab)} from history: saved ${ago(meta.savedAt)}, ${segments.length} segments`)
  return { status: 'ok', title: meta.title, channel: meta.channel, duration: meta.duration, segments, fromHistory: true }
}

// ---------- the sweep ----------

let stopping = false
$('#stop').onclick = () => {
  stopping = true
  $('#stop').disabled = true
  $('#stop').textContent = 'Stopping after this video'
  log('stop requested; finishing the current video')
}

$('#go').onclick = async () => {
  const queue = selected()
  const date = today()
  const sweep = sweepPath() // fixed at the start, so all files of one sweep share it
  const results = []

  $('#go').hidden = true
  $('#stop').hidden = false
  $('#all').disabled = true
  $('#history-clear').disabled = true // clearing reloads the page, which would kill the sweep
  for (const { box } of rows.values()) box.disabled = true
  log(`sweep ${sweep} start: ${queue.length} of ${tabs.length} videos selected, extension v${chrome.runtime.getManifest().version}, timeout ${TIMEOUT}ms`)
  log(`browser: ${navigator.userAgent}`)

  // One tab at a time on purpose: loading every YouTube page at once uses too much memory.
  for (const [i, tab] of queue.entries()) {
    if (stopping) {
      log(`stopped by you: ${queue.length - i} videos not read`)
      break
    }
    setCount(queue.length - i, 'left to read')
    $('#summary').textContent = `Reading ${cleanTitle(tab.title)}`
    const id = videoId(tab.url)
    let res = await fromHistory(tab, id)
    if (!res) {
      try {
        res = await collectOne(tab)
      } catch (err) {
        log(`${short(tab)} ERROR: ${err.stack || err.message}`)
        res = { status: `error: ${err.message}`, title: cleanTitle(tab.title), channel: '', duration: 0, segments: [] }
      }
    }
    const v = { ...res, id, collected: date }
    results.push(v)
    if (v.status === 'ok' && !res.fromHistory) {
      // A failed save costs only a re-read next time; never lose the sweep over it.
      await history.save(v).catch((err) => log(`${short(tab)} could not save to history: ${err.message}`))
    }
    if (v.status === 'ok') setStatus(tab, `${wordCount(v.segments).toLocaleString()} words${res.fromHistory ? ', from history' : ''}`, 'ok')
    else setStatus(tab, v.status, 'bad')
    $('#bar').style.setProperty('--p', `${((i + 1) / queue.length) * 100}%`)
  }

  const ok = results.filter((r) => r.status === 'ok')
  const left = queue.length - results.length
  const counts = Object.entries(Object.groupBy(results, (r) => r.status)).map(([s, rs]) => `${s}=${rs.length}`)
  log(`sweep done: ${counts.join(' ') || 'nothing read'}${left ? `, ${left} not read` : ''}`)

  $('#stop').hidden = true
  if (results.length) {
    // One download for the transcripts, one for the log, saved side by side.
    await download(`${sweep}.md`, combinedMarkdown(results, date))
    await download(`${sweep}.log`, logLines.join('\n') + '\n')
  }
  setCount(left, left ? (stopping ? 'left. Stopped.' : 'left to read') : 'Tab zero.')
  const failed = results.length - ok.length
  const reused = results.filter((r) => r.fromHistory).length
  $('#summary').textContent = results.length
    ? `Saved ${ok.length} transcripts to ${ROOT}/${sweep}.md${reused ? ` (${reused} from history)` : ''}.` +
      (failed ? ` ${failed} could not be read: the reasons are under "Couldn't collect" at the top of the file, and in the log.` : '')
    : 'Nothing was read, so nothing was saved.'
  renderHistory()

  // Optional: the same content as one file per video, on request.
  $('#split').hidden = ok.length === 0
  $('#split').onclick = async () => {
    $('#split').disabled = true
    for (const v of ok) await download(`${sweep}/${fileName(v)}`, toMarkdown(v))
    // "00-" sorts the index first. Not "_index.md": Chrome reserves names that start with "_".
    await download(`${sweep}/00-index.md`, indexMarkdown(results, date))
    $('#split').textContent = `Saved ${ok.length} files`
  }
}

// ---------- history panel: everything read in the last 30 days ----------

function renderHistory() {
  const all = history.all()
  $('#history-title').textContent = `Read in the last ${HISTORY_DAYS} days (${all.length})`
  $('#history-save').disabled = $('#history-clear').disabled = all.length === 0
  $('#history-list').replaceChildren(
    ...all.map((m) => {
      const li = document.createElement('li')
      const a = document.createElement('a')
      a.href = `https://www.youtube.com/watch?v=${m.id}`
      a.target = '_blank'
      a.textContent = m.title
      const info = document.createElement('span')
      info.textContent = `${m.channel || 'Unknown channel'}, ${m.words.toLocaleString()} words, ${ago(m.savedAt)}`
      li.append(a, info)
      return li
    }),
  )
}
renderHistory()

$('#history-save').onclick = async () => {
  const all = history.all()
  const results = []
  for (const m of all) results.push({ ...m, status: 'ok', segments: (await history.load(m.id)) || [] })
  await download(`history/${today()} last ${HISTORY_DAYS} days.md`, combinedMarkdown(results, today()))
  log(`history saved as one file: ${results.length} videos`)
}

// Two clicks, no modal dialog: the first click arms the button for 4 seconds.
let armed = null
$('#history-clear').onclick = async () => {
  if (!armed) {
    $('#history-clear').textContent = 'Click again to clear'
    armed = setTimeout(() => {
      armed = null
      $('#history-clear').textContent = 'Clear history'
    }, 4000)
    return
  }
  clearTimeout(armed)
  await history.clear()
  log('history cleared')
  location.reload() // rows marked "read ... ago" must be redrawn
}
