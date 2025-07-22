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
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(now.getDate() + 7);

    console.log('Making calendar API request...');
    console.log('Time range:', now.toISOString(), 'to', sevenDaysLater.toISOString());

    const response = await calendar.events.list({
      auth: authClient,
      calendarId,
      timeMin: now.toISOString(),
      timeMax: sevenDaysLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
