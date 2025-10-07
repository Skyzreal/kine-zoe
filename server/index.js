require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

const calendar = google.calendar('v3');
const auth = new google.auth.GoogleAuth({
  keyFile: './service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

app.post('/api/create-payment-session', async (req, res) => {
  try {
    const { clientInfo, amount, currency, service, timeSlot, timeSlotEnd } = req.body;

    const now = new Date();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(now.getMonth() + 1);
    const selectedDate = new Date(timeSlot);

    if (selectedDate > oneMonthLater) {
      return res.status(400).json({
        error: 'Bookings can only be made up to one month in advance'
      });
    }

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
            unit_amount: amount,
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
        time_slot: timeSlot,
        time_slot_end: timeSlotEnd
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

async function updateCalendarSlot(clientInfo) {
  try {
    console.log('Updating calendar for:', clientInfo);
    console.log('timeSlotEnd received:', clientInfo.timeSlotEnd);

    const authClient = await auth.getClient();
    const calendarId = process.env.CALENDAR_ID;

    const startTime = new Date(clientInfo.timeSlot);
    console.log('Parsed start time:', startTime.toISOString());
    console.log('Raw timeSlotEnd value:', clientInfo.timeSlotEnd);

    let endTime;
    if (clientInfo.timeSlotEnd && clientInfo.timeSlotEnd !== clientInfo.timeSlot) {
      endTime = new Date(clientInfo.timeSlotEnd);
      console.log('Using provided end time:', endTime.toISOString());
    } else {
      endTime = new Date(startTime.getTime() + 60*60*1000);
      console.log('Using default 1-hour duration, end time:', endTime.toISOString());
    }

    const searchStartTime = new Date(startTime.getTime() - 60000);
    const searchEndTime = new Date(endTime.getTime() + 60000);
    console.log('Searching for existing events between:', searchStartTime.toISOString(), 'and', searchEndTime.toISOString());

    const existingEvents = await calendar.events.list({
      auth: authClient,
      calendarId,
      timeMin: searchStartTime.toISOString(),
      timeMax: searchEndTime.toISOString(),
      singleEvents: true,
    });

    const freeEvent = existingEvents.data.items?.find(event =>
      (event.summary || '').toLowerCase().includes('free')
    );

    const existingClientEvent = existingEvents.data.items?.find(event =>
      (event.summary || '').includes(clientInfo.name)
    );

    if (existingClientEvent) {
      console.log('Appointment already exists for this client at this time:', existingClientEvent.summary);
      return existingClientEvent;
    }

    if (freeEvent) {
      const freeEventStart = new Date(freeEvent.start.dateTime || freeEvent.start.date);
      const freeEventEnd = new Date(freeEvent.end.dateTime || freeEvent.end.date);

      await calendar.events.delete({
        auth: authClient,
        calendarId,
        eventId: freeEvent.id,
      });
      console.log('Deleted FREE event:', freeEvent.summary);

      const bufferEndTime = new Date(endTime.getTime() + 15*60*1000);

      if (freeEventStart < startTime) {
        const beforeFreeEvent = {
          summary: 'FREE',
          start: {
            dateTime: freeEventStart.toISOString(),
            timeZone: 'America/Toronto',
          },
          end: {
            dateTime: startTime.toISOString(),
            timeZone: 'America/Toronto',
          },
          transparency: 'transparent'
        };
        await calendar.events.insert({
          auth: authClient,
          calendarId,
          resource: beforeFreeEvent,
        });
        console.log('Created FREE slot before appointment:', freeEventStart.toISOString(), 'to', startTime.toISOString());
      }

      if (bufferEndTime < freeEventEnd) {
        const afterFreeEvent = {
          summary: 'FREE',
          start: {
            dateTime: bufferEndTime.toISOString(),
            timeZone: 'America/Toronto',
          },
          end: {
            dateTime: freeEventEnd.toISOString(),
            timeZone: 'America/Toronto',
          },
          transparency: 'transparent'
        };
        await calendar.events.insert({
          auth: authClient,
          calendarId,
          resource: afterFreeEvent,
        });
        console.log('Created FREE slot after appointment+buffer:', bufferEndTime.toISOString(), 'to', freeEventEnd.toISOString());
      }
    }

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
      }
    };

    const result = await calendar.events.insert({
      auth: authClient,
      calendarId,
      resource: calendarEvent,
    });

    console.log('Calendar event created:', result.data.htmlLink);

    const bufferStartTime = new Date(endTime);
    const bufferEndTime = new Date(endTime.getTime() + 15*60*1000);

    const bufferEvent = {
      summary: 'Préparation',
      description: 'Temps de préparation entre rendez-vous',
      start: {
        dateTime: bufferStartTime.toISOString(),
        timeZone: 'America/Toronto',
      },
      end: {
        dateTime: bufferEndTime.toISOString(),
        timeZone: 'America/Toronto',
      },
      transparency: 'opaque'
    };

    await calendar.events.insert({
      auth: authClient,
      calendarId,
      resource: bufferEvent,
    });

    console.log('15-minute buffer event created');

    return result.data;

  } catch (error) {
    console.error('Error updating calendar:', error);
    throw error;
  }
}

async function sendConfirmationEmail(clientInfo) {
  try {
    console.log('Sending confirmation email to:', clientInfo.email);

    const appointmentDate = new Date(clientInfo.timeSlot);
    const formattedDate = appointmentDate.toLocaleDateString('fr-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const formattedTime = appointmentDate.toLocaleTimeString('fr-CA', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h1 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">
            ✅ Réservation Confirmée
          </h1>

          <p style="font-size: 16px; color: #555; margin-bottom: 20px;">
            Bonjour <strong>${clientInfo.name}</strong>,
          </p>

          <p style="font-size: 16px; color: #555; margin-bottom: 25px;">
            Votre réservation a été confirmée avec succès ! Voici les détails de votre rendez-vous :
          </p>

          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #28a745;">
            <h3 style="color: #28a745; margin-top: 0;">Détails de la réservation</h3>
            <p style="margin: 8px 0;"><strong>Service :</strong> ${clientInfo.service}</p>
            <p style="margin: 8px 0;"><strong>Date :</strong> ${formattedDate}</p>
            <p style="margin: 8px 0;"><strong>Heure :</strong> ${formattedTime}</p>
            <p style="margin: 8px 0;"><strong>Client :</strong> ${clientInfo.name}</p>
            <p style="margin: 8px 0;"><strong>Téléphone :</strong> ${clientInfo.phone}</p>
          </div>

          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 25px 0;">
            <h4 style="color: #1976d2; margin-top: 0;">Informations importantes :</h4>
            <ul style="color: #555; margin: 10px 0;">
              <li>Veuillez arriver 5 minutes avant votre rendez-vous</li>
              <li>N'hésitez pas à nous contacter si vous avez des questions</li>
              <li>En cas d'annulation, merci de nous prévenir au moins 24h à l'avance</li>
            </ul>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #777; font-size: 14px;">
              Cet événement a été automatiquement ajouté à votre calendrier.
            </p>
            <p style="color: #777; font-size: 14px;">
              Merci de votre confiance !
            </p>
          </div>

          <hr style="border: none; height: 1px; background-color: #eee; margin: 30px 0;">

          <div style="text-align: center; color: #999; font-size: 12px;">
            <p>Cet email de confirmation a été envoyé automatiquement.</p>
            <p>Si vous avez des questions, répondez à cet email.</p>
          </div>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: clientInfo.email,
      subject: `Confirmation de rendez-vous - ${clientInfo.service} - ${formattedDate}`,
      html: emailHtml
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    throw error;
  }
}

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

app.get('/api/verify-payment/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    if (session.payment_status === 'paid') {
      const clientInfo = {
        name: session.metadata.client_name,
        email: session.metadata.client_email,
        phone: session.metadata.client_phone,
        service: session.metadata.service,
        timeSlot: session.metadata.time_slot,
        timeSlotEnd: session.metadata.time_slot_end
      };

      try {
        // Update calendar immediately after payment verification
        await updateCalendarSlot(clientInfo);
        console.log('Calendar updated successfully for:', clientInfo.name);

        // Send confirmation email
        console.log('Skipping email sending for now due to authentication issue');

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

    const oneMonthLater = new Date();
    oneMonthLater.setMonth(now.getMonth() + 1);
    oneMonthLater.setHours(23, 59, 59, 999);

    console.log('Making calendar API request...');
    console.log('Time range (with 2-day notice):', startDate.toISOString(), 'to', oneMonthLater.toISOString());

    const response = await calendar.events.list({
      auth: authClient,
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: oneMonthLater.toISOString(),
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

// optional endpoint for custom range (limited to 1 month maximum)
app.get('/availability/:months', async (req, res) => {
  const calendarId = process.env.CALENDAR_ID;
  const requestedMonths = parseInt(req.params.months) || 1;
  const monthsAhead = Math.min(requestedMonths, 1); // Enforce maximum of 1 month

  try {
    const authClient = await auth.getClient();

    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() + 2);
    startDate.setHours(0, 0, 0, 0);

    const futureDate = new Date();
    futureDate.setMonth(now.getMonth() + monthsAhead);
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

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'skyzbelow@gmail.com',
      subject: `Contact Form Submission from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c3e50;">New Contact Form Submission</h2>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Message:</strong></p>
            <p style="background-color: white; padding: 15px; border-radius: 5px; margin-top: 10px;">${message}</p>
          </div>
          <hr style="border: none; height: 1px; background-color: #eee; margin: 20px 0;">
          <p style="color: #777; font-size: 12px;">This message was sent from the contact form on your website.</p>
        </div>
      `,
      replyTo: email
    };

    await transporter.sendMail(mailOptions);
    console.log('Contact form email sent successfully');

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending contact form email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  GET /availability - Next month's availability`);
  console.log(`  GET /availability/:months - Custom months ahead`);
  console.log(`  POST /api/contact - Send contact form email`);
});
