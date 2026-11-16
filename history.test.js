import test from 'node:test'
import assert from 'node:assert/strict'
import { prune, openHistory, HISTORY_DAYS } from './history.js'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 14)

// An in-memory stand-in for chrome.storage.local.
const fakeStore = (data = {}) => ({
  data,
  async get(k) {
    return typeof k === 'string' ? (k in data ? { [k]: data[k] } : {}) : { ...data }
  },
  async set(obj) {
    Object.assign(data, structuredClone(obj))
  },
  async remove(keys) {
    for (const k of [].concat(keys)) delete data[k]
  },
})

test('prune keeps entries younger than 30 days', () => {
  const { keep, drop } = prune({
    a: { savedAt: NOW - 1 * DAY },
    b: { savedAt: NOW - HISTORY_DAYS * DAY }, // exactly 30 days: dropped
    c: { savedAt: NOW - 45 * DAY },
  }, NOW)
  assert.deepEqual(Object.keys(keep), ['a'])
  assert.deepEqual(drop.sort(), ['b', 'c'])
})

test('save, reload, load, and old entries are removed with their transcripts', async () => {
  const store = fakeStore({
    history: { schema: 1, videos: { old: { id: 'old', savedAt: NOW - 40 * DAY } } },
    't:old': [{ t: '0:00', text: 'gone' }],
  })
  const h = await openHistory(store, NOW)
  assert.equal(h.pruned, 1)
  assert.equal('t:old' in store.data, false)

  await h.save({ id: 'A', title: 'T', channel: 'C', duration: 60, segments: [{ t: '0:00', text: 'two words' }] })
  const again = await openHistory(store) // a new page sees what the last one saved
  assert.equal(again.has('A'), true)
  assert.equal(again.meta('A').words, 2)
  assert.deepEqual(await again.load('A'), [{ t: '0:00', text: 'two words' }])

  await again.clear()
  assert.equal(again.has('A'), false)
  assert.equal('t:A' in store.data, false)
})

test('a missing or unknown index starts empty', async () => {
  const h = await openHistory(fakeStore({ history: { schema: 99, videos: { x: {} } } }), NOW)
  assert.deepEqual(h.all(), [])
})
