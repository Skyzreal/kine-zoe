require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

const calendar = google.calendar('v3');
const auth = new google.auth.GoogleAuth({
  keyFile: './service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

app.post('/api/create-payment-session', async (req, res) => {
  try {
    const { clientInfo, amount, currency, service, timeSlot } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency || 'cad',
            product_data: {
              name: service,
              description: `Appointment on ${new Date(timeSlot).toLocaleDateString('fr-CA', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}`,
            },
            unit_amount: amount, // Amount in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/cancel`,
      customer_email: clientInfo.email,
      metadata: {
        client_name: `${clientInfo.prenom} ${clientInfo.nom}`,
        client_phone: clientInfo.phone,
        client_email: clientInfo.email,
        service: service,
        time_slot: timeSlot
      }
    });

    res.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Error creating payment session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Removed webhook handling - using redirect flow instead

// Update calendar function - works with your existing Google Calendar setup
async function updateCalendarSlot(clientInfo) {
  try {
    console.log('Updating calendar for:', clientInfo);

    const authClient = await auth.getClient();
    const calendarId = process.env.CALENDAR_ID;

    // First, find and delete the existing "FREE" event for this time slot
    const startTime = new Date(clientInfo.timeSlot);
    const endTime = new Date(startTime.getTime() + 60*60*1000); // Assuming 1-hour slots

    // Get events for this specific time range
    const existingEvents = await calendar.events.list({
      auth: authClient,
      calendarId,
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
    });

    // Find and delete the FREE event
    const freeEvent = existingEvents.data.items?.find(event =>
      (event.summary || '').toLowerCase().includes('free')
    );

    if (freeEvent) {
      await calendar.events.delete({
        auth: authClient,
        calendarId,
        eventId: freeEvent.id,
      });
      console.log('Deleted FREE event:', freeEvent.summary);
    }

    // Create the new booked event
    const calendarEvent = {
      summary: `${clientInfo.service} - ${clientInfo.name}`,
      description: `Client: ${clientInfo.name}\nEmail: ${clientInfo.email}\nPhone: ${clientInfo.phone}\nService: ${clientInfo.service}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/Toronto',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Toronto',
      },
      attendees: [
        { email: clientInfo.email }
      ]
    };

    const result = await calendar.events.insert({
      auth: authClient,
      calendarId,
      resource: calendarEvent,
    });

    console.log('Calendar event created:', result.data.htmlLink);
    return result.data;

  } catch (error) {
    console.error('Error updating calendar:', error);
    throw error;
  }
}

// Send confirmation email
async function sendConfirmationEmail(clientInfo) {
  // Use your preferred email service (SendGrid, Nodemailer, etc.)
  console.log('Sending confirmation email to:', clientInfo.email);

  // Example with Nodemailer:
  // const transporter = nodemailer.createTransporter({...});
  // await transporter.sendMail({
  //   to: clientInfo.email,
  //   subject: 'Appointment Confirmation',
  //   html: `
  //     <h2>Appointment Confirmed!</h2>
  //     <p>Hello ${clientInfo.name},</p>
  //     <p>Your appointment for ${clientInfo.service} on ${clientInfo.timeSlot} has been confirmed.</p>
  //   `
  // });
}

// API endpoint to update calendar (called from frontend)
app.post('/api/update-calendar', (req, res) => {
  const { timeSlot, status, service, clientInfo } = req.body;

  // Update your calendar system
  updateCalendarSlot({
    name: clientInfo.name,
    email: clientInfo.email,
    phone: clientInfo.phone,
    service: service,
    timeSlot: timeSlot
  });

  res.json({ success: true });
});

// API endpoint to send confirmation email
app.post('/api/send-confirmation-email', (req, res) => {
  const emailData = req.body;

  sendConfirmationEmail({
    name: emailData.client_name,
    email: emailData.to_email,
    phone: emailData.phone,
    service: emailData.service,
    timeSlot: emailData.time_slot
  });

  res.json({ success: true });
});

// Verify payment session and handle booking completion (redirect flow)
app.get('/api/verify-payment/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    if (session.payment_status === 'paid') {
      const clientInfo = {
        name: session.metadata.client_name,
        email: session.metadata.client_email,
        phone: session.metadata.client_phone,
        service: session.metadata.service,
        timeSlot: session.metadata.time_slot
      };

      try {
        // Update calendar immediately after payment verification
        await updateCalendarSlot(clientInfo);
        console.log('Calendar updated successfully for:', clientInfo.name);
        
        // Send confirmation email
        await sendConfirmationEmail(clientInfo);
        console.log('Confirmation email sent to:', clientInfo.email);
        
      } catch (bookingError) {
        console.error('Error processing booking after payment:', bookingError);
        // Still return success since payment was completed
        // Calendar/email failures shouldn't affect the user experience
      }

      res.json({
        success: true,
        clientInfo,
        paymentStatus: session.payment_status
      });
    } else {
      res.json({
        success: false,
        paymentStatus: session.payment_status
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/availability', async (req, res) => {
  const calendarId = process.env.CALENDAR_ID;

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
  const calendarId = process.env.CALENDAR_ID;
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
