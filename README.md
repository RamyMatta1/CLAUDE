# Car Dash

A lightweight, private launcher dashboard for the Tesla in-car browser.

- Plain HTML/CSS/JS: no frameworks, no web fonts, no blur effects, so it stays fast on older Intel Atom (MCU2) units.
- Clock, GPS speed, and local weather (Open-Meteo, no API key).
- Shortcut tiles for streaming, music, navigation and the web. Add or remove your own (stored in the browser).
- Fullscreen button (uses the YouTube redirect that puts the Tesla browser into full-screen mode).
- Video apps are **parked-only**: when GPS shows the car moving, streaming tiles lock and a banner appears.

## Run locally
Open `index.html`, or serve the folder: `python3 -m http.server 8080`.

## Hosting privately
Any static host works. For privacy, use one with access control (for example Cloudflare Pages + Cloudflare Access), and the page already sends `noindex` so search engines skip it.
