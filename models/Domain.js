const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const domain = sequelize.define(
  "domain",
  {
    
    
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    link: {
      type: DataTypes.TEXT,
      allowNull: false,
        unique: true,
    },
    count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      
    },
  },
  {
    tableName: "domain",
    timestamps: true,
  }
);

module.exports = domain;
