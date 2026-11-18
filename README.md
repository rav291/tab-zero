# Tab Zero

A Chrome/Brave extension that reads your open YouTube tabs as text. One click collects
the transcript of every selected tab into one Markdown file, cleans it, and tells you
how long it takes to read compared with how long it takes to watch.

Phase 1 of a transcript-first triage tool. Planned next: a verdict on which videos are
worth the time. See [`docs/PRD.md`](docs/PRD.md).

## Install

1. Open `chrome://extensions` (or `brave://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.

## Use

1. Click the extension icon. The page lists your open YouTube videos. Uncheck any video
   you want to leave out. Videos read in the last 30 days start unchecked.
2. Click **Collect N videos**. Tabs are read one at a time, in the background: no tab
   comes to the front, so a film in full screen keeps playing. Asleep tabs are woken,
   read and put back to sleep. **Stop** finishes the current video and saves the rest.
3. Each sweep saves two files:
   - `Downloads/Tab Zero/2026-11/2026-11-18 15-30.md`: an index, then every transcript
   - `Downloads/Tab Zero/2026-11/2026-11-18 15-30.log`: every action, for diagnosing failures
4. When the sweep ends, the page shows what was saved and the time it takes to read
   against the time it takes to watch. Then you can:
   - **Show file**: open the folder with the file selected.
   - **Close N read tabs**: close the tabs whose transcript is saved (two clicks).
   - **Try again with the tab shown**: only when a background tab did not render its
     transcript. Each of those tabs comes to the front for a few seconds.
   - **Save as separate files**: one `.md` per video plus `00-index.md`.

## Cleanup

Every saved file is cleaned. The history keeps the full transcript, so better rules
also apply to videos read earlier. Both steps can be turned off under **Cleanup**.

- **Filler sounds, stutters and caption tags.** "um", "uh", "hmm" and their long forms,
  doubled words ("the the", but not "that that"), and tags such as `[Music]`. Words
  like "like" and "you know" stay: they can carry meaning. One regular expression per
  step, no AI model. On a 164,000-word test sweep this removed 1.5% of the words in
  under 100 ms.
- **Sponsor segments** with [SponsorBlock](https://sponsor.ajay.app/): sponsor reads,
  self-promotion, "like and subscribe" reminders, intros and outros. Previews and
  tangents are kept.

Each file shows the video length, the reading time (238 words per minute, Brysbaert
2019) and the time SponsorBlock cut, for each video and for the sweep.

## Privacy

Transcripts, logs and history stay on your computer. The page loads no remote fonts
or scripts. The extension makes one kind of request of its own: to SponsorBlock, with
only the first 4 characters of the SHA-256 hash of each video ID. SponsorBlock answers
with the segments of every video whose hash starts the same way, and the match happens
on your computer, so SponsorBlock never learns which videos you watch. Turn it off
under **Cleanup** to make no request at all.

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

## Known limits

- A background tab sometimes renders only the player. Those videos need **Try again
  with the tab shown**, which brings each tab to the front for a few seconds.
- The button text fallback matches an English YouTube interface only ("Show transcript").
- The filler list is English. Other languages keep their filler words; caption tags are
  still removed.
- SponsorBlock only knows videos that its users have marked. Each file says for how
  many videos it had data.
- Shorts (`/shorts/`) are skipped. No transcript for videos without captions (no
  speech-to-text).
- First test sweep (2026-11-13): 35 of 36 videos read. The miss was `no-segments` on
  one long video; the cause is still open.

## Development

```
npm test
```

Node 22+, no dependencies. The tests cover the pure logic and use made-up videos only.

| File | Job |
|---|---|
| `collect.html` / `.css` / `.js` | The page: list, selection, sweep, stop, retry, downloads, settings |
| `extract.js` | Runs inside a YouTube tab; must stay self-contained (Chrome serializes it) |
| `clean.js` | Filler, stutter and tag removal; SponsorBlock cuts; one video ready to save |
| `sponsorblock.js` | SponsorBlock lookup by hash prefix |
| `lib.js` | Pure helpers: titles, paths, reading time, Markdown |
| `history.js` | 30-day history in `chrome.storage.local`: a small index plus one key per transcript |
| `background.js` | The toolbar icon opens the page |

## Credits

- Filler word list: [transcription-cleaner](https://github.com/mariadukmak/transcription-cleaner) (MIT).
- Uses SponsorBlock data licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
  from https://sponsor.ajay.app/. Because of this license, Tab Zero stays free.
- Font: [Figtree](https://github.com/erikdkennedy/figtree) (SIL Open Font License, `fonts/OFL.txt`).

## License

[MIT](LICENSE). The license covers the source code only. SponsorBlock data keeps its own
license (see Credits).
