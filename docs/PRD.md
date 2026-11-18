# Tab Zero: product requirements

This document uses ASD-STE100 Simplified Technical English. Update it with each change
to the scope. Put each change in section 8.

Current version: 0.4.0 (2026-11-18).

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
| 1. Clean | Remove filler sounds, repeated words and caption tags with a word list and regular expressions. Cut sponsor, self-promotion, interaction, intro and outro segments with SponsorBlock. Show the time that the cleanup removed and the reading time. Use no AI model. | Done (0.4.0) |
| 2. Judge | A Node CLI in the same repo reads the sweep files and gives a verdict for each video. Rules decide first (for example, a list of channels). An AI model decides only the videos that the rules cannot decide. The verdict compares the video with a profile that the user writes (interests and goals). | Planned |
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
| FR-05 | The extension does not show a tab during a sweep. If a hidden tab did not render the transcript, the extension tells the user after the sweep. The user can then click one button to try these videos again, with each tab shown for a short time. Videos that have no captions are not tried again. | Done (0.4.0) |
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
| FR-18 | The cleanup cuts the SponsorBlock segments of the categories `sponsor`, `selfpromo`, `interaction`, `intro` and `outro`. It does not cut `preview` or `filler`, because these can contain real content. | Done (0.4.0) |
| FR-19 | The cleanup removes filled pauses ("um", "uh", "hmm" and their long forms, such as "ummm") and caption tags (for example "[Music]"). It does not remove discourse markers such as "like", "you know" or "I mean", because they can carry meaning. | Done (0.4.0) |
| FR-20 | The cleanup removes a word that the speaker says two times in a row ("the the"). It keeps the words that English can correctly repeat, for example "that that" and "had had". | Done (0.4.0) |
| FR-21 | Each file shows the video time, the reading time and the time that SponsorBlock cut, for each video and for the sweep. The reading time uses 238 words per minute (Brysbaert, 2019). | Done (0.4.0) |
| FR-22 | The history keeps the raw transcript. The cleanup runs when the extension saves a file, so better rules also apply to old videos. | Done (0.4.0) |
| FR-23 | The user can turn off each cleanup step (filler removal, SponsorBlock). The page keeps the setting. | Done (0.4.0) |
| FR-24 | After a sweep, the user can close the tabs of the videos that were read. This needs two clicks. | Done (0.4.0) |
| FR-25 | After a sweep, the user can show the saved file in its folder. | Done (0.4.0) |

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | **Privacy.** The extension sends no data to a server, with one exception: SponsorBlock. To SponsorBlock, it sends only the first 4 characters of the SHA-256 hash of each video ID, never the ID. The user can turn SponsorBlock off. The page loads no remote fonts or scripts. Transcripts, logs and history stay on the computer of the user. The repo contains no user data. The tests use made-up titles and video IDs. |
| NFR-02 | **Memory.** The extension loads one YouTube tab at a time. Many YouTube pages at the same time use too much memory. |
| NFR-03 | **No bypass.** Do not bypass YouTube bot checks. Do not send false browser headers. Read only what the real page shows. |
| NFR-04 | **Rendering.** Do not use `backdrop-filter` or an animated blur. They can stop the page on a weak GPU. |
| NFR-05 | **In-tab code.** `extract.js` must have no imports and no outer variables, because Chrome serializes the function. |
| NFR-06 | **Tests.** `npm test` tests the pure logic. Each new logic branch must have one test. |
| NFR-07 | **Access.** Keyboard focus must be visible. The page must obey the reduced-motion setting of the system. |
| NFR-08 | **Logs.** Each failure must be clear from the log alone. A log line gives the tab, the step and the result. |
| NFR-09 | **Cost.** Use lists and rules before an AI model. Phase 1 uses no AI model. A cleanup step must be one pass over the text. |
| NFR-10 | **License.** The source code has the MIT license (`LICENSE`). SponsorBlock data has the license CC BY-NC-SA 4.0. Tab Zero must stay free while it uses this data. The settings and each file that contains cut segments show the SponsorBlock attribution. |
| NFR-11 | **Interruptions.** The extension must not change the active tab or the focused window unless the user clicks a button for that action. |

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
| 2026-11-15 | Keep all user data out of the repo, in a folder outside it, not only in `.gitignore`. | Transcripts and logs show the viewing history of the user. Git cannot add a file outside the repo, by a forced add, a changed `.gitignore` or a copy. |
| 2026-11-18 | Do not show tabs during a sweep. The retry for hidden tabs is a button after the sweep. | A tab switch stopped full screen in another tab, and the sweep took the screen from the user. |
| 2026-11-18 | Use the filler list of `transcription-cleaner` (MIT), not the package. | The extension has no build step, and the package needs `lodash`. The list is small. One regular expression cleans the text in one pass, with no AI cost. |
| 2026-11-18 | Do not remove "like", "you know", "I mean" or "basically". | They can carry meaning. In the first test, there were 2,154 of these words, and 2,388 safe removals (tags, "um", "uh", repeated words). |
| 2026-11-18 | Remove "duplicate lines" from phase 1. | The transcript panel gives no duplicate lines. The first test had 0. |
| 2026-11-18 | Ask SponsorBlock with a hash prefix of 4 characters. | SponsorBlock recommends this length. It returns the segments of many videos, and the extension selects the correct ones, so SponsorBlock does not learn which videos the user watches. |
| 2026-11-18 | Bundle the page font in the extension. | A Google Fonts request is a request to a server, which NFR-01 does not permit. |
| 2026-11-18 | Make the page a calm tool page: a sentence that tells the state, the list, and the actions. Remove the large count. | The large count looked like a headline, not a tool. The user needs the facts (time to watch, time to read) more than a number. |
| 2026-11-18 | Phase 2 starts as a Node CLI in this repo. Use Chrome Native Messaging only if one click becomes necessary. | A CLI needs no install steps and reads the sweep files that already exist. Native Messaging needs a host manifest and a registry key. |
| 2026-11-18 | Keep Tab Zero a separate product. Other tools, for example a writing tool, connect through the Markdown files. Consider a merge only when both products have users and proof of value. | Tab Zero needs only a browser. A larger app with a database, an API and auth would give Tab Zero its blockers. |
| 2026-11-18 | Packaging: now, a zip of the extension in GitHub Releases. Later, the Chrome Web Store. The CLI becomes an npm package with a `bin` entry. When the CLI arrives, the repo gets the folders `extension/`, `cli/` and `shared/`, with one version and one release. | Chrome on Windows does not install an extension file from outside the store. A shared folder stops copies of the same code. |
| 2026-11-18 | Give the source code the MIT license. | Without a license, other persons cannot legally use, change or share the code. MIT is short and agrees with the MIT filler list. The license applies to the code only, not to the SponsorBlock data that the extension gets at run time. |

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
| 2026-11-16 | Maintainer | The retry for hidden tabs must not interrupt the user. | FR-05, NFR-11 |
| 2026-11-17 | Maintainer | Use a filler list that exists, not words that we invent. Use AI as little as possible. | FR-19, FR-20, NFR-09 |
| 2026-11-17 | Maintainer | How can the extension and the CLI be packaged? | Section 7 |
| 2026-11-17 | Maintainer | Should Tab Zero be a service of a larger app? | No. Section 7 |
| 2026-11-18 | Maintainer | Start phase 1 with the regex method. | Phase 1, FR-18 to FR-23 |
| 2026-11-18 | Maintainer | Make the page better: more useful functions and a simple, human design, not a flashy one. | Section 7, FR-21, FR-24, FR-25 |
| 2026-11-18 | Maintainer | Read long livestreams (1 to 3 hours). | In scope: this is the core job. First fix open question 1 (a long video failed). Proposed: split a long transcript by the YouTube chapters of the video. |
| 2026-11-18 | Maintainer | Tab Zero for blogs (Substack, dev.to). | Not now. Blogs are text already, so only the phase 2 verdict helps. Proposed: the phase 2 CLI reads any Markdown file with front matter, and a page clipper saves the blog posts. |
| 2026-11-18 | Maintainer | An "echo chamber" alert for many one-sided videos from the same field. | Not now. Proposed for phase 4: count the channels and topics in the history with rules. Do not let an AI judge opinions. |
| 2026-11-18 | Maintainer | A fast decision model for genre, category and value for the goals of the user. | Phase 2: rules and a small local model first, an AI model only for the rest. Open question 6. |
| 2026-11-18 | Maintainer | Publish on the Chrome Web Store? | Open question 7. |
| 2026-11-18 | Maintainer | Add a license to the public repo. | NFR-10, section 7 |

## 9. Open questions

1. One video of 100 minutes failed with `no-segments`, but it has captions. Is the 15-second wait too short? Run it again and read the log.
2. The channel name was empty for one video. The log of the next sweep will show the cause.
3. The button text fallback works only with an English YouTube interface. Is that sufficient?
4. Which model gives the AI verdict in phase 2? Does it run on the computer or through an API?
5. Does SponsorBlock have data for the videos that the user watches? Each sweep file shows how many videos had SponsorBlock data. Read this number after some sweeps.
6. Phase 2: which fast model sorts the videos (genre, value for the user) before any AI model? Options: keyword rules from the user profile, or a small embedding model that runs in the browser or in the CLI.
7. Before a Chrome Web Store release: test 0.4.0 in a real browser for one week, fix open question 1, write a privacy policy, and publish as "unlisted" first.
