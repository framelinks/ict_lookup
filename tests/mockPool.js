// In-memory fake of a subset of `pg`'s Pool, driven by pattern-matching
// on the SQL text. Lets us unit-test real route handlers without a live DB.
const bcrypt = require('bcryptjs');

function createMockPool() {
  const state = {
    users: [],
    items: [],
    bookings: [],
    tickets: [],
    faqs: [],
    announcements: [],
    notifications: [],
    nextId: { users: 1, items: 1, bookings: 1, tickets: 1, faqs: 1, announcements: 1, notifications: 1 }
  };

  async function query(text, params = []) {
    const sql = text.replace(/\s+/g, ' ').trim();

    // --- users ---
    if (/^INSERT INTO users/i.test(sql)) {
      const [name, email, password, role] = params;
      if (state.users.some(u => u.email === email)) {
        const err = new Error('duplicate key value violates unique constraint');
        err.code = '23505';
        throw err;
      }
      const user = { id: state.nextId.users++, name, email, password, role, created_at: new Date() };
      state.users.push(user);
      return { rows: [{ id: user.id, name, email, role, created_at: user.created_at }] };
    }
    if (/^SELECT \* FROM users WHERE email/i.test(sql)) {
      return { rows: state.users.filter(u => u.email === params[0]) };
    }
    if (/^SELECT id, name, email, role, created_at FROM users WHERE id/i.test(sql)) {
      return { rows: state.users.filter(u => u.id === Number(params[0])).map(({ password, ...rest }) => rest) };
    }
    if (/^SELECT id, name, email, role, created_at FROM users ORDER BY/i.test(sql)) {
      return { rows: state.users.map(({ password, ...rest }) => rest) };
    }
    if (/^SELECT id FROM users WHERE id = \$1 AND role IN/i.test(sql)) {
      return { rows: state.users.filter(u => u.id === Number(params[0]) && ['Staff', 'Admin'].includes(u.role)) };
    }

    // --- items ---
    if (/^INSERT INTO items/i.test(sql)) {
      const [name, type, description] = params;
      const item = { id: state.nextId.items++, name, type, description, status: 'Available', created_at: new Date() };
      state.items.push(item);
      return { rows: [item] };
    }
    if (/^SELECT \* FROM items$/i.test(sql) || /^SELECT \* FROM items WHERE type/i.test(sql)) {
      const rows = params.length ? state.items.filter(i => i.type === params[0]) : state.items;
      return { rows };
    }
    if (/^SELECT \* FROM items WHERE id = \$1$/i.test(sql)) {
      return { rows: state.items.filter(i => i.id === Number(params[0])) };
    }

    // --- bookings ---
    if (/^SELECT id FROM bookings\s+WHERE item_id = \$1 AND status IN/i.test(sql)) {
      const [itemId, start, end] = params;
      const overlap = state.bookings.filter(b =>
        b.item_id === Number(itemId) &&
        ['Pending', 'Approved'].includes(b.status) &&
        new Date(b.start_time) < new Date(end) && new Date(b.end_time) > new Date(start)
      );
      return { rows: overlap };
    }
    if (/^INSERT INTO bookings/i.test(sql)) {
      const [userId, itemId, start, end, purpose] = params;
      const booking = {
        id: state.nextId.bookings++, user_id: userId, item_id: itemId,
        start_time: start, end_time: end, purpose, status: 'Pending', created_at: new Date()
      };
      state.bookings.push(booking);
      return { rows: [booking] };
    }
    if (/^SELECT \* FROM bookings WHERE id = \$1$/i.test(sql)) {
      return { rows: state.bookings.filter(b => b.id === Number(params[0])) };
    }
    if (/^UPDATE bookings SET status = 'Approved'/i.test(sql)) {
      const booking = state.bookings.find(b => b.id === Number(params[0]));
      if (booking) booking.status = 'Approved';
      return { rows: booking ? [booking] : [] };
    }
    if (/^UPDATE bookings SET status = 'Rejected'/i.test(sql)) {
      const booking = state.bookings.find(b => b.id === Number(params[0]));
      if (booking) booking.status = 'Rejected';
      return { rows: booking ? [booking] : [] };
    }

    // --- tickets ---
    if (/^INSERT INTO tickets/i.test(sql)) {
      const [userId, category, description, priority] = params;
      const ticket = {
        id: state.nextId.tickets++, user_id: userId, assigned_to: null, category, description,
        priority, status: 'Pending', created_at: new Date(), updated_at: new Date()
      };
      state.tickets.push(ticket);
      return { rows: [ticket] };
    }
    if (/^SELECT status, user_id FROM tickets WHERE id/i.test(sql)) {
      const t = state.tickets.find(t => t.id === Number(params[0]));
      return { rows: t ? [{ status: t.status, user_id: t.user_id }] : [] };
    }
    if (/^UPDATE tickets SET status = \$1/i.test(sql)) {
      const t = state.tickets.find(t => t.id === Number(params[1]));
      if (t) t.status = params[0];
      return { rows: t ? [t] : [] };
    }

    // --- faqs ---
    if (/^SELECT \* FROM faqs ORDER BY/i.test(sql)) return { rows: state.faqs };
    if (/^INSERT INTO faqs/i.test(sql)) {
      const [question, answer] = params;
      const faq = { id: state.nextId.faqs++, question, answer, created_at: new Date() };
      state.faqs.push(faq);
      return { rows: [faq] };
    }

    // --- notifications (fire-and-forget in notify.js) ---
    if (/^INSERT INTO notifications/i.test(sql)) {
      const [userId, message] = params;
      const n = { id: state.nextId.notifications++, user_id: userId, message, is_read: false, created_at: new Date() };
      state.notifications.push(n);
      return { rows: [n] };
    }

    // Default: empty result rather than throwing, to keep unmatched
    // incidental queries (e.g. JOIN-heavy GETs not under test) harmless.
    return { rows: [] };
  }

  return { query, _state: state };
}

module.exports = { createMockPool };
