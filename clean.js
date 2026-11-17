// Phase 1 cleanup: word lists and regular expressions, one pass each, no AI model.
// Pure: no chrome.*, no DOM, so `npm test` runs it in Node.
import { toSeconds, paragraphs } from './lib.js'

// One video, ready to save: SponsorBlock cuts, then one paragraph per minute,
// then the text cleanup. Cleaning whole paragraphs also catches a stutter split
// across two caption lines. The raw segments (kept in history) are not changed.
// ranges: undefined = SponsorBlock off; [] = on, but no segments for this video.
export function prepare(v, { fillers = true, ranges } = {}) {
  const cut = ranges?.length ? cutSegments(v.segments, ranges, v.duration) : { segments: v.segments, cutSeconds: 0 }
  let removedWords = 0
  const segments = paragraphs(cut.segments)
    .map(({ t, text }) => {
      if (!fillers) return { t, text }
      const r = cleanText(text)
      removedWords += r.removed
      return { t, text: r.text }
    })
    .filter((s) => s.text)
  return { ...v, segments, stats: { cutSeconds: cut.cutSeconds, sponsorChecked: ranges !== undefined, removedWords } }
}

// Overlapping or touching ranges become one: [[0,10],[5,20],[30,40]] -> [[0,20],[30,40]].
export function mergeRanges(ranges) {
  const out = []
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const last = out.at(-1)
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

// Drops the caption lines that start inside a cut range (ranges merged, in
// seconds). cutSeconds is the length of the ranges, clipped to the video,
// because SponsorBlock times can run past the end.
export function cutSegments(segments, ranges, duration = 0) {
  const end = duration || Infinity
  const inCut = (t) => ranges.some(([a, b]) => t >= a && t < b)
  return {
    segments: segments.filter((s) => !inCut(toSeconds(s.t))),
    cutSeconds: Math.round(ranges.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, end) - Math.max(a, 0)), 0)),
  }
}

// Filled pauses: the English list of transcription-cleaner (MIT, Marya Dukmak,
// github.com/mariadukmak/transcription-cleaner). Discourse markers such as
// "like", "you know" and "I mean" are left out on purpose: they can carry meaning.
export const FILLERS = ['um', 'uh', 'ah', 'er', 'hmm', 'hm', 'erm', 'umm', 'uhh', 'huh']

// Words that English can correctly say twice in a row ("I know that that is
// true", "she had had enough"). Every other doubled word is a stutter.
export const KEEP_DOUBLE = ['that', 'had', 'very', 'no', 'so', 'bye', 'ha']

// Letters only, Unicode-aware, so a filler never matches inside a word
// ("summer", "ahead") and text in other scripts is left alone.
const B = "(?<![\\p{L}\\p{N}'])"
const E = "(?![\\p{L}\\p{N}'])"

// Every letter of a filler may repeat, so "ummm" and "uhhh" match too:
// "umm" -> "um" -> "u+m+". The same pattern from two list words is kept once.
const collapse = (w) => w.replace(/(.)\1+/g, '$1')
const stretch = (w) => [...w].map((c) => `${c}+`).join('')
const FILLER_RE = new RegExp(`${B}(?:${[...new Set(FILLERS.map(collapse))].map(stretch).join('|')})${E}[,.!?]?`, 'giu')

// Caption tags such as "[Music]" or "[Applause]", and music notes.
const TAG_RE = /\[[^\][]{0,40}\]|♪+/g

// A word said two or more times in a row: "the the", "I, I, I".
const REPEAT_RE = new RegExp(`${B}(\\p{L}+)(?:[\\s,]+\\1${E})+`, 'giu')
const KEEP = new Set(KEEP_DOUBLE)

const words = (s) => s.split(/[\s,]+/).filter(Boolean).length

// Returns the cleaned text and the number of words (and tags) removed.
export function cleanText(text) {
  let removed = 0
  const out = text
    .replace(TAG_RE, () => (removed++, ' '))
    .replace(FILLER_RE, () => (removed++, ' '))
    .replace(REPEAT_RE, (all, word) => {
      if (KEEP.has(word.toLowerCase())) return all
      removed += words(all) - 1
      return word
    })
    .replace(/\s+([,.!?;:])/g, '$1') // "good , and" -> "good, and"
    .replace(/[,;:]+(?=[.!?])/g, '') // "good,." -> "good."
    .replace(/^[\s,;:.]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { text: out, removed }
}
