const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const { connectDB } = require('./config/database');
const User = require('./models/User');



const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const auditRoutes = require('./routes/userRoutes');
const googleRoutes = require("./routes/googleRoutes");

const app = express();

connectDB();

app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

//routees
app.use('/api', auditRoutes);


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/google',googleRoutes );

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

module.exports = app;
