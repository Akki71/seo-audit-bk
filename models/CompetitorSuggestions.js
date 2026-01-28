const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const CompetitorSuggestions = sequelize.define(
  "CompetitorSuggestions",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    organization_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    keywords: {
      type: DataTypes.JSON,
      allowNull: false,
    },

    isSelected: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status:{
        type: DataTypes.STRING,
      allowNull: true,
    },
    image_url:{
      type:DataTypes.STRING,
      allowNull:true
    },
  },
  {
    tableName: "competitor_suggestions",
    timestamps: false,
  }
);

module.exports = CompetitorSuggestions;
