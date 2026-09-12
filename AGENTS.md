# Project instructions

This project is Prélude, a static, offline piano practice PWA intended for GitHub Pages under ryoyakatayama/prelude-piano.

- Preserve the serverless architecture. No accounts, public plaintext secrets, remote microphone processing, or runtime package/CDN downloads.
- User decisions: URL access is acceptable; request search exclusion. Keep noindex metadata. The user explicitly approved a Public GitHub repository on 2026-09-12. Do not represent noindex as access control.
- All authored web assets live in docs/. Source supports relative paths for GitHub project Pages. Do not hardcode origin-root /assets paths.
- Tracks must be downloaded/deleted individually. IndexedDB holds downloaded tracks; Service Worker must not automatically cache tracks/.
- Music must be encrypted before GitHub publication. The app/catalog stay public; notes, photos and WAVs use the vault in docs/vault.json. The user's password is never needed for adding music: encrypt using the public key. Keep raw source files outside this repository, e.g. the task's work/source-scores/ directory.
- User requested passwords starting at 8 characters, including 8 numeric digits. Do not raise this minimum or revisit their legal rationale without a new request.
- Only encrypted *.piano.enc.json and *.wav.enc.json pairs belong in docs/tracks/. Never publish .piano.json, WAV, plaintext private keys or passwords. Known initial demo melodies were already public in v1 and remain in historical commits/core.js; do not claim retroactive secrecy or rewrite history without authorization.
- Remembered decryption keys are non-exportable CryptoKeys in IndexedDB. Backups exclude them. Forgetting the key must retain downloaded scores; downloaded scores and ordinary exports are intentionally usable without a password.
- Read FORMAT.md before transcribing a photo. Preserve the original image, label ambiguities, distinguish printed fingering from suggestions. Do not pretend photo-only import performs optical music recognition.
- Mic tracking is experimental and monophonic. Do not advertise reliable polyphonic tracking, grading, or physical iPad validation without evidence.
- After edits, run node scripts/prepare.mjs and node scripts/check.mjs. For changed timing/audio/validation/encryption logic run node --test tests/*.test.mjs. Add a track with node scripts/protect.mjs <private-input-directory>; this generates encrypted scores and WAVs before prepare. Do not use the removed --audio/--seed build flags.
- Keep work-in-progress data and auth credentials out of Git. Never create or save access tokens in the web app.
