// Runs INSIDE a YouTube watch tab via chrome.scripting.executeScript. Chrome
// serializes the function, so it must be self-contained: no imports, no outer
// variables. Returns { status, title, channel, duration, segments: [{ t, text }], log: [string] }.
export async function extractTranscript(timeoutMs, pause) {
  // New markup (2026) first, the older renderer as a fallback.
  const SEG = 'transcript-segment-view-model, ytd-transcript-segment-renderer'
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const start = performance.now()
  const log = []
  const step = (m) => log.push(`${String(Math.round(performance.now() - start)).padStart(6)}ms ${m}`)
  step(`in tab: visibility=${document.visibilityState} readyState=${document.readyState}`)

  // MutationObserver, not polling: timers in background tabs are throttled.
  const waitFor = (fn, ms) =>
    new Promise((resolve) => {
      const first = fn()
      if (first) return resolve(first)
      const timer = setTimeout(() => (obs.disconnect(), resolve(null)), ms)
      const obs = new MutationObserver(() => {
        const hit = fn()
        if (hit) obs.disconnect(), clearTimeout(timer), resolve(hit)
      })
      obs.observe(document.documentElement, { childList: true, subtree: true })
    })

  const read = () =>
    [...document.querySelectorAll(SEG)]
      .map((s) => ({
        t: (s.querySelector('.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp')?.textContent || '').trim(),
        text: (s.querySelector('span[role="text"], .segment-text')?.textContent || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((s) => s.text)

  // Limit: the text match works only with an English YouTube interface.
  const findButton = () =>
    document.querySelector('ytd-video-description-transcript-section-renderer button') ||
    [...document.querySelectorAll('button')].find((b) =>
      /show transcript/i.test(b.getAttribute('aria-label') || b.textContent || ''),
    )

  const meta = () => ({
    title:
      document.querySelector('h1.ytd-watch-metadata')?.textContent.trim() ||
      document.title.replace(/ - YouTube$/, ''),
    channel: document.querySelector('ytd-watch-metadata ytd-channel-name a')?.textContent.trim() || '',
    duration: Math.round(document.querySelector('video')?.duration || 0),
  })

  if (pause) {
    const v = document.querySelector('video')
    v?.pause()
    step(v ? 'video paused' : 'no <video> element to pause')
  }

  let segments = read()
  if (segments.length) step(`panel already open: ${segments.length} segments`)
  else {
    const btn = await waitFor(findButton, timeoutMs)
    if (!btn) {
      // Tells "hidden tab rendered only the player" apart from "video has no transcript".
      // rendered=false: the page below the player never rendered, so a retry
      // with the tab in view can help. rendered=true: the video has no captions.
      const rendered = !!document.querySelector('ytd-watch-metadata')
      step(`no transcript button after ${timeoutMs}ms; watch-metadata=${rendered} description-section=${!!document.querySelector('ytd-video-description-transcript-section-renderer')} visibility=${document.visibilityState}`)
      return { status: 'no-transcript', rendered, ...meta(), segments: [], log }
    }
    step(`button found via ${btn.closest('ytd-video-description-transcript-section-renderer') ? 'description section' : 'text match'}: "${(btn.getAttribute('aria-label') || btn.textContent).trim().slice(0, 40)}"`)
    btn.click()
    const first = await waitFor(() => document.querySelector(SEG), timeoutMs)
    step(first ? `first segment: <${first.tagName.toLowerCase()}>` : `no segment after ${timeoutMs}ms; panel element=${!!document.querySelector('[target-id*="transcript"]')}`)
    // Segments can arrive in batches: wait until the count stops changing.
    let n = -1
    while (n !== document.querySelectorAll(SEG).length) {
      n = document.querySelectorAll(SEG).length
      await sleep(800)
    }
    segments = read()
    step(`settled: ${n} segment elements, ${segments.length} with text, last timestamp ${segments.at(-1)?.t || '-'}`)
  }
  const m = meta()
  step(`meta: channel=${m.channel ? 'yes' : 'MISSING'} duration=${m.duration}s`)
  return { status: segments.length ? 'ok' : 'no-segments', ...m, segments, log }
}
