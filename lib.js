// Pure helpers: no chrome.*, no DOM, so `npm test` can run them in Node.

export const videoId = (url) => new URL(url).searchParams.get('v')

// "(3) Title - YouTube" -> "Title". The prefix is YouTube's notification count.
export const cleanTitle = (t) => t.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '')

export const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

// "11:09" -> 669, "1:02:03" -> 3723
export const toSeconds = (t) => t.split(':').reduce((s, p) => s * 60 + (Number(p) || 0), 0)

const pad = (n) => String(n).padStart(2, '0')
export const clock = (sec) => {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// Where one sweep is saved, relative to the root folder: "2026-11/2026-11-13 15-30".
// A month folder, then the date and time (no ":", because Windows rejects it).
export const sweepPath = (d = new Date()) => {
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${day.slice(0, 7)}/${day} ${pad(d.getHours())}-${pad(d.getMinutes())}`
}

export const wordCount = (segments) => segments.reduce((n, s) => n + s.text.split(' ').length, 0)

// One paragraph per minute, one timestamp per paragraph: readable, and far
// fewer tokens than a timestamp on every caption line.
export function paragraphs(segments, every = 60) {
  const out = []
  for (const s of segments) {
    const bucket = Math.floor(toSeconds(s.t) / every)
    const last = out.at(-1)
    if (last && last.bucket === bucket) last.text += ' ' + s.text
    else out.push({ t: s.t, bucket, text: s.text })
  }
  return out
}

export function fileName(v) {
  const safe = v.title
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '')
  return `${safe || 'untitled'} [${v.id}].md`
}

export const durationOf = (v) => v.duration || (v.segments.length ? toSeconds(v.segments.at(-1).t) : 0)
const body = (v) => paragraphs(v.segments).map((p) => `**[${p.t}]** ${p.text}\n`)

// Average silent reading speed for English non-fiction: 238 words per minute
// (Brysbaert, 2019, "How many words do we read per minute?").
export const WPM = 238
export const readSeconds = (words) => Math.round((words / WPM) * 60)

// A length for people: "45 s", "24 min", "1 h 05 min".
export const span = (sec) => {
  if (sec < 60) return `${Math.round(sec)} s`
  const m = Math.round(sec / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`
}

export const SB_ATTRIBUTION = 'Uses SponsorBlock data licensed under CC BY-NC-SA 4.0 from https://sponsor.ajay.app/.'
const sponsorUsed = (vs) => vs.some((v) => v.stats?.cutSeconds > 0)
const footer = (vs) => (sponsorUsed(vs) ? ['', '---', '', SB_ATTRIBUTION, ''] : [])

// "Cut 1:30 by SponsorBlock" and "removed 42 filler words", when there is something to say.
const cleanupNote = (s) =>
  [s?.cutSeconds ? `SponsorBlock cut ${clock(s.cutSeconds)}` : '', s?.removedWords ? `${s.removedWords} filler words removed` : '']
    .filter(Boolean)
    .join(', ')

// One video as a section of the combined file (no front matter mid-document).
export const toSection = (v) => {
  const words = wordCount(v.segments)
  const note = cleanupNote(v.stats)
  return [
    `## ${v.title}`,
    '',
    `${v.channel} · ${clock(durationOf(v))} video · ${span(readSeconds(words))} to read · ${words} words · https://www.youtube.com/watch?v=${v.id}`,
    ...(note ? ['', `_${note}._`] : []),
    '',
    ...body(v),
  ].join('\n')
}

// Everything in one file: one download instead of one per video.
export const combinedMarkdown = (results, date) => {
  const ok = results.filter((r) => r.status === 'ok')
  return [indexMarkdown(results, date, false), ...ok.map(toSection), ...footer(ok)].join('\n')
}

// v: { id, title, channel, duration, segments, collected, stats? }
export function toMarkdown(v) {
  const words = wordCount(v.segments)
  return [
    '---',
    `title: ${JSON.stringify(v.title)}`, // a JSON string is a valid YAML string
    `channel: ${JSON.stringify(v.channel)}`,
    `url: https://www.youtube.com/watch?v=${v.id}`,
    `duration: ${clock(durationOf(v))}`,
    `words: ${words}`,
    `read_minutes: ${Math.max(1, Math.round(readSeconds(words) / 60))}`,
    ...(v.stats?.cutSeconds ? [`sponsorblock_cut: ${clock(v.stats.cutSeconds)}`] : []),
    `collected: ${v.collected}`,
    '---',
    '',
    `# ${v.title}`,
    '',
    ...body(v),
    ...footer([v]),
  ].join('\n')
}

// Totals for the index and the page: video time, reading time, cut time.
export function totals(results) {
  const ok = results.filter((r) => r.status === 'ok')
  const words = ok.reduce((n, r) => n + wordCount(r.segments), 0)
  const checked = ok.filter((r) => r.stats?.sponsorChecked)
  return {
    ok: ok.length,
    words,
    video: ok.reduce((n, r) => n + durationOf(r), 0),
    read: readSeconds(words),
    cut: ok.reduce((n, r) => n + (r.stats?.cutSeconds || 0), 0),
    sponsorChecked: checked.length,
    sponsorFound: checked.filter((r) => r.stats.cutSeconds > 0).length,
    removedWords: ok.reduce((n, r) => n + (r.stats?.removedWords || 0), 0),
  }
}

// "today", "yesterday", "3 days ago": for the history list and row states.
export const ago = (savedAt, now = Date.now()) => {
  const days = Math.floor((now - savedAt) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

// A status in words, for the "Couldn't collect" list.
export const reasonFor = (status) =>
  ({
    'no-transcript': 'No "Show transcript" button appeared. The video may have no captions, or the page did not load fully.',
    'no-segments': 'The transcript panel opened, but no lines appeared in time.',
  })[status] || status

// A hidden tab can render only the player. Showing the tab can help then,
// but never for a video that rendered fully and has no captions.
export const needsView = (r) => r.status === 'no-segments' || (r.status === 'no-transcript' && r.rendered === false)

// results: [{ id, title, channel, status, segments }]. linkFiles: link each
// title to its own .md file (separate files) or not (combined file).
export function indexMarkdown(results, date, linkFiles = true) {
  const cell = (s) => s.replace(/\|/g, '\\|')
  const failed = results.filter((r) => r.status !== 'ok')
  const t = totals(results)
  const cleanup = [
    t.sponsorChecked ? `SponsorBlock had segments for ${t.sponsorFound} of ${t.sponsorChecked} videos and cut ${span(t.cut)}.` : '',
    t.removedWords ? `The cleanup removed ${t.removedWords} filler words.` : '',
  ].filter(Boolean)
  return [
    `# YouTube tabs, ${date}`,
    '',
    `${t.ok} of ${results.length} transcripts collected, ${t.words} words.`,
    ...(t.ok ? [`${span(t.video)} of video, about ${span(t.read)} to read.`] : []),
    ...(cleanup.length ? [cleanup.join(' ')] : []),
    '',
    ...(failed.length
      ? [
          "## Couldn't collect",
          '',
          ...failed.map((r) => `- [${r.title}](https://www.youtube.com/watch?v=${r.id}): ${reasonFor(r.status)}`),
          '',
        ]
      : []),
    '| # | Video | Channel | Length | Read | Cut | Status |',
    '|---|---|---|---|---|---|---|',
    ...results.map((r, i) => {
      const ok = r.status === 'ok'
      const video = ok && linkFiles ? `[${cell(r.title)}](<${fileName(r)}>)` : cell(r.title)
      const len = ok ? clock(durationOf(r)) : ''
      const read = ok ? span(readSeconds(wordCount(r.segments))) : ''
      const cut = r.stats?.cutSeconds ? clock(r.stats.cutSeconds) : ''
      return `| ${i + 1} | ${video} ([yt](https://www.youtube.com/watch?v=${r.id})) | ${cell(r.channel)} | ${len} | ${read} | ${cut} | ${r.status} |`
    }),
    '',
    ...(linkFiles ? footer(results) : []),
  ].join('\n')
}
