const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Webpage = sequelize.define("webpage", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  domainId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  title: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  meta_description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  body_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  canonical: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  h1: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  h2: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  embedding: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
});

module.exports = Webpage;
