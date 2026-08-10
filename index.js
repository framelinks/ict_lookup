require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('./docs/openapi.json');
const path = require('path');
const authRoutes = require('./src/routes/auth');
const ticketRoutes = require('./src/routes/tickets');
const bookingRoutes = require('./src/routes/bookings');
const itemRoutes = require('./src/routes/items');
const faqRoutes = require('./src/routes/faqs');
const announcementRoutes = require('./src/routes/announcements');
const notificationRoutes = require('./src/routes/notifications');
const adminRoutes = require('./src/routes/admin');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/docs/erd', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'erd.html')); // change to your HTML filename
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler for unmatched API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Central error handler (catches anything thrown/passed to next())
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 3000;

// Only start listening when run directly (not when required by tests)
if (require.main === module) {
  app.listen(PORT, () => console.log(`Church ICT Platform running on port ${PORT}`));
}

module.exports = app;
