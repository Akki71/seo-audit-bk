// models/BasicSetting.js
const { DataTypes, Sequelize } = require("sequelize");
const { sequelize } = require("../config/database");

const BasicSetting = sequelize.define(
  "BasicSetting",
  {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      prompt_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      minimum_domain_authority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,  
      },
  },
  {
    tableName: "basic_setting",
    timestamps: true, 
  }
);

module.exports = BasicSetting;

