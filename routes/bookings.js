const express = require('express');
const router = require('express').Router();
const pool = require('../db/connection');
const { sendPushNotification } = require('../services/fcm');
const {
  normalizeTime,
  hoursBetween,
  totalPriceFromHours,
  listAvailableSlots,
  timeToMinutes,
  PRICE_PER_HOUR,
} = require('../services/bookingMath');

const bookingSelectBase = `
      b.id,
      b.place,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.total_hours,
      b.total_price,
      b.status,
      b.created_at,
      u.id AS user_id,
      u.name AS user_name,
      u.email AS user_email,
      s.id AS sport_id,
      s.name AS sport_name,
      s.price_per_hour AS price`;

// GET all bookings (with user name and sport name via JOIN)
router.get('/', async (req, res) => {
  try {
    const [bookings] = await pool.query(`
      SELECT ${bookingSelectBase}
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN sports s ON b.sport_id = s.id
      ORDER BY b.booking_date DESC, b.start_time DESC, b.created_at DESC
    `);
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET available start/end slots for a place, date, and duration (must be before /:id)
router.get('/availability', async (req, res) => {
  try {
    const { place, date, hours } = req.query;
    if (!place || !date) {
      return res.status(400).json({
        success: false,
        error: 'place and date query parameters are required',
      });
    }
    const durationHours = Math.min(12, Math.max(1, parseInt(hours, 10) || 1));

    const [booked] = await pool.query(
      `
      SELECT start_time, end_time
      FROM bookings
      WHERE place = ?
        AND booking_date = ?
        AND status IN ('pending', 'confirmed')
    `,
      [place.trim(), date]
    );

    const availableSlots = listAvailableSlots(booked, durationHours);
    res.json({
      success: true,
      pricePerHour: PRICE_PER_HOUR,
      booked,
      availableSlots,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET all bookings for a specific user
router.get('/user/:userId', async (req, res) => {
  try {
    const [bookings] = await pool.query(
      `
      SELECT
        b.id,
        b.place,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.total_hours,
        b.total_price,
        b.status,
        b.created_at,
        s.name AS sport_name,
        s.price_per_hour AS price
      FROM bookings b
      JOIN sports s ON b.sport_id = s.id
      WHERE b.user_id = ?
      ORDER BY b.booking_date DESC, b.start_time DESC
    `,
      [req.params.userId]
    );
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET a single booking by ID
router.get('/:id', async (req, res) => {
  try {
    const [bookings] = await pool.query(
      `
      SELECT ${bookingSelectBase}
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN sports s ON b.sport_id = s.id
      WHERE b.id = ?
    `,
      [req.params.id]
    );
    if (bookings.length === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    res.json({ success: true, data: bookings[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const nodemailer = require('nodemailer');
const https = require('https');

// ── WhatsApp via CallMeBot (free API) ─────────────────────────────────────────
function sendWhatsApp(phone, message) {
  return new Promise((resolve) => {
    const apiKey = process.env.CALLMEBOT_APIKEY;
    if (!apiKey || apiKey === 'your_callmebot_api_key_here') {
      console.warn('⚠️  WhatsApp not configured. Set CALLMEBOT_APIKEY in .env to enable.');
      return resolve(false);
    }

    const encodedMsg = encodeURIComponent(message);
    const encodedPhone = encodeURIComponent(phone);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodedPhone}&text=${encodedMsg}&apikey=${apiKey}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ WhatsApp sent to ${phone}`);
          resolve(true);
        } else {
          console.error(`❌ WhatsApp failed (HTTP ${res.statusCode}):`, data);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.error('❌ WhatsApp request error:', err.message);
      resolve(false);
    });
  });
}

// Returns true when a real SMTP password has been configured
function hasRealSmtpConfig() {
  return !!(
    process.env.EMAIL_HOST &&
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS &&
    process.env.EMAIL_PASS !== 'your_brevo_smtp_key_here' &&
    process.env.EMAIL_PASS !== 'your_gmail_app_password_here'
  );
}

// Setup Nodemailer transporter (Gmail / any SMTP, or Ethereal fallback for testing)
async function createTransporter() {
  if (hasRealSmtpConfig()) {
    console.log(`📧 Using SMTP (${process.env.EMAIL_HOST}) for real email delivery to ${process.env.ADMIN_EMAIL}...`);
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,        // TLS via STARTTLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } else {
    console.warn('⚠️  Email password not configured. Using Ethereal test account (preview link only).');
    console.warn('   → Open backend/.env and set EMAIL_PASS to your Gmail App Password.');
    const account = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass }
    });
  }
}

let transporter = null;
let isRealEmailConfigured = false;

createTransporter().then(t => {
  transporter = t;
  isRealEmailConfigured = hasRealSmtpConfig();
});

// POST create a new booking
router.post('/', async (req, res) => {
  const { name, email, place, sport_id, booking_date, start_time, end_time } = req.body;

  if (!name || !email || !place || !sport_id || !booking_date || !start_time || !end_time) {
    return res.status(400).json({
      success: false,
      error: 'All fields (name, email, place, sport, date, start_time, end_time) are required',
    });
  }

  const startNorm = normalizeTime(start_time);
  const endNorm = normalizeTime(end_time);
  if (!startNorm || !endNorm) {
    return res.status(400).json({ success: false, error: 'Invalid start_time or end_time' });
  }

  const totalHours = hoursBetween(startNorm, endNorm);
  if (totalHours === null) {
    return res.status(400).json({
      success: false,
      error: 'End time must be after start time on the same day',
    });
  }

  const sm = timeToMinutes(startNorm);
  const em = timeToMinutes(endNorm);
  if (sm === null || em === null || (em - sm) % 60 !== 0) {
    return res.status(400).json({
      success: false,
      error: 'Start and end times must align to full-hour boundaries',
    });
  }

  const total_price = totalPriceFromHours(totalHours);
  if (total_price === null) {
    return res.status(400).json({ success: false, error: 'Could not compute price for this duration' });
  }

  try {
    // 1. Verify the sport exists
    const [sports] = await pool.query('SELECT name FROM sports WHERE id = ?', [sport_id]);
    if (sports.length === 0) {
      return res.status(404).json({ success: false, error: 'Sport not found' });
    }
    const sportName = sports[0].name;

    // 2. Block overlapping bookings (same place + date)
    const [conflicts] = await pool.query(
      `
      SELECT id FROM bookings
      WHERE place = ?
        AND booking_date = ?
        AND status IN ('pending', 'confirmed')
        AND start_time < ?
        AND end_time > ?
    `,
      [place.trim(), booking_date, endNorm, startNorm]
    );
    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'This time slot is already booked for that place. Choose another time.',
      });
    }

    if (!Number.isInteger(totalHours) || totalHours < 1 || totalHours > 12) {
      return res.status(400).json({
        success: false,
        error: 'Booking duration must be a whole number of hours between 1 and 12',
      });
    }

    const [bookedForDay] = await pool.query(
      `
      SELECT start_time, end_time FROM bookings
      WHERE place = ? AND booking_date = ? AND status IN ('pending', 'confirmed')
    `,
      [place.trim(), booking_date]
    );

    const allowedForDuration = listAvailableSlots(bookedForDay, totalHours);
    const slotOk = allowedForDuration.some((s) => s.start === startNorm && s.end === endNorm && !s.booked);
    if (!slotOk) {
      return res.status(400).json({
        success: false,
        error: 'Selected time is not available. Refresh available slots and try again.',
      });
    }

    // 3. Find or Create User
    let userId;
    const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
    } else {
      const [userResult] = await pool.query('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
      userId = userResult.insertId;
    }

    // 4. Insert Booking (starts as 'pending' — admin approves via dashboard)
    const [result] = await pool.query(
      `INSERT INTO bookings (user_id, sport_id, booking_date, start_time, end_time, total_hours, total_price, place, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, sport_id, booking_date, startNorm, endNorm, totalHours, total_price, place.trim()]
    );

    // 5. Send Emails: Admin notification + Customer confirmation
    const adminEmail = process.env.ADMIN_EMAIL || 'priyapandiyan62@gmail.com';
    const senderAddress = `"Sports Hub" <${process.env.EMAIL_USER || 'noreply@sportsbooking.com'}>`;

    // --- Admin Notification Email ---
    const adminMailOptions = {
      from: senderAddress,
      to: adminEmail,
      subject: `🏅 New Booking: ${sportName} by ${name}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:#4f46e5;padding:24px;text-align:center;">
            <h1 style="color:white;margin:0;font-size:22px;">🏅 New Sports Booking!</h1>
            <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px;">A new booking has been confirmed</p>
          </div>
          <div style="padding:28px 32px;background:#fff;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;width:40%;">Customer Name</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-weight:bold;">${name}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">Customer Email</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${email}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">Sport</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${sportName}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">Location</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${place}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">Booking Date</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${booking_date}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:#6b7280;">Time</td><td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">${start_time} to ${end_time}</td></tr>
              <tr><td style="padding:10px 0;color:#6b7280;">Total Price</td><td style="padding:10px 0;font-weight:bold;color:#16a34a;font-size:18px;">Rs.${total_price}</td></tr>
            </table>
          </div>
          <div style="background:#f9fafb;padding:16px 32px;text-align:center;color:#9ca3af;font-size:12px;">
            Automated admin notification from Sports Hub.
          </div>
        </div>
      `
    };

    // --- Customer Confirmation Email ---
    const customerMailOptions = {
      from: senderAddress,
      to: email,
      subject: `Booking Confirmed – ${sportName} on ${booking_date}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 24px;text-align:center;">
            <div style="width:64px;height:64px;background:rgba(255,255,255,0.2);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:32px;">✅</div>
            <h1 style="color:white;margin:0;font-size:26px;font-weight:800;">Booking Confirmed!</h1>
            <p style="color:#c7d2fe;margin:10px 0 0;font-size:16px;">Hi <strong style="color:white;">${name}</strong>, your slot is locked in!</p>
          </div>
          <div style="padding:32px;background:#fff;">
            <p style="color:#374151;font-size:15px;margin:0 0 24px;">
              Great news! Your <strong>${sportName}</strong> booking has been confirmed. Here's a summary of your reservation:
            </p>
            <div style="background:#f8fafc;border-radius:10px;padding:20px;border:1px solid #e2e8f0;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;width:42%;">👤 Booked By</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:700;color:#1e293b;">${name}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;">🏅 Sport</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1e293b;">${sportName}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;">📍 Location</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1e293b;">${place}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;">📅 Date</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1e293b;">${booking_date}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;">🕐 Time Slot</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1e293b;">${start_time} – ${end_time}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#64748b;font-size:14px;">💰 Total Amount</td>
                  <td style="padding:10px 0;font-weight:800;color:#16a34a;font-size:20px;">Rs.${total_price}</td>
                </tr>
              </table>
            </div>
            <p style="color:#6b7280;font-size:13px;margin:24px 0 0;text-align:center;">
              If you have any questions, please contact us. See you on the court/field!
            </p>
          </div>
          <div style="background:#f9fafb;padding:16px 32px;text-align:center;color:#9ca3af;font-size:12px;">
            © Sports Hub · Automated booking confirmation
          </div>
        </div>
      `
    };

    let previewUrl = null;
    if (transporter) {
      try {
        // Send admin notification
        await transporter.sendMail(adminMailOptions);
        // Send customer confirmation
        const customerInfo = await transporter.sendMail(customerMailOptions);

        if (isRealEmailConfigured) {
          console.log(`✅ Real emails sent via Gmail — admin: ${adminEmail}, customer: ${email}`);
        } else {
          previewUrl = nodemailer.getTestMessageUrl(customerInfo);
          console.log(`📧 Ethereal preview for customer email (${name}):`, previewUrl);
        }
      } catch (emailErr) {
        console.error('❌ Error sending email:', emailErr.message);
      }
    }

    // 5. Send WhatsApp notification
    const waPhone = process.env.WHATSAPP_PHONE || '+917358872329';
    const waMessage =
      `🏅 *New Sports Booking Confirmed!*\n` +
      `──────────────────\n` +
      `👤 *Name:* ${name}\n` +
      `📧 *Email:* ${email}\n` +
      `🏆 *Sport:* ${sportName}\n` +
      `📍 *Location:* ${place}\n` +
      `📅 *Date:* ${booking_date}\n` +
      `🕐 *Time:* ${start_time} – ${end_time}\n` +
      `💰 *Total:* Rs.${total_price}\n` +
      `──────────────────\n` +
      `Booking ID: #${result.insertId}`;

    await sendWhatsApp(waPhone, waMessage);

    // 6. Send FCM Push Notification
    try {
      const [tokenRows] = await pool.query(
        'SELECT token FROM fcm_tokens ORDER BY updated_at DESC LIMIT 1'
      );
      const fcmToken = tokenRows.length > 0 ? tokenRows[0].token : null;

      await sendPushNotification({
        token: fcmToken,
        title: `🏅 New Booking: ${sportName}`,
        body:  `${name} booked ${sportName} at ${place} on ${booking_date}`,
        data: {
          bookingId:    String(result.insertId),
          name,
          email,
          sport:        sportName,
          place,
          booking_date,
          start_time,
          end_time,
          total_price:  String(total_price),
        },
      });
    } catch (pushErr) {
      console.error('⚠️  Push notification error (non-fatal):', pushErr.message);
    }

    res.status(201).json({ 
      success: true, 
      message: 'Booking created', 
      bookingId: result.insertId,
      emailPreviewUrl: previewUrl 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT update a booking by ID
router.put('/:id', async (req, res) => {
  const { sport_id, booking_date } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE bookings SET sport_id = ?, booking_date = ? WHERE id = ?',
      [sport_id, booking_date, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    res.json({ success: true, message: 'Booking updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE a booking by ID
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM bookings WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    res.json({ success: true, message: 'Booking deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
