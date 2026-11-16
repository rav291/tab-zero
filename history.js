// Videos read in the last HISTORY_DAYS days, in chrome.storage.local, so a video
// is read once and not on every sweep.
//
// Two kinds of keys, written together in one set() call:
//   history   -> { schema, videos: { [id]: { id, title, channel, duration, words, savedAt } } }
//   t:<id>    -> the segments of one video
// The page loads only the small index; a transcript is loaded when a sweep needs it.

import { wordCount } from './lib.js'

export const HISTORY_DAYS = 30
export const SCHEMA = 1
const DAY = 86_400_000
const tkey = (id) => `t:${id}`

// Pure: split the index into entries to keep and ids to drop.
export function prune(videos, now = Date.now(), days = HISTORY_DAYS) {
  const keep = {}
  const drop = []
  for (const [id, m] of Object.entries(videos)) {
    if (now - m.savedAt < days * DAY) keep[id] = m
    else drop.push(id)
  }
  return { keep, drop }
}

// store: chrome.storage.local (or any object with the same get/set/remove).
export async function openHistory(store, now = Date.now()) {
  const { history } = await store.get('history')
  // An unknown schema starts a new index. Add a migration when SCHEMA changes.
  const current = history?.schema === SCHEMA ? history.videos : {}
  let { keep: videos, drop } = prune(current, now)
  const write = () => store.set({ history: { schema: SCHEMA, videos } })

  if (drop.length || history?.schema !== SCHEMA) await write()
  if (drop.length) await store.remove(drop.map(tkey))

  return {
    pruned: drop.length,
    has: (id) => id in videos,
    meta: (id) => videos[id],
    all: () => Object.values(videos).sort((a, b) => b.savedAt - a.savedAt),
    async load(id) {
      return (await store.get(tkey(id)))[tkey(id)]
    },
    async save(v) {
      videos = {
        ...videos,
        [v.id]: { id: v.id, title: v.title, channel: v.channel, duration: v.duration, words: wordCount(v.segments), savedAt: Date.now() },
      }
      await store.set({ history: { schema: SCHEMA, videos }, [tkey(v.id)]: v.segments })
    },
    async clear() {
      const ids = Object.keys(videos)
      videos = {}
      await write()
      await store.remove(ids.map(tkey))
    },
  }
}
