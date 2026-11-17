import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeRanges, cutSegments } from './clean.js'
import { sponsorRanges, hashPrefix } from './sponsorblock.js'

test('mergeRanges: joins overlapping and touching ranges', () => {
  assert.deepEqual(mergeRanges([[30, 40], [0, 10], [5, 20], [20, 25]]), [[0, 25], [30, 40]])
  assert.deepEqual(mergeRanges([]), [])
})

test('cutSegments: drops lines that start inside a range, clips to the video', () => {
  const segs = [{ t: '0:00', text: 'a' }, { t: '0:15', text: 'b' }, { t: '0:30', text: 'c' }, { t: '1:00', text: 'd' }]
  assert.deepEqual(cutSegments(segs, [[10, 30]], 70), { segments: [segs[0], segs[2], segs[3]], cutSeconds: 20 })
  assert.equal(cutSegments(segs, [[55, 90]], 70).cutSeconds, 15) // the range passes the end
  assert.equal(cutSegments(segs, [[55, 90]]).cutSeconds, 35) // no duration known
})

// A stand-in for fetch: records each URL, answers from a table of prefixes.
const fakeFetch = (table) => {
  const urls = []
  const fn = async (url) => {
    urls.push(url)
    const prefix = new URL(url).pathname.split('/').pop()
    const body = table[prefix]
    if (body instanceof Error) throw body
    if (body === undefined) return { ok: false, status: 404 }
    return { ok: true, status: 200, json: async () => body }
  }
  return { fn, urls }
}

test('sponsorRanges: sends only a hash prefix and keeps only the asked video', async () => {
  const id = 'aaaaaaaaaaa'
  const p = await hashPrefix(id)
  assert.match(p, /^[0-9a-f]{4}$/)
  const { fn, urls } = fakeFetch({
    [p]: [
      {
        videoID: id,
        segments: [
          { segment: [10, 40], category: 'sponsor', actionType: 'skip' },
          { segment: [30, 50], category: 'selfpromo', actionType: 'skip' },
          { segment: [60, 70], category: 'preview', actionType: 'skip' }, // not cut
          { segment: [80, 80], category: 'poi_highlight', actionType: 'poi' }, // not a skip
        ],
      },
      { videoID: 'someoneelse', segments: [{ segment: [0, 99], category: 'sponsor', actionType: 'skip' }] },
    ],
  })
  const { ranges, errors } = await sponsorRanges([id, 'bbbbbbbbbbb'], fn)
  assert.deepEqual([...ranges], [[id, [[10, 50]]]])
  assert.deepEqual(errors, [])
  assert.ok(urls.every((u) => !u.includes(id) && !u.includes('bbbbbbbbbbb')))
})

test('sponsorRanges: a failed request is reported, not thrown', async () => {
  const id = 'aaaaaaaaaaa'
  const { fn } = fakeFetch({ [await hashPrefix(id)]: new Error('offline') })
  const { ranges, errors } = await sponsorRanges([id], fn)
  assert.equal(ranges.size, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /offline/)
})
