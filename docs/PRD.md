# Tab Zero: product requirements

This document uses ASD-STE100 Simplified Technical English. Update it with each change
to the scope. Put each change in section 8.

Current version: 0.3.0 (2026-11-14).

## 1. Purpose

Tab Zero gives the user the text of YouTube videos before the user watches them. The
user can skim text in less time than the video takes. In a later phase, an AI step
tells the user which videos are worth the time.

## 2. Users

People who keep many YouTube tabs open to watch later, and who read faster than they
watch. The first version is for desktop Chrome and Brave.

## 3. Problem

Open YouTube tabs collect faster than the user can watch them. In the first test,
36 videos were open. The user cannot know which videos have value before the user
watches them.

## 4. Phases

| Phase | Scope | Status |
|---|---|---|
| 0. Collect | Read the transcripts of the open YouTube tabs into Markdown files. | Done (0.3.0) |
| 1. Clean | Remove filler words and duplicate lines. Cut sponsor, intro and outro segments with SponsorBlock. Show the minutes that the cleanup removed. | Planned |
| 2. Judge | A local helper (Chrome Native Messaging) gives an AI verdict for each video. The verdict compares the video with a profile that the user writes (interests and goals). | Planned |
| 3. Prove | The user labels 30 videos. A script compares the AI verdicts with the labels and gives an agreement score. | Planned |
| 4. Novelty | The tool tells the user when the history already contains the same ideas. | Planned |

**Gate before phase 2.** Give 5 video links to NotebookLM or Gemini in Chrome. Ask which
videos are worth the time. If the answer is good enough, stop after phase 1.

## 5. Functional requirements

| ID | Requirement | Status |
|---|---|---|
| FR-01 | The extension finds all open YouTube watch tabs. It shows one row for each video. | Done |
| FR-02 | When two tabs show the same video, the list shows one row. | Done |
| FR-03 | The extension reads the transcript from the "Show transcript" panel in the real tab (the DOM). | Done |
| FR-04 | For an asleep tab, the extension reloads the tab, pauses the video, reads the panel and discards the tab again. It does one tab at a time. | Done |
| FR-05 | If a hidden tab gives no transcript, the extension shows the tab for a short time and tries again. Then it goes back to its own page. | Done (see open question 5) |
| FR-06 | Each sweep saves one Markdown file with all transcripts. This gives one download, not one download for each video. | Done |
| FR-07 | After a sweep, the user can also save one file for each video, plus an index file. | Done |
| FR-08 | Files go to `Downloads\Tab Zero\<YYYY-MM>\<YYYY-MM-DD HH-mm>.md`. The README tells how to send them to a different folder with a directory junction. | Done |
| FR-09 | The extension logs each action. The page shows the log, and each sweep saves it as a `.log` file next to the transcripts. | Done |
| FR-10 | The user can uncheck a video to leave it out of the sweep. | Done |
| FR-11 | The user can stop a sweep. The extension completes the current video, then saves the transcripts that it read. | Done |
| FR-12 | The extension keeps each transcript that it read for 30 days, in browser storage. It does not read that video again. The row of that video starts unchecked. If the user checks it, the transcript comes from the history. | Done |
| FR-13 | The page shows the history of the last 30 days. The user can save the full history as one file. The user can clear the history with two clicks. | Done |
| FR-14 | Each file starts with a "Couldn't collect" list. The list gives the reason for each failed video. | Done |
| FR-15 | Each AI recommendation shows a quote from the transcript, with its timestamp. | Planned (phase 2) |
| FR-16 | The AI verdict has four values: skip, read the summary, watch all, watch only these minutes. | Planned (phase 2) |
| FR-17 | The AI step identifies videos that need the screen (code, diagrams, demos). For these videos, the verdict is "watch". | Planned (phase 2) |
| FR-18 | The cleanup cuts sponsor, intro and outro segments with the time ranges from SponsorBlock. | Planned (phase 1) |

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | **Privacy.** The extension sends no data to a server. The only requests are the requests that the YouTube page makes itself. Transcripts, logs and history stay on the computer of the user. The repo contains no user data. The tests use made-up titles and video IDs. |
| NFR-02 | **Memory.** The extension loads one YouTube tab at a time. Many YouTube pages at the same time use too much memory. |
| NFR-03 | **No bypass.** Do not bypass YouTube bot checks. Do not send false browser headers. Read only what the real page shows. |
| NFR-04 | **Rendering.** Do not use `backdrop-filter` or an animated blur. They can stop the page on a weak GPU. |
| NFR-05 | **In-tab code.** `extract.js` must have no imports and no outer variables, because Chrome serializes the function. |
| NFR-06 | **Tests.** `npm test` tests the pure logic. Each new logic branch must have one test. |
| NFR-07 | **Access.** Keyboard focus must be visible. The page must obey the reduced-motion setting of the system. |
| NFR-08 | **Logs.** Each failure must be clear from the log alone. A log line gives the tab, the step and the result. |

## 7. Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-11-13 | Read the transcript from the page (DOM), not from an API. | A test without a page failed. The caption URL gave 0 bytes (PO token), and `get_transcript` gave error 400. |
| 2026-11-13 | The collector page does the work, not the service worker. | Chrome stops a service worker after about 30 seconds without activity. An open page does not stop. |
| 2026-11-13 | Save one combined file for each sweep. | One download popup for each video interrupts the user. |
| 2026-11-13 | Save inside `Downloads\Tab Zero`. Make a junction optional. | An extension can save only inside the Downloads folder. |
| 2026-11-14 | Name: Tab Zero. | The goal is zero open tabs. The name is short and specific. |
| 2026-11-14 | Keep the history in `chrome.storage.local`, not `localStorage`. Keep a small index apart from the transcripts. | 30 days of transcripts can be more than 10 MB, so the extension uses `unlimitedStorage`. The page loads only the index to show the list. |
| 2026-11-14 | Save the `.log` file with the type `application/octet-stream`. | With `text/markdown`, the browser changed `.log` to `.md`. |
| 2026-11-15 | Keep all user data out of the repo. | Transcripts and logs show the viewing history of the user. |

## 8. Requirement log

| Date | Source | Change | Result |
|---|---|---|---|
| 2026-11-13 | Maintainer | Read the transcripts of all YouTube tabs first, and let AI decide what is worth watching. | The product. See sections 1 and 4. |
| 2026-11-13 | Maintainer | Get the transcript from the DOM of the page. | FR-03 |
| 2026-11-13 | Maintainer | Solve the problem of inactive tabs. | FR-04, FR-05 |
| 2026-11-13 | Maintainer | Do not show one download popup for each video. | FR-06, FR-07 |
| 2026-11-13 | Maintainer | Put the files in a folder for each month, with the date in the name. | FR-08 |
| 2026-11-14 | Maintainer | Log all actions, to find the cause of failures. | FR-09, NFR-08 |
| 2026-11-14 | Maintainer | Add a stop button, and let the user unselect videos. | FR-10, FR-11 |
| 2026-11-14 | User feedback | Keep a timestamped quote behind each AI recommendation. | FR-15 |
| 2026-11-14 | User feedback | Keep a separate "couldn't collect" list. | FR-14 |
| 2026-11-14 | Maintainer | Keep the videos already read, and show the last 30 days. | FR-12, FR-13 |
| 2026-11-15 | Maintainer | Keep user data out of the repo. | Section 7, NFR-01 |
| 2026-11-16 | Maintainer | The retry for hidden tabs must not interrupt the user. | Open question 5 |

## 9. Open questions

1. One video of 100 minutes failed with `no-segments`, but it has captions. Is the 15-second wait too short? Run it again and read the log.
2. The channel name was empty for one video. The log of the next sweep will show the cause.
3. The button text fallback works only with an English YouTube interface. Is that sufficient?
4. Which model gives the AI verdict in phase 2? Does it run on the computer or through an API?
5. The FR-05 retry makes the YouTube tab active. This stops full screen in that window, for example a film in another tab. It also runs for videos that have no captions, where it cannot help. Options: find why the hidden read fails, retry only for `no-segments`, or retry only when the user clicks a button at the end of the sweep.
