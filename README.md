# Yum Run — pretend food delivery tracker

Kid picks a food, taps **Order Food**, and watches a car drive a real road route
to your house: order received → cooking → picked up → on the way → almost there → confetti.
Nothing is actually ordered; no accounts, no tracking.

## Host it
It's plain static files — any web server works. On a Synology NAS:
1. Install **Web Station** (Package Center).
2. Copy this whole folder into the `web` shared folder, e.g. `web/yum-run/`.
3. Visit `http://<nas-ip>/yum-run/` from the iPad.

**HTTPS is optional but nicer.** Over plain http everything works except
"Use my current location" and offline caching. For https, use DSM's reverse proxy
with a Let's Encrypt cert, or drop the folder on Netlify / GitHub Pages / Cloudflare Pages.

## Put it on the iPad
Safari → open the URL → Share → **Add to Home Screen**. Open it from the home-screen icon
(it has its own storage, so do the first-time setup there, not in a Safari tab).

## Grown-up settings
Press and **hold ⚙️ for 2 seconds** (opens automatically the first time).
- Home: drag the 🏠, tap the map, search an address, or use location
- How far away the driver starts (0.5–5 mi) and how long the whole order takes (1–20 min)
- Map follows the car, sounds on/off

## Notes
- The iPad needs internet: maps come from CARTO/OpenStreetMap and routes from the public
  OSRM demo server. If routing is unreachable it falls back to a blocky made-up route.
- Screen stays awake while tracking (iPadOS 16.4+).
- Closing the app mid-order is fine; it picks up where it left off.
- Add `?speed=10` to the URL to run 10× faster for testing.
- After editing files, bump `VERSION` in `sw.js` so installed copies refresh.
