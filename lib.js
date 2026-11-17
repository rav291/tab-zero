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

const durationOf = (v) => v.duration || (v.segments.length ? toSeconds(v.segments.at(-1).t) : 0)
const body = (v) => paragraphs(v.segments).map((p) => `**[${p.t}]** ${p.text}\n`)

// One video as a section of the combined file (no front matter mid-document).
export const toSection = (v) =>
  [
    `## ${v.title}`,
    '',
    `${v.channel} · ${clock(durationOf(v))} · ${wordCount(v.segments)} words · https://www.youtube.com/watch?v=${v.id}`,
    '',
    ...body(v),
  ].join('\n')

// Everything in one file: one download instead of one per video.
export const combinedMarkdown = (results, date) =>
  [indexMarkdown(results, date, false), ...results.filter((r) => r.status === 'ok').map(toSection)].join('\n')

// v: { id, title, channel, duration, segments, collected }
export function toMarkdown(v) {
  const duration = durationOf(v)
  return [
    '---',
    `title: ${JSON.stringify(v.title)}`, // a JSON string is a valid YAML string
    `channel: ${JSON.stringify(v.channel)}`,
    `url: https://www.youtube.com/watch?v=${v.id}`,
    `duration: ${clock(duration)}`,
    `words: ${wordCount(v.segments)}`,
    `collected: ${v.collected}`,
    '---',
    '',
    `# ${v.title}`,
    '',
    ...body(v),
  ].join('\n')
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
  const ok = results.filter((r) => r.status === 'ok')
  const failed = results.filter((r) => r.status !== 'ok')
  return [
    `# YouTube tabs, ${date}`,
    '',
    `${ok.length} of ${results.length} transcripts collected, ${ok.reduce((n, r) => n + wordCount(r.segments), 0)} words.`,
    '',
    ...(failed.length
      ? [
          "## Couldn't collect",
          '',
          ...failed.map((r) => `- [${r.title}](https://www.youtube.com/watch?v=${r.id}): ${reasonFor(r.status)}`),
          '',
        ]
      : []),
    '| # | Video | Channel | Words | Status |',
    '|---|---|---|---|---|',
    ...results.map((r, i) => {
      const video = r.status === 'ok' && linkFiles ? `[${cell(r.title)}](<${fileName(r)}>)` : cell(r.title)
      return `| ${i + 1} | ${video} ([yt](https://www.youtube.com/watch?v=${r.id})) | ${cell(r.channel)} | ${wordCount(r.segments)} | ${r.status} |`
    }),
    '',
  ].join('\n')
}
