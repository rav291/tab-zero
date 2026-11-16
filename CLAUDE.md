# CLAUDE.md

Guidance for AI coding agents that work in this repo.

Tab Zero is a Chrome/Brave MV3 extension that reads open YouTube tabs as text.
See `README.md` for use and `docs/PRD.md` for scope.

## Rules

- **Every change to scope goes into `docs/PRD.md` in the same change**, written in
  ASD-STE100 Simplified Technical English: a row in section 8 (requirement log), plus a
  requirement in section 5/6 or a decision in section 7.
- Run `npm test` before claiming anything works. It covers `lib.js` and `history.js`.
  The extension itself can't be loaded from a terminal; say so instead of claiming a
  browser test.
- `extract.js` runs inside the YouTube tab via `chrome.scripting.executeScript`: no
  imports, no outer variables.
- Load one tab at a time. No `backdrop-filter` and no animated blur.
- Never bypass YouTube bot checks or fake browser headers. Read only what the real page
  renders.
- Transcripts and logs are user data (viewing history, tab URLs). Never commit them.
  Tests use made-up video titles and IDs, never real ones.
- Remove a directory junction with `cmd /c rmdir`, never a recursive delete: a
  recursive delete follows the junction and deletes the target's files.
