import puppeteer from 'puppeteer';
import axios from 'axios';

// Load .env when running locally (Node 20.12+). In Docker, env vars are injected by Compose.
try { process.loadEnvFile(); } catch {}

const BOOKING_URL = process.env.BOOKING_URL;
const BOOKING_NAME = process.env.BOOKING_NAME || 'Appointment';
const CALENDAR_LOCALE = process.env.CALENDAR_LOCALE || 'en-US';
const CALENDAR_NEXT_MONTH_TITLE = process.env.CALENDAR_NEXT_MONTH_TITLE || 'Next';
const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || '10', 10);
const STATUS_INTERVAL_HOURS = parseInt(process.env.STATUS_INTERVAL_HOURS || '24', 10);

const NTFY_URL = process.env.NTFY_URL || 'http://localhost:2586';
const NTFY_USER = process.env.NTFY_USER || '';
const NTFY_PASSWORD = process.env.NTFY_PASSWORD || '';
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const NTFY_TOPIC_LOGGING = process.env.NTFY_TOPIC_LOGGING;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOOKING_URL) {
  console.error('BOOKING_URL is required. Set it in your .env file or environment.');
  process.exit(1);
}

let found = false;
let counter = 0;

async function sendTelegramNotification(title, message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: `*${title}*\n\n${message}\n\n[Open booking page](${BOOKING_URL})`,
        parse_mode: 'Markdown',
        disable_notification: false,
      },
      { timeout: 5000 }
    );
    console.log(`Telegram sent: ${title}`);
  } catch (error) {
    console.error('Error sending Telegram notification:', error.message);
    sendNtfyLogging('Telegram error', error.message);
  }
}

async function sendNtfy(title, message, priority = 'default') {
  if (!NTFY_TOPIC) return;
  try {
    await axios.post(`${NTFY_URL}/${NTFY_TOPIC}`, message, {
      headers: { Title: title, Priority: priority, Click: BOOKING_URL },
      auth: NTFY_USER ? { username: NTFY_USER, password: NTFY_PASSWORD } : undefined,
      timeout: 5000,
    });
    console.log(`ntfy sent: ${title}`);
  } catch (error) {
    console.error('Error sending ntfy notification:', error.message);
  }
}

async function sendNtfyLogging(title, message, priority = 'default') {
  if (!NTFY_TOPIC_LOGGING) return;
  try {
    await axios.post(`${NTFY_URL}/${NTFY_TOPIC_LOGGING}`, message, {
      headers: { Title: title, Priority: priority, Click: BOOKING_URL },
      auth: NTFY_USER ? { username: NTFY_USER, password: NTFY_PASSWORD } : undefined,
      timeout: 5000,
    });
  } catch (error) {
    console.error('Error sending ntfy log notification:', error.message);
  }
}

async function scrapeCalendar() {
  let browser;
  found = false;
  try {
    counter++;
    console.log(`Scrape attempt #${counter} — ${new Date().toISOString()}`);
    sendNtfyLogging('Scrape started', `Run #${counter}`, 'low');

    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(BOOKING_URL);

    const allDates = [
      ...(await scrapeMonth(page)),
      ...(await changeMonth(page)),
    ];

    await checkAvailability(allDates);
  } catch (error) {
    console.error('Scrape error:', error.message);
    sendNtfy('⚠️ Scraper error', error.message, 'high');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.error('Error closing browser:', error.message);
      }
    }
  }
}

async function scrapeMonth(page) {
  try {
    await page.waitForSelector('div[data-value]');
    return await page.evaluate(() =>
      Array.from(document.querySelectorAll('div[data-value]')).map((el) => ({
        date: el.getAttribute('data-value'),
        ariaDisabled: el.getAttribute('aria-disabled'),
        ariaLabel: el.getAttribute('aria-label'),
      }))
    );
  } catch (error) {
    console.error('Error scraping month:', error.message);
    sendNtfyLogging('Scrape month error', error.message, 'low');
    return [];
  }
}

async function changeMonth(page) {
  try {
    console.log('Navigating to next month...');
    const nextMonthButton = await page.waitForSelector(
      `div[data-disabled="false"][title="${CALENDAR_NEXT_MONTH_TITLE}"]`,
      { visible: true, timeout: 5000 }
    );

    if (nextMonthButton) {
      await nextMonthButton.click();
      const date = new Date();
      date.setMonth(date.getMonth() + 1);
      const nextMonthName = date.toLocaleString(CALENDAR_LOCALE, { month: 'long' });
      await page.waitForSelector(
        `div[title*="${nextMonthName} ${date.getFullYear()}"]`,
        { visible: true, timeout: 5000 }
      );
      console.log(`Month changed to ${nextMonthName}.`);
      sendNtfyLogging('Month changed', nextMonthName, 'low');
      return await scrapeMonth(page);
    }
  } catch (error) {
    console.error('Failed to navigate to next month:', error.message);
    sendNtfyLogging('Month navigation failed', error.message, 'low');
  }
  return [];
}

async function checkAvailability(allDates) {
  const available = allDates.filter(
    (d) => d.ariaLabel && d.ariaDisabled !== 'true'
  );

  if (available.length > 0) {
    const dates = available.map((d) => d.date).join(', ');
    console.log(`🚨 SLOT FOUND: ${dates}`);
    sendNtfy(`🚨 ${BOOKING_NAME} slot available!`, `Available dates: ${dates}`, 'high');
    sendTelegramNotification(
      `🚨 ${BOOKING_NAME} slot available!`,
      `Available dates: ${dates}`
    );
    found = true;
  } else {
    console.log('No available slots found.');
    sendNtfyLogging('Run complete', 'No slots available.', 'low');
  }
}

// Re-notify and re-check on configured interval
setInterval(() => {
  if (found) {
    sendNtfy(`🚨 ${BOOKING_NAME} slot available!`, 'A slot was found — check the booking page!', 'high');
    sendTelegramNotification(`🚨 ${BOOKING_NAME} slot available!`, 'A slot was found earlier — check the booking page!');
  }
  scrapeCalendar();
}, CHECK_INTERVAL_MINUTES * 60 * 1000);

// Heartbeat status message
setInterval(() => {
  const status = found ? 'A slot was found!' : 'No slot found yet.';
  const msg = `${status} Total runs: ${counter}.`;
  console.log(`Status update: ${msg}`);
  sendNtfy('Status update', msg, 'low');
  sendTelegramNotification('Status update', msg);
}, STATUS_INTERVAL_HOURS * 60 * 60 * 1000);

// Initial run on startup
console.log(`Microsoft Bookings Monitor started.\nChecking: ${BOOKING_URL}`);
console.log(`Poll interval: every ${CHECK_INTERVAL_MINUTES} min | Status: every ${STATUS_INTERVAL_HOURS}h`);
sendNtfyLogging('Monitor started', `Checking: ${BOOKING_URL}`, 'low');
sendTelegramNotification('Monitor started', `Now watching:\n${BOOKING_URL}`);
scrapeCalendar();
