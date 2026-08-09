/**
 * Inserts an in-app notification for a user.
 * Swallows errors so a notification failure never breaks the main request.
 */
async function notify(pool, userId, message) {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, message) VALUES ($1, $2)',
      [userId, message]
    );
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

module.exports = { notify };
