# SIGNAL — MP4 → MP3 Converter

A browser-based rebuild of the original `FFMPEG_Mp4_to_Mp3_Convetor_V2.ps1` PowerShell/WinForms
tool, as a React + Vite + TypeScript app.

Conversion runs entirely on-device: files are never uploaded anywhere.

## What changed vs. the PowerShell version

The original script shelled out to a local `ffmpeg.exe`, browsed folders with WinForms dialogs,
and batch-renamed/moved files on disk — all Windows-only, desktop-only operations. A browser app
can't touch the filesystem or spawn native processes, so this rebuild keeps the same _purpose_
(pick video files, pick a bitrate, get MP3s back) but adapts the mechanics:

| PowerShell version                                                                                              | This app                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FolderBrowserDialog` + regex filename match                                                                    | Drag-and-drop / file picker (multi-select)                                                                                                                 |
| Local `ffmpeg.exe` via `& $FFMPEG ...`                                                                          | [Mediabunny](https://mediabunny.dev) — demuxes and re-encodes in the browser with WebCodecs. No ffmpeg, no server, no upload                               |
| `-ab <bitrate>`                                                                                                 | Bitrate selector (128k – 320k), passed to Mediabunny's audio encoder                                                                                       |
| MP3 encoding by ffmpeg's LAME                                                                                   | The browser's native MP3 encoder if it has one, otherwise [`@mediabunny/mp3-encoder`](https://www.npmjs.com/package/@mediabunny/mp3-encoder) (LAME as WASM) |
| `Move-Item` to output folder                                                                                    | Browser download (single file, or "Download All" as a `.zip` via JSZip)                                                                                    |
| Scale / format-filter combo boxes (video-only, unused by the actual MP3 conversion path in the original script) | Dropped — they weren't wired into the MP3 conversion in the source script                                                                                  |
| `$lblStatus.Text`                                                                                               | Status bar at the bottom, same "Status: Standby / Converting…" language                                                                                    |

## Features

- **Input formats:** MP4, MPEG, FLV, F4V, MOV, MKV, AVI, WEBM — up to 500 MB per file.
- **Queue:** per-file progress, retry failed, clear completed, save one file or all as a `.zip`.
- **Sign-in:** the converter sits behind Firebase Authentication (Google, or email and password
  with password reset).
- **Daily quota:** 5 conversions per day per account, resetting at midnight UTC. The count lives in
  a Firestore `quotas/{uid}` document, so it follows the user across browsers and survives clearing
  site data. `firestore.rules` only lets the owner raise it by one at a time, up to the limit. The
  converter needs a connection to read the count before it will convert. Because conversion runs in
  the browser, this deters casual overuse; it cannot stop someone who modifies the page's code.
  To change the limit, update both `firestore.rules` and `DEFAULT_DAILY_LIMIT` (or `VITE_DAILY_LIMIT`).
- **Consent banner and usage tracking:** nothing is tracked until the visitor accepts. After that
  the app writes `visit`, `sign_in`, `sign_up` and `conversion` events to a Firestore
  `usage_events` collection, with a random visitor ID cookie, the bitrate and the input size.
  File names and contents are never sent. Declining removes the visitor cookie.

## Setup

The app needs a Firebase project. Without the variables below it shows a "Sign-in is not
configured" message instead of the converter.

1. In the [Firebase console](https://console.firebase.google.com), register a **Web app** under
   Project settings → Your apps.
2. Under Authentication → Sign-in method, enable **Email/Password** and **Google**.
3. Under Authentication → Settings → Authorized domains, add the domain you deploy to.
4. Create a **Firestore Database**, then deploy the rules:

   ```bash
   npx firebase-tools deploy --only firestore:rules --project <project-id>
   ```

5. Copy `.env.example` to `.env.local` and fill it in from the web app's config:

   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_APP_ID=
   ```

   Use the `apiKey` shown by Firebase for the web app (or `npx firebase-tools apps:sdkconfig web`),
   not another key from Google Cloud Console.

## Run it

```bash
npm install
npm run dev
```

## Test and lint

```bash
npm test
npm run lint
```

`firestore.rules` has its own suite, run against the Firestore emulator. The emulator needs Java 21
or newer. It does not have to be your default Java: the script finds an installed JDK 21+ and uses
it for that one command. The emulator is downloaded on first use:

```bash
npm run test:rules
```

It also checks that the daily limit in the rules matches `DEFAULT_DAILY_LIMIT` in the app.

## Build for production

```bash
npm run build
```

Output goes to `dist/`, deployable to any static host. No special server headers are required.

## Deploy

`.github/workflows/deploy.yml` lints, runs the unit and rules tests, builds and deploys to Netlify: a preview for each
pull request into `main`, and production on every push to `main`. It needs these repository
secrets: the four `VITE_FIREBASE_*` values, `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.

On a push to `main` it also deploys `firestore.rules`, before the site. That step needs a
`FIREBASE_SERVICE_ACCOUNT` secret holding the JSON key of a Google Cloud service account with the
**Firebase Rules Admin** and **Service Usage Consumer** roles. Without the secret the step is
skipped with a warning and the rules must be deployed by hand.

## Stack

- React 19 + TypeScript
- Vite, Vitest, oxlint
- `mediabunny` + `@mediabunny/mp3-encoder` (conversion, lazy-loaded)
- `firebase` (Authentication, Firestore Lite for usage events)
- `jszip` (bulk download)
