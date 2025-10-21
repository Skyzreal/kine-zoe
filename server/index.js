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

// Load service account from environment variable or file
let credentials;
if (process.env.GOOGLE_SERVICE_ACCOUNT) {
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  } catch (error) {
    console.error('Error parsing GOOGLE_SERVICE_ACCOUNT environment variable:', error);
    credentials = require('./service-account.json');
  }
} else {
  credentials = require('./service-account.json');
}

const auth = new google.auth.GoogleAuth({
  credentials,
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
        client_adresse: clientInfo.adresse,
        client_date_naissance: clientInfo.dateNaissance,
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

    // Search for events that overlap with the appointment time
    // We need a wider search to catch FREE events that may have started earlier
    const searchStartTime = new Date(startTime);
    searchStartTime.setHours(0, 0, 0, 0); // Start of the day
    const searchEndTime = new Date(startTime);
    searchEndTime.setHours(23, 59, 59, 999); // End of the day
    console.log('Searching for existing events on:', searchStartTime.toISOString(), 'to', searchEndTime.toISOString());

    const existingEvents = await calendar.events.list({
      auth: authClient,
      calendarId,
      timeMin: searchStartTime.toISOString(),
      timeMax: searchEndTime.toISOString(),
      singleEvents: true,
    });

    // Find the FREE event that contains the appointment start time
    const freeEvent = existingEvents.data.items?.find(event => {
      if (!(event.summary || '').toLowerCase().includes('free')) {
        return false;
      }
      const eventStart = new Date(event.start.dateTime || event.start.date);
      const eventEnd = new Date(event.end.dateTime || event.end.date);
      // Check if the appointment falls within this FREE event
      return eventStart <= startTime && eventEnd >= endTime;
    });

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
      description: `Client: ${clientInfo.name}\nEmail: ${clientInfo.email}\nPhone: ${clientInfo.phone}\nAdresse: ${clientInfo.adresse || 'N/A'}\nDate de naissance: ${clientInfo.dateNaissance || 'N/A'}\nService: ${clientInfo.service}`,
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

async function sendConfirmationEmail(clientInfo, paymentAmount) {
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

    const appointmentEndDate = clientInfo.timeSlotEnd ? new Date(clientInfo.timeSlotEnd) : null;
    const formattedEndTime = appointmentEndDate ? appointmentEndDate.toLocaleTimeString('fr-CA', {
      hour: '2-digit',
      minute: '2-digit'
    }) : null;

    // Format payment amount
    const formattedAmount = paymentAmount ? `${(paymentAmount / 100).toFixed(2)} $` : 'N/A';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h1 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">
            ✅ Paiement et Réservation Confirmés
          </h1>

          <p style="font-size: 16px; color: #555; margin-bottom: 20px;">
            Bonjour <strong>${clientInfo.name}</strong>,
          </p>

          <p style="font-size: 16px; color: #555; margin-bottom: 25px;">
            Votre paiement a été traité avec succès et votre réservation est confirmée ! Voici les détails :
          </p>

          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #28a745;">
            <h3 style="color: #28a745; margin-top: 0;">✓ Paiement Confirmé</h3>
            <p style="margin: 8px 0;"><strong>Montant payé :</strong> ${formattedAmount} CAD</p>
            <p style="margin: 8px 0; font-size: 14px; color: #666;">Votre transaction a été traitée de manière sécurisée.</p>
          </div>

          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #8B8672;">
            <h3 style="color: #8B8672; margin-top: 0;">Détails de la réservation</h3>
            <p style="margin: 8px 0;"><strong>Service :</strong> ${clientInfo.service}</p>
            <p style="margin: 8px 0;"><strong>Date :</strong> ${formattedDate}</p>
            <p style="margin: 8px 0;"><strong>Heure :</strong> ${formattedTime}${formattedEndTime ? ` - ${formattedEndTime}` : ''}</p>
            <p style="margin: 8px 0;"><strong>Client :</strong> ${clientInfo.name}</p>
            <p style="margin: 8px 0;"><strong>Téléphone :</strong> ${clientInfo.phone}</p>
            <p style="margin: 8px 0;"><strong>Email :</strong> ${clientInfo.email}</p>
          </div>

          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 25px 0;">
            <h4 style="color: #1976d2; margin-top: 0;">Informations importantes :</h4>
            <ul style="color: #555; margin: 10px 0;">
              <li>Veuillez arriver 5 minutes avant votre rendez-vous</li>
              <li>N'hésitez pas à nous contacter si vous avez des questions</li>
              <li>En cas d'annulation, merci de nous prévenir au moins 24h à l'avance</li>
              <li>Un reçu de paiement a été envoyé séparément par Stripe</li>
            </ul>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #777; font-size: 14px;">
              Cet événement a été automatiquement ajouté au calendrier.
            </p>
            <p style="color: #777; font-size: 14px;">
              Merci de votre confiance !
            </p>
          </div>

          <hr style="border: none; height: 1px; background-color: #eee; margin: 30px 0;">

          <div style="text-align: center; color: #999; font-size: 12px;">
            <p>Cet email de confirmation a été envoyé automatiquement.</p>
            <p>Si vous avez des questions, répondez à cet email ou contactez-nous au 819-918-6631.</p>
          </div>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: clientInfo.email,
      subject: `✅ Paiement et Réservation Confirmés - ${clientInfo.service} - ${formattedDate}`,
      html: emailHtml
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Customer confirmation email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    throw error;
  }
}

async function sendOwnerNotification(clientInfo, paymentAmount) {
  try {
    console.log('Sending booking notification to owner');

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

    const appointmentEndDate = clientInfo.timeSlotEnd ? new Date(clientInfo.timeSlotEnd) : null;
    const formattedEndTime = appointmentEndDate ? appointmentEndDate.toLocaleTimeString('fr-CA', {
      hour: '2-digit',
      minute: '2-digit'
    }) : null;

    const formattedAmount = paymentAmount ? `${(paymentAmount / 100).toFixed(2)} $` : 'N/A';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h1 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">
            🔔 Nouvelle Réservation
          </h1>

          <p style="font-size: 16px; color: #555; margin-bottom: 25px;">
            Un nouveau rendez-vous vient d'être réservé et payé :
          </p>

          <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #28a745;">
            <h3 style="color: #28a745; margin-top: 0;">Paiement Reçu</h3>
            <p style="margin: 8px 0;"><strong>Montant :</strong> ${formattedAmount} CAD</p>
          </div>

          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #8B8672;">
            <h3 style="color: #8B8672; margin-top: 0;">Détails du Rendez-vous</h3>
            <p style="margin: 8px 0;"><strong>Service :</strong> ${clientInfo.service}</p>
            <p style="margin: 8px 0;"><strong>Date :</strong> ${formattedDate}</p>
            <p style="margin: 8px 0;"><strong>Heure :</strong> ${formattedTime}${formattedEndTime ? ` - ${formattedEndTime}` : ''}</p>
          </div>

          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107;">
            <h3 style="color: #856404; margin-top: 0;">Informations Client</h3>
            <p style="margin: 8px 0;"><strong>Nom :</strong> ${clientInfo.name}</p>
            <p style="margin: 8px 0;"><strong>Email :</strong> <a href="mailto:${clientInfo.email}">${clientInfo.email}</a></p>
            <p style="margin: 8px 0;"><strong>Téléphone :</strong> ${clientInfo.phone}</p>
            ${clientInfo.adresse ? `<p style="margin: 8px 0;"><strong>Adresse :</strong> ${clientInfo.adresse}</p>` : ''}
            ${clientInfo.dateNaissance ? `<p style="margin: 8px 0;"><strong>Date de naissance :</strong> ${clientInfo.dateNaissance}</p>` : ''}
          </div>

          <div style="text-align: center; margin-top: 30px; padding: 15px; background-color: #e8f5e9; border-radius: 8px;">
            <p style="color: #2e7d32; font-size: 14px; margin: 0;">
              ✓ L'événement a été ajouté automatiquement à votre calendrier Google
            </p>
          </div>

          <hr style="border: none; height: 1px; background-color: #eee; margin: 30px 0;">

          <div style="text-align: center; color: #999; font-size: 12px;">
            <p>Cette notification a été générée automatiquement par le système de réservation.</p>
          </div>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'skyzbelow@gmail.com',
      subject: `🔔 Nouvelle Réservation - ${clientInfo.name} - ${formattedDate}`,
      html: emailHtml,
      replyTo: clientInfo.email
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Owner notification email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending owner notification email:', error);
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

app.post('/api/send-confirmation-email', async (req, res) => {
  try {
    const emailData = req.body;

    await sendConfirmationEmail({
      name: emailData.client_name,
      email: emailData.to_email,
      phone: emailData.phone,
      service: emailData.service,
      timeSlot: emailData.time_slot,
      timeSlotEnd: emailData.time_slot_end
    }, emailData.amount);

    res.json({ success: true });
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

app.get('/api/verify-payment/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    if (session.payment_status === 'paid') {
      const clientInfo = {
        name: session.metadata.client_name,
        email: session.metadata.client_email,
        phone: session.metadata.client_phone,
        adresse: session.metadata.client_adresse,
        dateNaissance: session.metadata.client_date_naissance,
        service: session.metadata.service,
        timeSlot: session.metadata.time_slot,
        timeSlotEnd: session.metadata.time_slot_end
      };

      const paymentAmount = session.amount_total;

      try {
        // Update calendar immediately after payment verification
        await updateCalendarSlot(clientInfo);
        console.log('✓ Calendar updated successfully for:', clientInfo.name);

        // Send confirmation emails
        try {
          // Send email to customer
          console.log('Attempting to send customer confirmation email...');
          await sendConfirmationEmail(clientInfo, paymentAmount);
          console.log('✓ Customer confirmation email sent successfully');

          // Send notification to owner
          console.log('Attempting to send owner notification email...');
          await sendOwnerNotification(clientInfo, paymentAmount);
          console.log('✓ Owner notification email sent successfully');
        } catch (emailError) {
          console.error('✗ Error sending emails:', emailError.message);
          console.error('Email error details:', {
            code: emailError.code,
            command: emailError.command,
            response: emailError.response
          });
          // Don't throw - calendar update succeeded and payment is complete
        }

      } catch (bookingError) {
        console.error('✗ Error processing booking after payment:', bookingError);
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

/**
 * Smart time slot splitting algorithm
 * Breaks large FREE blocks into bookable slots while preventing awkward gaps
 *
 * @param {Array} freeSlots - Array of FREE calendar events
 * @returns {Array} - Array of optimally split time slots
 */
function splitFreeSlots(freeSlots) {
  const INTERVAL_MINUTES = 15; // Split into 15-minute intervals
  const MIN_SLOT_DURATION = 45; // Minimum bookable slot (45 minutes)

  const result = [];

  freeSlots.forEach(slot => {
    const start = new Date(slot.date);
    const end = new Date(slot.end);
    const totalMinutes = (end - start) / (1000 * 60);

    // If the slot is too small to book, skip it
    if (totalMinutes < MIN_SLOT_DURATION) {
      return;
    }

    // Round start time to next 15-minute interval if not already aligned
    const startMinutes = start.getMinutes();
    const startRemainder = startMinutes % INTERVAL_MINUTES;
    if (startRemainder !== 0) {
      start.setMinutes(startMinutes + (INTERVAL_MINUTES - startRemainder));
      start.setSeconds(0);
      start.setMilliseconds(0);
    }

    // Round end time to previous 15-minute interval if not already aligned
    const endMinutes = end.getMinutes();
    const endRemainder = endMinutes % INTERVAL_MINUTES;
    if (endRemainder !== 0) {
      end.setMinutes(endMinutes - endRemainder);
      end.setSeconds(0);
      end.setMilliseconds(0);
    }

    // Recalculate duration after rounding
    const adjustedMinutes = (end - start) / (1000 * 60);

    if (adjustedMinutes < MIN_SLOT_DURATION) {
      return; // Skip if rounding made it too small
    }

    // Generate slots at 15-minute intervals
    let currentTime = new Date(start);

    while (currentTime < end) {
      // Only add if there's at least MIN_SLOT_DURATION available from this point
      const remainingMinutes = (end - currentTime) / (1000 * 60);
      if (remainingMinutes >= MIN_SLOT_DURATION) {
        // Keep the full remaining time in 'end' for frontend validation
        result.push({
          date: currentTime.toISOString(),
          end: end.toISOString(),
          summary: `FREE`
        });
      }

      // Move to next 15-minute interval
      const nextTime = new Date(currentTime);
      nextTime.setMinutes(nextTime.getMinutes() + INTERVAL_MINUTES);
      currentTime = nextTime;
    }
  });

  return result;
}

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

    console.log('Free slots found (before splitting):', freeSlots.length);

    // Apply smart slot splitting
    const splitSlots = splitFreeSlots(freeSlots);
    console.log('Free slots after splitting:', splitSlots.length);

    if (splitSlots.length > 0) {
      console.log('Sample split slots:');
      splitSlots.slice(0, 5).forEach((slot, index) => {
        console.log(`${index + 1}. ${slot.date} - ${slot.end} (${slot.summary})`);
      });
    }

    res.json(splitSlots);
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

    // Apply smart slot splitting
    const splitSlots = splitFreeSlots(freeSlots);
    console.log('Free slots after splitting:', splitSlots.length);

    res.json(splitSlots);
  } catch (error) {
    console.error('Error fetching extended availability:', error);
    res.status(500).json({
      error: 'Failed to fetch calendar events',
      details: error.message
    });
  }
});

app.post('/api/test-email', async (req, res) => {
  try {
    console.log('Testing email configuration...');

    // Test email credentials
    await transporter.verify();
    console.log('✓ Email transporter verified successfully');

    // Send test email
    const testMailOptions = {
      from: process.env.EMAIL_USER,
      to: 'skyzbelow@gmail.com',
      subject: 'Test Email - Configuration Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #28a745;">✓ Email Configuration Test</h2>
          <p>This is a test email to verify that your email configuration is working correctly.</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString('fr-CA')}</p>
          <p style="color: #28a745;">If you received this email, your email configuration is working properly!</p>
        </div>
      `
    };

    const info = await transporter.sendMail(testMailOptions);
    console.log('✓ Test email sent successfully:', info.messageId);

    res.json({
      success: true,
      message: 'Email configuration is working! Test email sent successfully.',
      messageId: info.messageId
    });
  } catch (error) {
    console.error('✗ Email configuration test failed:', error);
    res.status(500).json({
      error: 'Email configuration test failed',
      details: error.message,
      code: error.code
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

// For local development only
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Available endpoints:`);
    console.log(`  GET /availability - Next month's availability`);
    console.log(`  GET /availability/:months - Custom months ahead`);
    console.log(`  POST /api/contact - Send contact form email`);
    console.log(`  POST /api/test-email - Test email configuration`);

    // Verify email configuration at startup
    console.log('\n=== Email Configuration ===');
    console.log(`Email User: ${process.env.EMAIL_USER}`);
    console.log(`Email Password: ${process.env.EMAIL_PASSWORD ? '***configured***' : '❌ NOT SET'}`);

    try {
      await transporter.verify();
      console.log('✓ Email transporter verified successfully - emails will be sent');
    } catch (error) {
      console.error('✗ Email verification failed - emails will NOT be sent!');
      console.error('Error:', error.message);
      console.error('\nTo fix this:');
      console.error('1. Ensure EMAIL_USER and EMAIL_PASSWORD are set in .env');
      console.error('2. Use a Gmail App Password (not your regular password)');
      console.error('3. Remove any spaces from the App Password');
      console.error('4. Test with: curl -X POST http://localhost:3000/api/test-email');
    }
    console.log('===========================\n');
  });
}

// Export for Vercel serverless
module.exports = app;
