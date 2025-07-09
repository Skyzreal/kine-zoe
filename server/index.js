process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

const calendar = google.calendar('v3');

const auth = new google.auth.GoogleAuth({
  keyFile: './service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

app.get('/availability', async (req, res) => {
  try {
    const authClient = await auth.getClient();
    const calendarId = process.env.CALENDAR_ID;

    const now = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(now.getDate() + 7);

    const response = await calendar.events.list({
      auth: authClient,
      calendarId,
      timeMin: now.toISOString(),
      timeMax: sevenDaysLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    const freeSlots = events
      .filter(e => (e.summary || '').toLowerCase().includes('free'))
      .map(e => ({
        date: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        summary: e.summary
      }));

    res.json(freeSlots);
  } catch (error) {
    console.error('Google Calendar API Error:', error.response?.data || error.message || error);
    res.status(500).send('Failed to fetch calendar events');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
