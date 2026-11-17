import { extractTranscript } from './extract.js'
import { openHistory, HISTORY_DAYS } from './history.js'
import { prepare } from './clean.js'
import { sponsorRanges } from './sponsorblock.js'
import {
  videoId, cleanTitle, today, sweepPath, toMarkdown, indexMarkdown, combinedMarkdown, fileName, wordCount, ago,
  needsView, totals, span, clock, readSeconds, durationOf,
} from './lib.js'

const TIMEOUT = 15000
// Extensions can only save inside Downloads. To keep the files elsewhere, make
// this folder a directory junction (see README).
const ROOT = 'Tab Zero'
const $ = (s) => document.querySelector(s)
const self = await chrome.tabs.getCurrent()
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text ? { textContent: text } : {})
const show = (...ids) => ids.forEach((id) => ($(id).hidden = false))
const hide = (...ids) => ids.forEach((id) => ($(id).hidden = true))

$('#version').textContent = `v${chrome.runtime.getManifest().version}`

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

// ---------- cleanup settings (PRD FR-23), kept in chrome.storage.local ----------

const settings = { fillers: true, sponsorblock: true, ...(await chrome.storage.local.get('settings')).settings }
for (const key of ['fillers', 'sponsorblock']) {
  const box = document.querySelector(`[data-setting="${key}"]`)
  box.checked = settings[key]
  box.onchange = () => {
    settings[key] = box.checked
    chrome.storage.local.set({ settings })
    log(`setting ${key} = ${box.checked}`)
  }
}

// SponsorBlock answers are kept for the page's lifetime, so a retry or a
// second save does not ask again.
const sponsorCache = new Map()

// The raw results, cleaned for a file (PRD FR-22): history keeps the raw text.
async function prepareAll(results) {
  const ok = results.filter((r) => r.status === 'ok')
  if (settings.sponsorblock) {
    const ask = ok.map((r) => r.id).filter((id) => !sponsorCache.has(id))
    if (ask.length) {
      const { ranges, errors } = await sponsorRanges(ask)
      // After a failed request, cache only the videos that were found: the
      // others may sit behind the failed prefix, so the next save asks again.
      for (const id of ask) if (!errors.length || ranges.has(id)) sponsorCache.set(id, ranges.get(id) || [])
      log(`SponsorBlock: segments for ${ranges.size} of ${ask.length} videos` + (errors.length ? `; ${errors.length} requests failed: ${errors.join('; ')}` : ''))
    }
  }
  return results.map((r) =>
    r.status !== 'ok'
      ? r
      : prepare(r, { fillers: settings.fillers, ranges: settings.sponsorblock ? sponsorCache.get(r.id) : undefined }),
  )
}

// ---------- the list ----------

// One tab per video: the same video open twice is collected once.
const seen = new Set()
const tabs = (await chrome.tabs.query({ url: 'https://www.youtube.com/watch*' })).filter((t) => {
  const id = videoId(t.url)
  return id && !seen.has(id) && seen.add(id)
})
const asleepNow = (t) => t.discarded || t.status === 'unloaded'

const rows = new Map() // tab.id -> { li, box, state, meta }
for (const t of tabs) {
  const li = el('li', 'row')
  const box = el('input')
  box.type = 'checkbox'
  box.id = `pick-${t.id}`
  box.checked = true
  const title = el('label', 'title', cleanTitle(t.title))
  title.htmlFor = box.id
  const state = el('span', 'state', asleepNow(t) ? 'asleep' : 'open')
  const meta = el('p', 'meta')
  // Already read: unchecked by default. Checking it takes the transcript from history.
  const known = history.meta(videoId(t.url))
  if (known) {
    box.checked = false
    li.classList.add('off')
    state.textContent = `read ${ago(known.savedAt)}`
  }
  li.append(box, title, state, meta)
  $('#list').append(li)
  rows.set(t.id, { li, box, state, meta })
  box.onchange = () => {
    li.classList.toggle('off', !box.checked)
    syncSelection()
  }
}

const selected = () => tabs.filter((t) => rows.get(t.id).box.checked)
const readBefore = tabs.filter((t) => history.has(videoId(t.url))).length

function syncSelection() {
  const n = selected().length
  $('#all').checked = n === tabs.length
  $('#all').indeterminate = n > 0 && n < tabs.length
  $('#all-count').textContent = `${n} of ${tabs.length} selected`
  $('#go').disabled = n === 0
  $('#go').textContent = n === 1 ? 'Collect 1 video' : `Collect ${n} videos`
}

$('#all').onchange = () => {
  for (const { li, box } of rows.values()) {
    box.checked = $('#all').checked
    li.classList.toggle('off', !box.checked)
  }
  syncSelection()
}

const say = (lede, detail = '') => {
  $('#lede').textContent = lede
  $('#detail').textContent = detail
}

if (tabs.length === 0) {
  say('No YouTube videos are open.', 'Open the videos you want to read, then open this page again.')
  hide('#list-section', '#go')
} else {
  const asleep = tabs.filter(asleepNow).length
  say(
    `${plural(tabs.length, 'YouTube video')} ${tabs.length === 1 ? 'is' : 'are'} open.`,
    [
      readBefore ? `${readBefore === 1 ? '1 was' : `${readBefore} were`} read in the last ${HISTORY_DAYS} days, so ${readBefore === 1 ? 'it starts' : 'they start'} unchecked.` : '',
      asleep ? `${asleep === 1 ? 'The asleep tab is' : `The ${asleep} asleep tabs are`} woken one at a time, read, and put back to sleep.` : '',
      'No tab comes to the front while this runs.',
    ].filter(Boolean).join(' '),
  )
  syncSelection()
}

const setStatus = (tab, text, cls = '') => {
  const r = rows.get(tab.id)
  r.state.textContent = text
  r.li.classList.remove('active', 'ok', 'bad')
  if (cls) r.li.classList.add(cls)
}

// "Byte Notes · 25:00 video · [bar] 4 min to read · cut 0:40"
function showResult(tabId, v) {
  const r = rows.get(tabId)
  const words = wordCount(v.segments)
  const watch = durationOf(v)
  const read = readSeconds(words)
  const bar = el('span', 'ratio')
  bar.style.setProperty('--r', watch ? Math.min(1, read / watch).toFixed(3) : 0)
  bar.title = `${span(read)} to read, ${span(watch)} to watch`
  r.meta.replaceChildren(
    ...[v.channel, watch ? `${clock(watch)} video` : ''].filter(Boolean).map((t) => el('span', '', t)),
    bar,
    el('span', '', `${span(read)} to read`),
    ...(v.stats?.cutSeconds ? [el('span', '', `cut ${clock(v.stats.cutSeconds)}`)] : []),
  )
}

const shortReason = (r) =>
  r.status === 'no-transcript' ? (r.rendered === false ? 'page did not load' : 'no captions') : r.status === 'no-segments' ? 'no lines in time' : 'error'

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

async function collectOne(tab, inView = false) {
  // An asleep tab (Memory Saver, or restored after a restart) has no page to
  // read. Wake it, let YouTube load it as usual, read the panel, then put it
  // back to sleep. Awake tabs are left exactly as they were (no pause).
  const asleep = asleepNow(tab)
  log(`${short(tab)} start: discarded=${tab.discarded} status=${tab.status} window=${tab.windowId} url=${tab.url}`)
  if (asleep) {
    setStatus(tab, 'waking', 'active')
    const ready = loaded(tab.id)
    await chrome.tabs.reload(tab.id)
    log(`${short(tab)} reload sent, waiting for load`)
    await ready
    log(`${short(tab)} loaded`)
  }
  // The tab is never shown during a sweep (PRD NFR-11): showing it ends full
  // screen in that window. A hidden tab that rendered only the player is
  // offered for a retry in view after the sweep, when the user asks.
  if (inView) {
    setStatus(tab, 'reading, tab shown', 'active')
    await chrome.windows.update(tab.windowId, { focused: true })
    await chrome.tabs.update(tab.id, { active: true })
  } else setStatus(tab, 'reading', 'active')
  const res = await extract(tab.id, asleep || inView)
  if (inView) {
    await chrome.windows.update(self.windowId, { focused: true })
    await chrome.tabs.update(self.id, { active: true })
  }
  log(`${short(tab)} read (${inView ? 'in view' : 'hidden'}): ${res.status}, ${res.segments.length} segments`)
  res.log?.forEach((l) => log(`    ${l}`))

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
const download = (path, text, conflictAction = 'uniquify') =>
  chrome.downloads.download({
    url: URL.createObjectURL(new Blob([text], { type: path.endsWith('.md') ? 'text/markdown' : 'application/octet-stream' })),
    filename: `${ROOT}/${path}`,
    conflictAction,
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

  hide('#go')
  show('#stop')
  $('#all').disabled = true
  $('#history-clear').disabled = true // clearing reloads the page, which would kill the sweep
  for (const { box } of rows.values()) box.disabled = true
  log(`sweep ${sweep} start: ${queue.length} of ${tabs.length} videos selected, extension v${chrome.runtime.getManifest().version}, timeout ${TIMEOUT}ms`)
  log(`browser: ${navigator.userAgent}`)
  log(`cleanup: fillers=${settings.fillers} sponsorblock=${settings.sponsorblock}`)

  // One tab at a time on purpose: loading every YouTube page at once uses too much memory.
  for (const [i, tab] of queue.entries()) {
    if (stopping) {
      log(`stopped by you: ${queue.length - i} videos not read`)
      break
    }
    $('#status').textContent = `Reading ${i + 1} of ${queue.length}: ${cleanTitle(tab.title)}`
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
    const v = { ...res, id, collected: date, tabId: tab.id }
    results.push(v)
    if (v.status === 'ok' && !res.fromHistory) {
      // A failed save costs only a re-read next time; never lose the sweep over it.
      await history.save(v).catch((err) => log(`${short(tab)} could not save to history: ${err.message}`))
    }
    if (v.status === 'ok') {
      setStatus(tab, res.fromHistory ? 'from history' : 'done', 'ok')
      showResult(tab.id, v)
    } else setStatus(tab, shortReason(v), 'bad')
    $('#bar').style.setProperty('--p', ((i + 1) / queue.length).toFixed(4))
  }

  const left = queue.length - results.length
  const counts = Object.entries(Object.groupBy(results, (r) => r.status)).map(([s, rs]) => `${s}=${rs.length}`)
  log(`sweep done: ${counts.join(' ') || 'nothing read'}${left ? `, ${left} not read` : ''}`)
  hide('#stop')

  // One download for the transcripts, one for the log, saved side by side.
  // A retry saves them again under the same names.
  let fileId = null
  async function save(conflictAction) {
    $('#status').textContent = settings.sponsorblock ? 'Asking SponsorBlock and saving' : 'Saving'
    const ready = await prepareAll(results)
    fileId = await download(`${sweep}.md`, combinedMarkdown(ready, date), conflictAction)
    await download(`${sweep}.log`, logLines.join('\n') + '\n', conflictAction)
    for (const v of ready) if (v.status === 'ok') showResult(v.tabId, v) // now with the cut
    summarize(ready)
  }

  function summarize(ready) {
    const t = totals(ready)
    const failed = ready.length - t.ok
    say(
      ready.length === 0
        ? 'Nothing was read, so nothing was saved.'
        : `${stopping ? 'Stopped.' : 'Done.'} ${plural(t.ok, 'transcript')} saved${left ? `, ${left} not read` : ''}.`,
      [
        t.sponsorChecked ? `SponsorBlock cut ${span(t.cut)} from ${plural(t.sponsorFound, 'video')}.` : '',
        t.removedWords ? `${plural(t.removedWords, 'filler word')} removed.` : '',
        failed ? `${plural(failed, 'video')} could not be read; the file lists the reasons.` : '',
      ].filter(Boolean).join(' '),
    )
    $('#status').textContent = ready.length ? `${ROOT}/${sweep}.md` : ''
    if (t.ok && t.video) {
      const fig = $('#ratio')
      fig.style.setProperty('--r', Math.min(1, t.read / t.video).toFixed(4))
      $('#ratio-read').textContent = `about ${span(t.read)} to read`
      $('#ratio-watch').textContent = `${span(t.video)} to watch`
      if (fig.hidden) fig.classList.add('grow') // only the first time, not after a retry
      fig.hidden = false
    }
  }

  if (results.length) await save('uniquify')
  else summarize([])

  // Show the saved file in its folder (PRD FR-25).
  if (fileId) {
    show('#show')
    $('#show').onclick = () => chrome.downloads.show(fileId)
  }

  // Close the tabs whose transcript is saved (PRD FR-24). Two clicks, no dialog.
  const readTabs = () => results.filter((r) => r.status === 'ok').map((r) => r.tabId)
  if (readTabs().length) {
    show('#close')
    $('#close').textContent = `Close ${plural(readTabs().length, 'read tab')}`
    $('#close').onclick = twoClicks($('#close'), `Click again to close ${plural(readTabs().length, 'tab')}`, async () => {
      const ids = readTabs()
      await chrome.tabs.remove(ids)
      for (const id of ids) {
        rows.get(id).li.classList.add('gone')
        rows.get(id).state.textContent = 'closed'
      }
      log(`closed ${ids.length} read tabs`)
      hide('#close')
    })
  }

  // Retry in view, only when the user asks: it shows each tab for a few seconds.
  const retry = results.filter(needsView)
  if (retry.length) {
    show('#retry')
    $('#retry').textContent = `Try ${retry.length} again with the tab shown`
  }
  $('#retry').onclick = async () => {
    $('#retry').disabled = true
    log(`retry in view requested for ${retry.length} videos`)
    for (const v of retry) {
      const tab = await chrome.tabs.get(v.tabId).catch(() => null)
      if (!tab) {
        log(`tab ${v.tabId} was closed; cannot retry "${v.title}"`)
        continue
      }
      $('#status').textContent = `Trying again: ${cleanTitle(tab.title)}`
      const res = await collectOne(tab, true).catch((err) => ({ status: `error: ${err.message}`, segments: [] }))
      if (res.status !== 'ok') {
        setStatus(tab, shortReason(res), 'bad')
        continue
      }
      Object.assign(v, res)
      setStatus(tab, 'done', 'ok')
      await history.save(v).catch((err) => log(`${short(tab)} could not save to history: ${err.message}`))
    }
    await save('overwrite')
    hide('#retry')
    log('retry done; the sweep files were saved again')
  }

  // Optional: the same content as one file per video, on request.
  if (results.some((r) => r.status === 'ok')) show('#split')
  $('#split').onclick = async () => {
    $('#split').disabled = true
    const ready = await prepareAll(results)
    const ok = ready.filter((r) => r.status === 'ok')
    for (const v of ok) await download(`${sweep}/${fileName(v)}`, toMarkdown(v))
    // "00-" sorts the index first. Not "_index.md": Chrome reserves names that start with "_".
    await download(`${sweep}/00-index.md`, indexMarkdown(ready, date))
    $('#split').textContent = `Saved ${plural(ok.length, 'file')}`
  }
  renderHistory()
}

// Two clicks, no modal dialog: the first click arms the button for 4 seconds.
function twoClicks(button, armedText, action) {
  let armed = null
  const idle = button.textContent
  return async () => {
    if (!armed) {
      button.textContent = armedText
      armed = setTimeout(() => {
        armed = null
        button.textContent = idle
      }, 4000)
      return
    }
    clearTimeout(armed)
    armed = null
    await action()
  }
}

// ---------- history panel: everything read in the last 30 days ----------

function renderHistory() {
  const all = history.all()
  $('#history-title').textContent = `Read in the last ${HISTORY_DAYS} days (${all.length})`
  $('#history-save').disabled = $('#history-clear').disabled = all.length === 0
  $('#history-list').replaceChildren(
    ...all.map((m) => {
      const li = el('li')
      const a = el('a', '', m.title)
      a.href = `https://www.youtube.com/watch?v=${m.id}`
      a.target = '_blank'
      a.rel = 'noreferrer'
      const info = el('span', '', `${m.channel || 'Unknown channel'} · ${span(readSeconds(m.words))} to read · ${ago(m.savedAt)}`)
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
  await download(`history/${today()} last ${HISTORY_DAYS} days.md`, combinedMarkdown(await prepareAll(results), today()))
  log(`history saved as one file: ${results.length} videos`)
}

$('#history-clear').onclick = twoClicks($('#history-clear'), 'Click again to clear', async () => {
  await history.clear()
  log('history cleared')
  location.reload() // rows marked "read ... ago" must be redrawn
})
