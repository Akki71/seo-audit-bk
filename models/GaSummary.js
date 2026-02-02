const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
 
const GaSummary = sequelize.define(
  "GaSummary",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
 
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
 
    brand_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
 
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
 
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
 
    total_users: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
 
    sessions: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
 
    page_views: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
 
    bounce_rate: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
 
    avg_session_duration: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
  },
  {
    tableName: "ga_summary",
    timestamps: true,
    underscored: true,
 
 
  }
);
 
module.exports = GaSummary;