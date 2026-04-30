const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { sendBookingStatusEmail } = require('../services/email');

// Apply JWT auth + admin role check to ALL routes in this router
router.use(authenticateToken, requireAdmin);


/**
 * GET /admin/bookings
 * Query params (all optional):
 *   ?date=YYYY-MM-DD  — filter by booking date
 *   ?search=name      — LIKE search on user name
 *   ?status=pending|confirmed|rejected|all  — filter by status (default: all)
 */
router.get('/bookings', async (req, res) => {
  try {
    const { date, search, status } = req.query;

    let sql = `
      SELECT
        b.id,
        b.place,
        b.booking_date   AS booking_date,
        b.start_time     AS start_time,
        b.end_time       AS end_time,
        b.total_hours    AS total_hours,
        b.total_price    AS total_price,
        b.status,
        b.created_at     AS created_at,
        u.name           AS user_name,
        u.email          AS user_email,
        s.name           AS sport_name
      FROM bookings b
      INNER JOIN users u ON b.user_id = u.id
      INNER JOIN sports s ON b.sport_id = s.id
      WHERE 1=1
    `;
    const params = [];

    // Status filter (skip if 'all' or not provided)
    if (status && status !== 'all') {
      sql += ' AND b.status = ?';
      params.push(status);
    }

    if (date) {
      sql += ' AND b.booking_date = ?';
      params.push(date);
    }

    if (search && String(search).trim()) {
      sql += ' AND u.name LIKE ?';
      params.push(`%${String(search).trim()}%`);
    }

    sql += ' ORDER BY b.created_at DESC, b.booking_date DESC, b.start_time DESC';

    const [rows] = await pool.query(sql, params);

    const totalRevenue = rows
      .filter(r => r.status === 'confirmed')
      .reduce((sum, row) => {
        const p = Number(row.total_price);
        return sum + (Number.isFinite(p) ? p : 0);
      }, 0);

    res.json({
      success: true,
      data: rows,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      counts: {
        all:       rows.length,
        pending:   rows.filter(r => r.status === 'pending').length,
        confirmed: rows.filter(r => r.status === 'confirmed').length,
        rejected:  rows.filter(r => r.status === 'rejected').length,
      },
    });
  } catch (error) {
    console.error('Admin bookings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /admin/bookings/:id/status
 * Body: { status: 'pending' | 'confirmed' | 'rejected' }
 * Updates the booking status — used by Approve / Reject buttons.
 */
router.patch('/bookings/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowed = ['pending', 'confirmed', 'rejected'];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `status must be one of: ${allowed.join(', ')}`,
    });
  }

  try {
    const [result] = await pool.query(
      'UPDATE bookings SET status = ? WHERE id = ?',
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // After successful update, send the email notification
    if (status === 'confirmed' || status === 'rejected') {
      try {
        const [rows] = await pool.query(
          `SELECT b.booking_date, b.start_time, u.name as user_name, u.email as user_email, s.name as sport_name
           FROM bookings b
           JOIN users u ON b.user_id = u.id
           JOIN sports s ON b.sport_id = s.id
           WHERE b.id = ?`,
          [id]
        );
        if (rows.length > 0) {
          const bData = rows[0];
          // We intentionally don't await this so it doesn't block the API response
          sendBookingStatusEmail(
            bData.user_email,
            bData.user_name,
            bData.sport_name,
            bData.booking_date,
            bData.start_time,
            status
          );
        }
      } catch (err) {
        console.error('Failed to dispatch status email:', err);
      }
    }

    res.json({
      success: true,
      message: `Booking #${id} status updated to "${status}"`,
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
