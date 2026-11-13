# BharatCodex

BharatCodex is a collaborative browser-based coding workspace with Firebase projects, Monaco editor, live preview, GitHub sync, and a Node.js development runtime powered by WebContainers.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Runtime requirements

The Development Runtime uses the WebContainer API to run Node.js and npm commands inside the browser tab.

- Use HTTPS in production (localhost is suitable for local development).
- Hosting must send these response headers on the app document:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: credentialless`
- Use a supported Chromium-based browser with SharedArrayBuffer and cross-origin isolation enabled.
- The first runtime boot can take a little time. Start Runtime, run `npm install`, then use Run Dev Server.
- The runtime is browser-isolated; it is not a remote Linux server and does not provide unrestricted access to the user's computer.

Firebase Hosting headers are configured in `firebase.json`. Deploy the hosting configuration before expecting the runtime to boot on the live site.

## Features

- Monaco editor with file/folder management, autosave, search, version history, undo backups, and ZIP import/export.
- Static HTML/CSS/JS preview and Bharat Preview Engine for supported React projects.
- WebContainer Development Runtime: Node.js, npm install, interactive shell, Vite dev server, HMR, and live preview.
- Build + Export: run the project's build script and export the `dist` directory as a ZIP archive.
- Project starters: HTML/CSS/JS, React + Vite, React + TypeScript, and Node.js server.
- GitHub repository linking with push/pull support.
- Firebase Authentication and Firestore project storage.

## Runtime notes

WebContainers are provided by StackBlitz technology and rely on StackBlitz-hosted runtime services. They are not a fully self-hosted/offline runtime. Some packages, native Node modules, operating-system-specific commands, and applications requiring unrestricted network or filesystem access may not work in the browser runtime.

## Firebase setup

1. Configure Firebase Authentication providers and authorized domains.
2. Publish the repository's `firestore.rules` in Firebase Console.
3. Deploy Firebase Hosting after updating `firebase.json` so the COOP/COEP headers are active.

## Security

Firebase client configuration is public by design. Firestore Security Rules protect project data. The WebContainer runtime executes project commands inside its browser environment; only run code from projects you trust.
