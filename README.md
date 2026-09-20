# TinyRoom — Free Firebase + GitHub Pages MVP

## What this version fixes

The previous Cloudflare/Node version failed on the supplied PC log because it was using Node.js 12.22.3 while current Wrangler required Node.js 22. This version removes that toolchain completely.

You do NOT need:
- Node.js
- npm
- npx
- Wrangler
- Cloudflare Workers
- a VPS
- a paid server

## Stack
- GitHub Pages: static hosting
- Firebase Authentication: anonymous sign-in
- Firebase Realtime Database: realtime chat
- Firebase JavaScript SDK 12.19.0 from Google's CDN

## Features
- Two-person temporary room
- Random 32-character invite token
- Shareable invite link
- No email/password
- Text + emoji
- 500-character message limit
- Last 50 messages
- 60-minute room lifetime
- Manual Delete button
- Browser-side expiry cleanup

## Important limitation
The free-only version does not have a server-side scheduled deletion job. When the timer reaches zero, an active participant's browser tries to delete the room. If nobody is active at expiry and nobody returns, old data may remain in Firebase until an authorized cleanup occurs.

Do not advertise this MVP as 100% anonymous, zero logging, guaranteed immediate deletion, or end-to-end encrypted.

## Setup

### 1. Firebase project
Open https://console.firebase.google.com/ and create a project.

Project settings -> Your apps -> Web -> Register app.

Copy the web configuration into `firebase-config.js`.

### 2. Anonymous Authentication
Firebase Console -> Authentication -> Sign-in method -> Anonymous -> Enable.

### 3. Realtime Database
Firebase Console -> Build -> Realtime Database -> Create database.

Then open Realtime Database -> Rules and paste `database.rules.json`, then Publish.

### 4. GitHub Pages
Create a NEW PUBLIC GitHub repository, for example `tinyroom-chat`.

Upload the project files so that `index.html` is at the repository root.

Repository -> Settings -> Pages:
- Source: Deploy from a branch
- Branch: main
- Folder: /(root)
- Save

The URL will be similar to:
https://YOURNAME.github.io/tinyroom-chat/

GitHub Free supports Pages for public repositories.

### 5. Firebase authorized domain
Firebase Console -> Authentication -> Settings -> Authorized domains.

Add:
`YOURNAME.github.io`

Add the hostname only, not the full page URL.

### 6. Test
Open browser A -> Create private room -> Copy link.

Open the link in browser B -> choose nickname -> Join.

Send:
`Hello 👋`

Try a third browser; the room is limited to two participants.

Press Delete to remove the room immediately.

## Local test (optional)
You still do not need Node.js.

If Python is installed:
`py -m http.server 8080`

Open:
http://localhost:8080/

Avoid opening index.html directly with file:// if the browser blocks module requests.

## Free plan
Firebase currently lists the Spark plan as no-cost and says no payment method is required. Realtime Database includes 1 GB stored and 10 GB/month of downloads on the no-cost plan. If a no-cost quota is exceeded on Spark, Firebase says the affected product is stopped for the rest of that month instead of charging an overage.

## Next production upgrades
Only after the MVP has real usage:
- stronger anti-abuse/rate limits
- App Check and monitoring
- reliable server-side cleanup
- privacy policy and terms
- paid plan
- files/images
- Android wrapper
