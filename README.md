# Tab Zero

A Chrome/Brave extension that reads your open YouTube tabs as text. One click collects
the transcript of every selected tab into one Markdown file, so you can skim a video
before you decide to watch it.

This is phase 0 of a transcript-first triage tool. Planned next: cleanup, SponsorBlock
cuts, and an AI verdict on which videos are worth the time. See [`docs/PRD.md`](docs/PRD.md).

## Install

1. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.

## Use

1. Click the extension icon. The page counts your YouTube videos and lists them
   (awake / asleep). Uncheck any video you want to leave out.
2. Click **Collect N videos**. The count goes down to zero as each tab is read.
   **Stop** finishes the current video, then saves what was read so far.
3. Each sweep saves two files:
   - `Downloads/Tab Zero/2026-11/2026-11-14 15-30.md`: an index table, then every transcript
   - `Downloads/Tab Zero/2026-11/2026-11-14 15-30.log`: every action, for diagnosing failures

   **Also save as separate files** writes one `.md` per video plus `00-index.md` into
   a `2026-11-14 15-30/` folder next to them. Each file starts with a
   "Couldn't collect" list that gives the reason for every failed video.
4. A video read in the last 30 days is not read again: its row starts unchecked, and
   checking it takes the transcript from history (`chrome.storage.local`, no tab wake).
   **Read in the last 30 days** lists them, saves them all as one file, or clears them.

## Privacy

The extension sends nothing to any server. The only network requests are the ones the
YouTube page makes itself. Transcripts, logs and history stay on your computer.

## Keeping the files somewhere else (optional, Windows)

Extensions can only save inside Downloads. To keep the files in another folder, make
`Downloads\Tab Zero` a directory junction (no admin needed):

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\Downloads\Tab Zero" -Target "<your data folder>"
```

Remove the junction with `cmd /c rmdir "%USERPROFILE%\Downloads\Tab Zero"`. Never use a
recursive delete: it follows the junction and deletes your transcripts.

## How it gets the transcript

It opens the **Show transcript** panel in the real tab and reads the segments from
the DOM (`transcript-segment-view-model`, with the older `ytd-transcript-segment-renderer`
as a fallback). See `extract.js`.

Fetching without a loaded page does not work. In a test on 2026-11-13, the caption track
URL returned 0 bytes (PO token) and `youtubei/v1/get_transcript` returned
`400 FAILED_PRECONDITION`. So the extension lets YouTube load the page normally.

## Asleep tabs

Memory Saver and session restore leave most tabs unloaded. For each one, one at a
time: reload it, pause the video, read the panel, then discard it again. Awake tabs
are not reloaded or paused.

A hidden tab can render only the player. If reading fails, the extension shows that
tab for a moment, retries, and comes back.

## Known limits

- The retry for hidden tabs switches the active tab. This ends full screen in that
  window (for example, a video in another tab).
- The button text fallback matches an English YouTube interface only ("Show transcript").
- Shorts (`/shorts/`) are skipped.
- No transcript for videos without captions (no speech-to-text).
- First test sweep (2026-11-13): 35 of 36 videos read. The miss was `no-segments` on
  one long video; the cause is still open.

## Development

```
npm test
```

Node 18+, no dependencies. The tests cover the pure logic in `lib.js` and `history.js`.

| File | Job |
|---|---|
| `collect.html` / `.css` / `.js` | The page: list, selection, sweep, stop, log, downloads |
| `extract.js` | Runs inside a YouTube tab; must stay self-contained (Chrome serializes it) |
| `lib.js` | Pure helpers: titles, paths, Markdown |
| `history.js` | 30-day history in `chrome.storage.local`: a small index plus one key per transcript |
| `background.js` | The toolbar icon opens the page |
