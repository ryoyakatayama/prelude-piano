# Project instructions

This project is Prélude, a static, offline piano practice PWA intended for GitHub Pages under ryoyakatayama/prelude-piano.

- Preserve the serverless architecture. No accounts, secrets, remote microphone processing, or runtime package/CDN downloads.
- User decisions: URL access is acceptable; request search exclusion. Keep noindex metadata. The user explicitly approved a Public GitHub repository on 2026-09-12. Do not represent noindex as access control.
- All authored web assets live in docs/. Source supports relative paths for GitHub project Pages. Do not hardcode origin-root /assets paths.
- Tracks must be downloaded/deleted individually. IndexedDB holds downloaded tracks; Service Worker must not automatically cache tracks/.
- Read FORMAT.md before transcribing a photo. Preserve the original image, label ambiguities, distinguish printed fingering from suggestions. Do not pretend photo-only import performs optical music recognition.
- Mic tracking is experimental and monophonic. Do not advertise reliable polyphonic tracking, grading, or physical iPad validation without evidence.
- After edits, run node scripts/prepare.mjs and node scripts/check.mjs. For changed timing/audio/validation logic run node --test tests/*.test.mjs. Use --audio when adding or changing a track to regenerate WAVs.
- Keep work-in-progress data and auth credentials out of Git. Never create or save access tokens in the web app.
