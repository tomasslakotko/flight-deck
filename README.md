# Flight Deck

Installable roster PWA for cabin crew. Built for phone and tablet in the browser (Add to Home Screen), hosted on Vercel.

## Features

- Import roster via **iCal / webcal URL** or **PDF / .ics** (NetLine IDP and similar)
- Live flight status for today’s sectors
- Passenger list + seat map from pasted onboard lists
- Private per-flight notes (device-only)
- Week and month schedule views
- Local check-in / boarding / delay notifications
- Offline-friendly cached roster and live status

## Import

1. Paste your airline roster iCal / webcal URL (fetched through `/api/roster/ical`)
2. Or drop a PDF / `.ics` file — parsing stays on the device

A sample calendar is at `public/samples/airbaltic-roster.ics`.

We do **not** log into your airline portal with your password.

## Live flights

Uses public flight-data APIs when configured. Lists and roster data stay on the device (IndexedDB).
