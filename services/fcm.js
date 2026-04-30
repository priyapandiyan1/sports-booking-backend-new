const admin = require('firebase-admin');

let initialized = false;

function isConfigured() {
  return !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY &&
    process.env.FIREBASE_PRIVATE_KEY !== 'your_firebase_private_key_here'
  );
}

function initFirebase() {
  if (initialized) return true;
  if (!isConfigured()) {
    console.warn('⚠️  Firebase not configured — push notifications disabled.');
    console.warn('   → Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY to .env');
    return false;
  }
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    });
    initialized = true;
    console.log('🔥 Firebase Admin initialized — push notifications enabled');
    return true;
  } catch (err) {
    console.error('❌ Firebase init error:', err.message);
    return false;
  }
}

// Call once at startup
initFirebase();

/**
 * Send a push notification to a single FCM token.
 * @param {string} token   - FCM registration token saved by the browser
 * @param {string} title   - Notification title
 * @param {string} body    - Notification body
 * @param {object} data    - Optional key/value payload (all values must be strings)
 */
async function sendPushNotification({ token, title, body, data = {} }) {
  if (!isConfigured()) return false;
  if (!token) {
    console.warn('⚠️  No FCM token saved yet. Open the admin dashboard to register your device.');
    return false;
  }

  try {
    const message = {
      token,
      notification: { title, body },
      // Normalise all data values to strings (FCM requirement)
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          title,
          body,
          icon:               '/favicon.svg',
          badge:              '/favicon.svg',
          tag:                'sports-booking',
          requireInteraction: true,
          vibrate:            [200, 100, 200],
        },
        fcm_options: { link: '/admin' },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Push notification sent — message ID: ${response}`);
    return true;
  } catch (err) {
    console.error('❌ Push notification failed:', err.message);
    if (
      err.code === 'messaging/invalid-registration-token' ||
      err.code === 'messaging/registration-token-not-registered'
    ) {
      console.warn('   → FCM token is stale. Admin should reload the dashboard to refresh it.');
    }
    return false;
  }
}

module.exports = { sendPushNotification, isConfigured };
