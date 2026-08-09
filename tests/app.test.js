process.env.JWT_SECRET = 'test_secret_key';
process.env.NODE_ENV = 'test';

jest.mock('../src/config/database', () => {
  const { createMockPool } = require('./mockPool');
  return createMockPool();
});

const request = require('supertest');
const app = require('../index');

describe('Auth', () => {
  it('registers a new user', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'David Developer', email: 'david@church.org', password: 'securePass123'
    });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('email', 'david@church.org');
    expect(res.body).toHaveProperty('role', 'User');
    expect(res.body).not.toHaveProperty('password');
  });

  it('rejects registration with missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'incomplete@church.org' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects duplicate email registration', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Dup', email: 'dup@church.org', password: 'securePass123'
    });
    const res = await request(app).post('/api/auth/register').send({
      name: 'Dup2', email: 'dup@church.org', password: 'securePass123'
    });
    expect(res.statusCode).toBe(409);
  });

  it('logs in with correct credentials and rejects wrong password', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Login Test', email: 'login@church.org', password: 'correctPass123'
    });
    const good = await request(app).post('/api/auth/login').send({
      email: 'login@church.org', password: 'correctPass123'
    });
    expect(good.statusCode).toBe(200);
    expect(good.body).toHaveProperty('token');

    const bad = await request(app).post('/api/auth/login').send({
      email: 'login@church.org', password: 'wrongPassword'
    });
    expect(bad.statusCode).toBe(401);
  });
});

describe('Protected routes', () => {
  it('rejects ticket creation without a token', async () => {
    const res = await request(app).post('/api/tickets').send({ category: 'Audio', description: 'Mic not working' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', 'Bearer not-a-real-token')
      .send({ category: 'Audio', description: 'Mic not working' });
    expect(res.statusCode).toBe(403);
  });
});

describe('Tickets workflow', () => {
  let userToken;

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Ticket User', email: 'ticketuser@church.org', password: 'securePass123'
    });
    const login = await request(app).post('/api/auth/login').send({
      email: 'ticketuser@church.org', password: 'securePass123'
    });
    userToken = login.body.token;
  });

  it('creates a ticket defaulting to Pending status', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ category: 'Projector', description: 'Bulb blown in main hall' });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('Pending');
  });

  it('rejects an invalid status transition (Pending -> Resolved)', async () => {
    const create = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ category: 'Network', description: 'WiFi down in annex' });

    // A regular User is not allowed to change status at all (Staff/Admin only)
    const asUser = await request(app)
      .patch(`/api/tickets/${create.body.id}/status`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'Resolved' });
    expect(asUser.statusCode).toBe(403);
  });
});

describe('Bookings — double-booking prevention', () => {
  let userToken, itemId;

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Booking User', email: 'bookinguser@church.org', password: 'securePass123'
    });
    const login = await request(app).post('/api/auth/login').send({
      email: 'bookinguser@church.org', password: 'securePass123'
    });
    userToken = login.body.token;

    // Directly seed an item via the mocked pool since item creation is Admin-only
    const pool = require('../src/config/database');
    const item = await pool.query(
      'INSERT INTO items (name, type, description) VALUES ($1, $2, $3) RETURNING *',
      ['Test Projector', 'Equipment', null]
    );
    itemId = item.rows[0].id;
  });

  it('creates a booking successfully', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ item_id: itemId, start_time: '2026-09-01T09:00:00Z', end_time: '2026-09-01T11:00:00Z' });
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe('Pending');
  });

  it('rejects an overlapping booking for the same item', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ item_id: itemId, start_time: '2026-09-01T10:00:00Z', end_time: '2026-09-01T12:00:00Z' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already booked|pending approval/i);
  });

  it('allows a non-overlapping booking for the same item', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ item_id: itemId, start_time: '2026-09-01T13:00:00Z', end_time: '2026-09-01T14:00:00Z' });
    expect(res.statusCode).toBe(201);
  });

  it('rejects a booking where end_time is before start_time', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ item_id: itemId, start_time: '2026-09-02T12:00:00Z', end_time: '2026-09-02T09:00:00Z' });
    expect(res.statusCode).toBe(400);
  });
});

describe('FAQs (public)', () => {
  it('lists FAQs without authentication', async () => {
    const res = await request(app).get('/api/faqs');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('blocks non-admins from creating FAQs', async () => {
    const login = await request(app).post('/api/auth/login').send({
      email: 'ticketuser@church.org', password: 'securePass123'
    });
    const res = await request(app)
      .post('/api/faqs')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ question: 'Can I?', answer: 'No.' });
    expect(res.statusCode).toBe(403);
  });
});

describe('Health check', () => {
  it('responds on /health', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
