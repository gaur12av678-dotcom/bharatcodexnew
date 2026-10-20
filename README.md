# BharatCodex

Team coding platform — Google sign-in, code editor, live preview (mobile/tablet/desktop), admin monitoring. **No AI features.**

## Setup (5 minute)

```bash
npm install
npm run dev
```
App chalega: `http://localhost:5173`

### Firebase me yeh cheezein (ek baar):

1. **Firestore Rules** — Firebase Console → Firestore Database → Rules tab → `firestore.rules` ki puri copy paste karo → **Publish**
2. **Authentication** — Google sign-in enable karo (tumne already kiya hai)
3. **Authorized domains** — localhost default hota hai. Hosting pe daaloge to apna domain add karna

### Admin kaise banta hai?
**Pehla Google sign-in = Admin.** `meta/app` doc race-safe transaction se track hota hai — do log ek saath aaye tab bhi sirf ek admin. Admin kisi ko bhi "Make Admin" kar sakta hai (Admin Panel se).

## Features
- Monaco editor (VS Code wala) — file tabs, autosave (1.2 sec debounce)
- Live preview — sandboxed iframe, HTML/CSS/JS + React (Babel browser me compile)
- Viewport toggle — Mobile 375px / Tablet 768px / Desktop
- Admin panel — saare users + saare projects, live monitoring, role management, koi bhi project open/delete

## Tech
React + Vite + Tailwind + Firebase Auth/Firestore + Monaco

## Security note
Firebase config public hoti hai (client-side key hai) — asli security Firestore Rules se aati hai. Rules publish karna **zaroori** hai.
