# Gongfu Timer

A minimal, dark steeping timer for gongfu style tea brewing. No build step, no
dependencies — three static files.

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173. Any static host works too.

## How it works

The app opens on a setup screen:

- **Initial steep** — a dropdown from 5s to 1 min in 5 second steps.
- **Increment per steep** — set with `-5s` / `+5s`, anywhere from 0 to 60s.

**Tap the dial** to start. Tapping it again pauses and resumes. When a steep
finishes the cup fills, chimes, and then settles to show the next infusion
time, which is the steep you just ran plus the increment. Tap the dial again to
brew it.

The increment is a first-steep setting. Once brewing starts it gives way to
**Next infusion**, whose `-5s` / `+5s` nudge the pending time (5s to 10 min).
Between those two buttons sits the gap between the steep just finished and the
pending one — the chosen increment to begin with, then whatever the nudges make
it, including `0s` or a negative. An adjusted time becomes the base for the
next increment, so shortening one steep carries through to the rest of the
session. The steep log sits below.

`Reset` returns to the setup screen and clears the steep log.

## Interface

- Steep number sits above the dial; past steeps are listed underneath.
- The dial fills with water as the steep runs, and is full at 0:00.
- On completion the water washes to a brighter amber, the ring flares, and the
  dial pulses for about a second and a half before draining to the next time.
- Completion plays a chime and vibrates on phones that support it.
- With permission, it also posts a notification carrying a **Start next
  infusion** button, so the next steep can be started without opening the app.
  The bell icon turns this off; it greys out if the browser blocked the
  permission. Note that firing it needs running JavaScript, and browsers
  throttle backgrounded pages, so it can arrive late if you have been away for
  several minutes.
- The speaker icon in the top right mutes the chime; the choice is remembered
  in `localStorage` (vibration is unaffected).
- The screen is kept awake while a timer runs (where the Wake Lock API exists).

Keyboard: `space` starts, pauses and resumes, `up`/`down` (or `+`/`-`) adjust
the upcoming infusion, `s` toggles sound, `n` toggles the notification, `r`
resets.

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
