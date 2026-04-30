const nodemailer = require('nodemailer');

// ── Email Setup ─────────────────────────────────────────────────────────────
// Define a transporter using the configured credentials.
// If EMAIL_PASS is missing, it will use an Ethereal test inbox automatically.
const createTransporter = async () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (user && pass) {
    // If using real Gmail/SMTP credentials
    return nodemailer.createTransport({
      service: 'gmail', // Change if not Gmail
      auth: {
        user: user,
        pass: pass,
      },
    });
  } else {
    // Development mode: Fallback to Ethereal Testing
    console.warn('⚠️  Email password not configured. Using Ethereal test account.');
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }
};

/**
 * Sends a booking status update email to the user.
 * 
 * @param {string} userEmail User's email address
 * @param {string} userName User's full name
 * @param {string} sportName Name of the sport
 * @param {string} bookingDate Date string
 * @param {string} startTime Time string
 * @param {string} status 'confirmed' or 'rejected'
 */
const sendBookingStatusEmail = async (userEmail, userName, sportName, bookingDate, startTime, status) => {
  try {
    const transporter = await createTransporter();

    // Determine English phrasing and color based on status
    const statusText = status === 'confirmed' ? 'Approved' : 'Rejected';
    const statusColor = status === 'confirmed' ? '#10b981' : '#ef4444'; // Green vs Red

    const mailOptions = {
      from: `"Sports Hub Admin" <${process.env.EMAIL_USER || 'admin@sportshub.com'}>`, // sender address
      to: userEmail, // recipient
      subject: `Booking ${statusText} - Sports Hub`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
          <h2 style="color: #4f46e5; text-align: center;">Sports Hub</h2>
          <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;"/>
          
          <p>Hi <strong>${userName}</strong>,</p>
          <p>Your booking request for <strong>${sportName}</strong> has been 
          <span style="color: white; background-color: ${statusColor}; padding: 3px 8px; border-radius: 4px; font-weight: bold;">
            ${statusText.toUpperCase()}
          </span>.</p>

          <table style="width: 100%; margin-top: 15px; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; width: 30%;">Sport</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${sportName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Date</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${bookingDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Time</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${startTime}</td>
            </tr>
          </table>

          <p style="margin-top: 25px;">
            ${status === 'confirmed' ? 'We look forward to seeing you at the game!' : 'Please contact us if you need more information or wish to select another slot.'}
          </p>

          <p style="color: #888; font-size: 12px; margin-top: 40px; text-align: center;">
            This is an automated message from <a href="http://localhost:5173" style="color: #4f46e5;">Sports Hub</a>. Please do not reply.
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);

    // If using ethereal testing, this will provide the link to view the fake email
    if (nodemailer.getTestMessageUrl(info)) {
      console.log(`✉️  Ethereal Test Mail sent to ${userEmail}. View here: ${nodemailer.getTestMessageUrl(info)}`);
    } else {
      console.log(`✉️  Status email sent to ${userEmail} (${statusText})`);
    }

  } catch (error) {
    console.error('❌ Error sending booking status email:', error);
  }
};

module.exports = { sendBookingStatusEmail };
