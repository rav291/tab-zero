// Sponsor, self-promotion, "subscribe", intro and outro segments from SponsorBlock.
// Uses SponsorBlock data licensed under CC BY-NC-SA 4.0 from https://sponsor.ajay.app/.
//
// Privacy (PRD NFR-01): a request carries only the first 4 hex characters of
// sha256(videoId). SponsorBlock answers with the segments of every video whose
// hash starts the same way, and the match happens here, so it never learns the ID.
import { mergeRanges } from './clean.js'

// Not "preview" or "filler": those can hold real content (PRD FR-18).
export const SB_CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro']
export const SB_ATTRIBUTION = 'Uses SponsorBlock data licensed under CC BY-NC-SA 4.0 from https://sponsor.ajay.app/.'
const API = 'https://sponsor.ajay.app/api/skipSegments/'

export async function hashPrefix(id) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)))
  return [...bytes.slice(0, 2)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ids -> { ranges: Map(id -> [[start, end], ...] in seconds, merged), errors: [string] }.
// A video without SponsorBlock data is not in the map. One request per prefix.
export async function sponsorRanges(ids, fetchFn = fetch) {
  const prefixes = await Promise.all(ids.map(hashPrefix))
  const groups = Map.groupBy(ids, (_, i) => prefixes[i])
  const query = `?categories=${encodeURIComponent(JSON.stringify(SB_CATEGORIES))}`
  const ranges = new Map()
  const errors = []
  await Promise.all(
    [...groups].map(async ([prefix, wanted]) => {
      try {
        const res = await fetchFn(API + prefix + query, { signal: AbortSignal.timeout(10_000) })
        if (res.status === 404) return // no segments for any video with this prefix
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        for (const v of await res.json()) {
          if (!wanted.includes(v.videoID)) continue
          const skips = v.segments
            .filter((s) => s.actionType === 'skip' && SB_CATEGORIES.includes(s.category))
            .map((s) => s.segment)
          if (skips.length) ranges.set(v.videoID, mergeRanges(skips))
        }
      } catch (err) {
        errors.push(`prefix ${prefix}: ${err.message}`)
      }
    }),
  )
  return { ranges, errors }
}
