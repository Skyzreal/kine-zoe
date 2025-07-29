require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json());

const calendar = google.calendar('v3');
const calendarId = 'skyzbelow@gmail.com';
const auth = new google.auth.GoogleAuth({
  keyFile: './service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

app.get('/availability', async (req, res) => {
  const calendarId = 'skyzbelow@gmail.com';

  try {
    console.log('Getting auth client...');
    const authClient = await auth.getClient();
    console.log('Auth client obtained successfully');

    console.log('CALENDAR_ID:', calendarId);

    if (!calendarId) {
      return res.status(400).json({ error: 'CALENDAR_ID not found in environment variables' });
    }

    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() + 2);
    startDate.setHours(0, 0, 0, 0);

    const nextMonth = new Date();
    nextMonth.setMonth(now.getMonth() + 1);
    nextMonth.setDate(new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate());
    nextMonth.setHours(23, 59, 59, 999);

    console.log('Making calendar API request...');
    console.log('Time range (with 2-day notice):', startDate.toISOString(), 'to', nextMonth.toISOString());

    const response = await calendar.events.list({
      auth: authClient,
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: nextMonth.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });

    console.log('Calendar API response received');
    const events = response.data.items || [];
    console.log('Number of events found:', events.length);

    const freeSlots = events
      .filter(e => (e.summary || '').toLowerCase().includes('free'))
      .map(e => ({
        date: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        summary: e.summary
      }));

    console.log('Free slots found:', freeSlots.length);

    // Log some sample dates for debugging
    if (freeSlots.length > 0) {
      console.log('Sample slots:');
      freeSlots.slice(0, 5).forEach((slot, index) => {
        console.log(`${index + 1}. ${slot.date} - ${slot.end} (${slot.summary})`);
      });
    }

    res.json(freeSlots);
  } catch (error) {
    console.error('=== DETAILED ERROR INFO ===');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error status:', error.status);

    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }

    console.error('Full error:', error);
    console.error('=========================');

    res.status(500).json({
      error: 'Failed to fetch calendar events',
      calendarId: calendarId,
      details: error.message
    });
  }
});

// optional endpoint for custom range
app.get('/availability/:months', async (req, res) => {
  const calendarId = 'skyzbelow@gmail.com';
  const monthsAhead = parseInt(req.params.months) || 1;

  try {
    const authClient = await auth.getClient();

    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() + 2);
    startDate.setHours(0, 0, 0, 0);

    const futureDate = new Date();
    futureDate.setMonth(now.getMonth() + monthsAhead);
    futureDate.setDate(new Date(futureDate.getFullYear(), futureDate.getMonth() + 1, 0).getDate());
    futureDate.setHours(23, 59, 59, 999);

    console.log(`Getting availability for ${monthsAhead} month(s) ahead (with 2-day notice)`);
    console.log('Time range:', startDate.toISOString(), 'to', futureDate.toISOString());

    const response = await calendar.events.list({
      auth: authClient,
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: futureDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
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
    console.error('Error fetching extended availability:', error);
    res.status(500).json({
      error: 'Failed to fetch calendar events',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  GET /availability - Next month's availability`);
  console.log(`  GET /availability/:months - Custom months ahead`);
});
