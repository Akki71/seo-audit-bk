require('dotenv').config();
const express = require('express');
const { connectDB } = require('./config/database');
const userRoutes = require('./routes/userRoutes');

const app = express();
app.use(express.json());
connectDB();


//routees
app.use('/api', userRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
