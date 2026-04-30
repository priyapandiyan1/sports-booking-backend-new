const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// GET all sports
router.get('/', async (req, res) => {
  try {
    const [sports] = await pool.query('SELECT id, name AS sport_name, price_per_hour AS price FROM sports ORDER BY name ASC');
    res.json({ success: true, data: sports });
  } catch (error) {
    console.error('Fetch Sports Error:', error);
    res.status(500).json({ success: false, error: error.message || 'A database error occurred. Ensure MySQL is running on your machine!' });
  }
});

// GET single sport by ID
router.get('/:id', async (req, res) => {
  try {
    const [sports] = await pool.query('SELECT id, name AS sport_name, price_per_hour AS price FROM sports WHERE id = ?', [req.params.id]);
    if (sports.length === 0) {
      return res.status(404).json({ success: false, error: 'Sport not found' });
    }
    res.json({ success: true, data: sports[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message || 'A database error occurred. Ensure MySQL is running on your machine!' });
  }
});

// POST create a new sport
router.post('/', async (req, res) => {
  const { sport_name, price } = req.body;
  if (!sport_name || price === undefined) {
    return res.status(400).json({ success: false, error: 'sport_name and price are required' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO sports (name, price_per_hour) VALUES (?, ?)',
      [sport_name, price]
    );
    res.status(201).json({ success: true, message: 'Sport created', sportId: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT update a sport by ID
router.put('/:id', async (req, res) => {
  const { sport_name, price } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE sports SET name = ?, price_per_hour = ? WHERE id = ?',
      [sport_name, price, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Sport not found' });
    }
    res.json({ success: true, message: 'Sport updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE a sport by ID
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM sports WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Sport not found' });
    }
    res.json({ success: true, message: 'Sport deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
