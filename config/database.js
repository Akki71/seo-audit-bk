require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
  }
);


const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected successfully.');
      await sequelize.sync();   // ✅
// Sync models with database, alter tables if needed
    } catch (error) {
        console.error('Unable to connect to the database:', error);
        console.log('Continuing without database connection for development...');
        // process.exit(1); // Comment out to continue without DB
    }
};

module.exports = { sequelize, connectDB };

