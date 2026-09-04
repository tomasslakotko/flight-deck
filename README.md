# airBaltic Crew

Installable roster PWA for airBaltic cabin crew. Built for iPhone and iPad in the browser (Add to Home Screen), hosted on Vercel, no paid APIs required.

**EN:** Import a roster, see today's shift, and look up live status, registration, and ETD. Paste a passenger list per flight. Data stays on the device (IndexedDB).

**RU:** Импортируйте ростер, смотрите смену и живой статус рейса, регистрацию борта и ETD. Список пассажиров вставляется текстом. Данные хранятся на устройстве.

## Run locally

```bash
npm install
cp .env.example .env.local
# paste AIRLABS_API_KEY and/or AVIATIONSTACK_API_KEY (optional — the app works without them)
npm run dev
```

Open [http://127.0.0.1:43173](http://127.0.0.1:43173).

On iPhone/iPad Safari: Share → Add to Home Screen.

## Roster import

- **iCal / webcal URL** from CrewLink (fetched through `/api/roster/ical` because Safari blocks calendar CORS)
- **`.ics` file** or **PDF** (PDF text is extracted in the browser)
- **Manual** duty / flight entry

A sample calendar is at `public/samples/airbaltic-roster.ics`.

We do **not** log into CrewLink with your airline password.

## Live flight data (free)

`GET /api/flights/live?flightIata=BT139` merges, with a 3-minute cache:

1. [AirLabs](https://airlabs.co) — status, registration, ETD/ETA, gate (`AIRLABS_API_KEY`)
2. [AviationStack](https://aviationstack.com) — status, registration, actual times, gate (`AVIATIONSTACK_API_KEY`)
3. [adsb.lol](https://api.adsb.lol) — live position / callsign `BTI139`
4. [hexdb.io](https://hexdb.io) — registration from ICAO24
5. [OpenSky](https://opensky-network.org) — fallback position

If every source misses, roster STD/STA still show and the card says live data is unavailable.

Rotate the AirLabs key if it was ever pasted into chat, and keep it only in Vercel env / `.env.local`.

## Passenger list

On a flight → Passenger list → Paste. Supported today:

```
12A  SMITH/JOHN MR  VGML  WCHR
DOE/JANE MS  4A  Gold
Seat,Name,Meal
1A,BERZINS/JANIS,VGML
```

Send a real airBaltic dump later to tighten the parser. Lists never leave the device.

## Deploy on Vercel (Hobby / free)

1. Push this repo and import it in Vercel
2. Set `AIRLABS_API_KEY` and/or `AVIATIONSTACK_API_KEY`
3. Deploy

## Stack

Next.js App Router, Tailwind, shadcn/ui, Dexie, ical.js, PDF.js.
