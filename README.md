# Gongfu Timer

A minimal, dark steeping timer for gongfu style tea brewing. No build step, no
dependencies — three static files.

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173. Any static host works too.

## How the steep times progress

- **Steep 1** — pick from 10s, 15s, 20s, 25s, 30s.
- **After a steep under a minute** — the next options are `current + 5s`,
  `current + 10s`, `current + 15s`, and `1 min`. Picking 15s gives 20s, 25s,
  30s, 1 min.
- **Once you cross into minutes** — the options stay in minutes: the time you
  just used plus the next four. After 1 min you get 1, 2, 3, 4, 5 min; after
  2 min you get 2, 3, 4, 5, 6 min.

Options above 1 min are folded into the `1 min` button, so a 55s steep offers
1 min as its only next step.

## Interface

- Steep number sits above the dial; past steeps are listed under the buttons.
- The dial fills with water as the steep runs, and is full at 0:00.
- Tap the dial to pause or resume.
- Completion plays a chime and vibrates on phones that support it.
- The speaker icon in the top right mutes the chime; the choice is remembered
  in `localStorage` (vibration is unaffected).
- The screen is kept awake while a timer runs (where the Wake Lock API exists).

Keyboard: `space` starts the first option or pauses, `1`–`9` pick an option,
`s` toggles sound, `r` resets the session.

## Putting it on an Android home screen

Live at **https://dr-doofensmirtz.github.io/gongfu-timer/** — open that on the
phone, tap Chrome's ⋮ menu and choose **Install app**. After the first load the
service worker keeps a full copy, so it runs with no network from then on.

Chrome only offers a real install (standalone window, own icon, works offline)
over **HTTPS**. Plain `http://192.168.x.x` gets you a browser bookmark instead.

**Quick look over Wi-Fi** — phone and laptop on the same network:

```bash
python3 -m http.server 4173 --directory .
```

Open `http://<your-laptop-ip>:4173` on the phone. Good for trying it out; the
laptop has to stay awake and it will not install properly.

**Real install** — put it on any HTTPS host, then on the phone open the URL,
tap Chrome's ⋮ menu and choose **Add to Home screen / Install app**. A
throwaway tunnel is enough to do the install once:

```bash
npx cloudflared tunnel --url http://localhost:4173
```

That prints a `https://….trycloudflare.com` URL. Install from it and the
service worker caches the whole app, so it keeps launching after the tunnel is
gone. For something permanent, drop the folder on Netlify, Cloudflare Pages, or
GitHub Pages — all work unchanged, including from a subdirectory.

Bump `CACHE` in `sw.js` after editing the app, or the installed copy keeps
serving the old assets.

## Files

- `index.html` — markup and the SVG dial
- `styles.css` — dark theme, layout, wave animation
- `app.js` — timer state machine and the steep-time progression
- `manifest.json`, `sw.js`, `icons/` — home-screen install and offline support
