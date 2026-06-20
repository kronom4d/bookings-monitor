# Microsoft Bookings Monitor

A self-hosted, containerized automation bot that monitors any **Microsoft Bookings** (Outlook) calendar for available appointment slots and delivers real-time notifications via **Telegram** and/or **ntfy**.

---

## What it does

Microsoft Bookings calendars often fill up quickly, and open slots can appear without notice. This tool uses headless browser automation (Puppeteer) to periodically poll a Bookings page and immediately alert you when a slot becomes available — no API key or login required.

---

## Features

- **Headless browser scraping** via Puppeteer — works on any public Microsoft Bookings URL
- **Dual notification channels**: Telegram and ntfy (both optional, both independent)
- **Checks two months ahead** (current + next month)
- **Fully configurable** via environment variables: check interval, locale, ntfy endpoint, and more
- **Heartbeat status messages** so you know the bot is alive even when nothing is found
- **Docker-ready**: ships as a single container with system Chromium, no 300 MB browser bundle

---

## Tech Stack

| Component         | Technology              |
|-------------------|-------------------------|
| Runtime           | Node.js 20 (ESM)        |
| Browser automation| Puppeteer 25            |
| HTTP client       | Axios                   |
| Containerization  | Docker + Compose        |

---

## Quick Start

```bash
git clone https://github.com/your-username/bookings-monitor.git
cd bookings-monitor

cp .env.example .env
# Open .env and set at least BOOKING_URL

docker compose up -d
docker compose logs -f
```

The monitor starts immediately and checks the calendar on every interval.

---

## Running Locally (without Docker)

Requires **Node.js 20.12+**.

```bash
npm install
# Ensure .env is present with BOOKING_URL set
node index.js
```

---

## Configuration

Copy `.env.example` to `.env` and fill in your values.

| Variable                    | Required | Default                  | Description |
|-----------------------------|----------|--------------------------|-------------|
| `BOOKING_URL`               | **Yes**  | —                        | Full Microsoft Bookings URL to monitor |
| `BOOKING_NAME`              | No       | `Appointment`            | Label used in notification messages |
| `CALENDAR_LOCALE`           | No       | `en-US`                  | Locale for month names (must match Outlook UI language) |
| `CALENDAR_NEXT_MONTH_TITLE` | No       | `Next`                   | Title attribute of the "next month" button |
| `CHECK_INTERVAL_MINUTES`    | No       | `10`                     | How often to poll the calendar |
| `STATUS_INTERVAL_HOURS`     | No       | `24`                     | How often to send a heartbeat status message |
| `TELEGRAM_BOT_TOKEN`        | No       | —                        | Telegram bot token — skip to disable Telegram |
| `TELEGRAM_CHAT_ID`          | No       | —                        | Telegram chat or user ID |
| `NTFY_URL`                  | No       | `http://localhost:2586`  | Base URL of your ntfy instance |
| `NTFY_TOPIC`                | No       | —                        | ntfy topic for alerts — skip to disable ntfy |
| `NTFY_TOPIC_LOGGING`        | No       | —                        | ntfy topic for debug logs |
| `NTFY_USER`                 | No       | —                        | ntfy basic auth username |
| `NTFY_PASSWORD`             | No       | —                        | ntfy basic auth password |

> **Note on locale settings**: `CALENDAR_LOCALE` and `CALENDAR_NEXT_MONTH_TITLE` must match the language of the Outlook tenant. For a German Outlook calendar: `CALENDAR_LOCALE=de-DE` and `CALENDAR_NEXT_MONTH_TITLE=Nächster Monat`.

---

## Architecture

```
┌────────────────────────────────────────────────┐
│               bookings-monitor                 │
│                                                │
│  On startup + every CHECK_INTERVAL_MINUTES:    │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │            scrapeCalendar()              │  │
│  │                                          │  │
│  │  Puppeteer  →  BOOKING_URL               │  │
│  │  scrapeMonth()   → current month dates   │  │
│  │  changeMonth()   → next month dates      │  │
│  │  checkAvailability() → filter enabled    │  │
│  └──────────────────────────────────────────┘  │
│                       │                        │
│          slot found   │                        │
│                       ▼                        │
│  ┌──────────────────────────────────────────┐  │
│  │            Notifications                 │  │
│  │  • Telegram  (optional)                  │  │
│  │  • ntfy      (optional)                  │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Every STATUS_INTERVAL_HOURS:                  │
│    → Heartbeat message with run count          │
└────────────────────────────────────────────────┘
```

The scraper reads `aria-disabled="false"` attributes on calendar date cells to detect available slots. Once a slot is found, the bot continues re-notifying on each poll interval until the process is restarted.

---

## License

MIT
