import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanText } from './clean.js'

const clean = (s) => cleanText(s).text

test('cleanText: removes filled pauses, also long forms', () => {
  assert.deepEqual(cleanText('um so we uh start here'), { text: 'so we start here', removed: 2 })
  assert.equal(clean('Ummm, okay. Uhhh let us go'), 'okay. let us go')
  assert.equal(clean('it was good, um, and then hmm we left'), 'it was good, and then we left')
})

test('cleanText: removes caption tags and music notes', () => {
  assert.equal(clean('[Music] hello there [Applause]'), 'hello there')
  assert.equal(clean('♪♪ the song ends ♪'), 'the song ends')
})

test('cleanText: collapses stutters but keeps correct doubles', () => {
  assert.equal(clean('the the cat sat'), 'the cat sat')
  assert.deepEqual(cleanText('I I I think so'), { text: 'I think so', removed: 2 })
  assert.equal(clean('I know that that is true'), 'I know that that is true')
  assert.equal(clean('she had had enough'), 'she had had enough')
})

test('cleanText: leaves meaning words, real words and other scripts alone', () => {
  assert.equal(clean('I like it, you know, I mean it'), 'I like it, you know, I mean it')
  assert.equal(clean('summer umbrella ahead her hum'), 'summer umbrella ahead her hum')
  assert.equal(clean('नमस्ते दोस्तों आज हम'), 'नमस्ते दोस्तों आज हम')
  assert.equal(clean(''), '')
})

test('prepare: cuts sponsor lines, cleans paragraphs, reports what it did', async () => {
  const { prepare } = await import('./clean.js')
  const v = {
    id: 'X', title: 'T', channel: 'C', duration: 130,
    segments: [
      { t: '0:00', text: 'um welcome' },
      { t: '0:20', text: 'this video is sponsored by' }, // inside the cut
      { t: '0:40', text: 'the the topic' },
      { t: '1:05', text: '[Music] next part' },
    ],
  }
  const out = prepare(v, { ranges: [[15, 35]] })
  assert.deepEqual(out.segments, [
    { t: '0:00', text: 'welcome the topic' }, // "um" and one "the" removed, 0:20 cut
    { t: '1:05', text: 'next part' },
  ])
  assert.deepEqual(out.stats, { cutSeconds: 20, sponsorChecked: true, removedWords: 3 })
  assert.equal(v.segments.length, 4) // the raw transcript is not changed
  assert.deepEqual(prepare(v, { fillers: false }).stats, { cutSeconds: 0, sponsorChecked: false, removedWords: 0 })
})
