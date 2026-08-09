require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const { connectRabbitMQ } = require('./config/rabbitmq');
const { register, httpRequestDuration, httpRequestTotal } = require('./config/prometheus');
const { initializeSocket } = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../../frontend')));

// Prometheus metrics middleware
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        httpRequestDuration.labels(req.method, req.route?.path || req.path, res.statusCode).observe(duration);
        httpRequestTotal.labels(req.method, req.route?.path || req.path, res.statusCode).inc();
    });

    next();
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/diet', require('./routes/dietRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/alerts', require('./routes/alertRoutes'));
app.use('/api/coach', require('./routes/coachRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/workouts', require('./routes/workoutRoutes'));

// Socket.IO authentication middleware
const jwt = require('jsonwebtoken');
io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        console.log('Socket connected without auth token');
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        console.log(`Socket authenticated for user: ${socket.userId}`);
        next();
    } catch (err) {
        console.error('Socket auth error:', err.message);
        next();
    }
});

// Initialize Socket.io
initializeSocket(io);

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

app.get('/auth', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/auth.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dashboard.html'));
});

app.get('/profile-setup', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/profile-setup.html'));
});

app.get('/workouts', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/workouts.html'));
});

app.get('/diet', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/diet.html'));
});

app.get('/coach', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/coach.html'));
});

app.get('/coach/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/coach-dashboard.html'));
});

app.get('/coach/alerts', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/coach-alerts.html'));
});

app.get('/coach/members', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/coach-members.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Initialize connections and start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Connect to Redis
        await connectRedis();

        // Connect to RabbitMQ
        await connectRabbitMQ();

        // Start server
        server.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════╗
║   🏋️  GYM WORKOUT TRACKER API STARTED  🏋️    ║
╚═══════════════════════════════════════════════╝
      
  🌐 Server: http://localhost:${PORT}
  📊 Metrics: http://localhost:${PORT}/metrics
  💚 Health: http://localhost:${PORT}/health
  
  Environment: ${process.env.NODE_ENV || 'development'}
      `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};



startServer();

module.exports = app;
