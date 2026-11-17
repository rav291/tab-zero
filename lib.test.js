import test from 'node:test'
import assert from 'node:assert/strict'
import { toSeconds, clock, paragraphs, fileName, toMarkdown, indexMarkdown, videoId, combinedMarkdown, sweepPath, cleanTitle, ago, needsView } from './lib.js'

test('time conversions', () => {
  assert.equal(toSeconds('11:09'), 669)
  assert.equal(toSeconds('1:02:03'), 3723)
  assert.equal(toSeconds(''), 0)
  assert.equal(clock(669), '11:09')
  assert.equal(clock(3723), '1:02:03')
})

test('sweepPath: month folder, then date and time', () => {
  assert.equal(sweepPath(new Date(2026, 10, 3, 9, 5)), '2026-11/2026-11-03 09-05')
})

test('cleanTitle drops the notification count and the suffix', () => {
  assert.equal(cleanTitle('(12) How caches work | Part 1 - YouTube'), 'How caches work | Part 1')
  assert.equal(cleanTitle('Plain'), 'Plain')
})

test('videoId', () => {
  assert.equal(videoId('https://www.youtube.com/watch?v=aaaaaaaaaaa&t=30s'), 'aaaaaaaaaaa')
})

test('paragraphs group by minute and keep the first timestamp', () => {
  const p = paragraphs([
    { t: '0:05', text: 'a' },
    { t: '0:59', text: 'b' },
    { t: '1:00', text: 'c' },
    { t: '2:30', text: 'd' },
  ])
  assert.deepEqual(p.map((x) => [x.t, x.text]), [['0:05', 'a b'], ['1:00', 'c'], ['2:30', 'd']])
})

test('fileName strips characters Windows rejects', () => {
  assert.equal(fileName({ id: 'X', title: 'What? A/B: "test" | 2026...' }), 'What AB test 2026 [X].md')
  assert.equal(fileName({ id: 'X', title: '???' }), 'untitled [X].md')
})

test('toMarkdown front matter survives quotes and falls back to last timestamp', () => {
  const md = toMarkdown({
    id: 'X', title: 'He said "hi"', channel: 'C', duration: 0, collected: '2026-11-13',
    segments: [{ t: '0:00', text: 'hello there' }, { t: '12:34', text: 'bye' }],
  })
  assert.match(md, /^title: "He said \\"hi\\""$/m)
  assert.match(md, /^duration: 12:34$/m)
  assert.match(md, /^words: 3$/m)
  assert.match(md, /^\*\*\[12:34\]\*\* bye$/m)
})

test('combined file has the index, then one section per collected video', () => {
  const md = combinedMarkdown([
    { id: 'A', title: 'First', channel: 'C', duration: 125, status: 'ok', segments: [{ t: '0:00', text: 'x y' }] },
    { id: 'B', title: 'none', channel: '', status: 'no-transcript', segments: [] },
  ], '2026-11-13')
  assert.match(md, /^# YouTube tabs, 2026-11-13$/m)
  assert.match(md, /\| 1 \| First \(\[yt\]/) // no file link in the combined index
  assert.match(md, /^## First$/m)
  assert.match(md, /^C · 2:05 · 2 words · https:\/\/www\.youtube\.com\/watch\?v=A$/m)
  assert.doesNotMatch(md, /^## none$/m)
  assert.doesNotMatch(md, /^---$/m)
})

test("failures get their own Couldn't collect list with a reason", () => {
  const md = indexMarkdown([
    { id: 'A', title: 'ok one', channel: 'C', status: 'ok', segments: [{ t: '0:00', text: 'x' }] },
    { id: 'B', title: 'long one', channel: '', status: 'no-segments', segments: [] },
  ], '2026-11-14')
  assert.match(md, /^## Couldn't collect$/m)
  assert.match(md, /^- \[long one\]\(https:\/\/www\.youtube\.com\/watch\?v=B\): The transcript panel opened/m)
  assert.doesNotMatch(md, /\[ok one\]\(https/)
  const clean = indexMarkdown([{ id: 'A', title: 'ok', channel: 'C', status: 'ok', segments: [] }], '2026-11-14')
  assert.doesNotMatch(clean, /Couldn't collect/)
})

test('ago', () => {
  const now = Date.UTC(2026, 10, 14, 12)
  assert.equal(ago(now - 3_600_000, now), 'today')
  assert.equal(ago(now - 86_400_000, now), 'yesterday')
  assert.equal(ago(now - 5 * 86_400_000, now), '5 days ago')
})

test('index escapes pipes and links only collected videos', () => {
  const md = indexMarkdown([
    { id: 'A', title: 'a | b', channel: 'C', status: 'ok', segments: [{ t: '0:00', text: 'x y' }] },
    { id: 'B', title: 'none', channel: '', status: 'no-transcript', segments: [] },
  ], '2026-11-13')
  assert.match(md, /1 of 2 transcripts collected, 2 words/)
  assert.match(md, /\[a \\\| b\]\(<a b \[A\]\.md>\)/)
  assert.match(md, /\| 2 \| none \(\[yt\]/)
})

test('needsView: retry in view only when the tab may not have rendered', () => {
  assert.equal(needsView({ status: 'no-segments' }), true)
  assert.equal(needsView({ status: 'no-transcript', rendered: false }), true)
  assert.equal(needsView({ status: 'no-transcript', rendered: true }), false) // no captions
  assert.equal(needsView({ status: 'ok' }), false)
  assert.equal(needsView({ status: 'error: tab closed' }), false)
})
