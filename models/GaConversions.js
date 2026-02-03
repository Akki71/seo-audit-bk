const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GaConversions = sequelize.define(
  "GaConversions",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },

    ga_overall_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "ga_overall_data", // 🔴 MUST MATCH tableName
        key: "id",
      },
      onDelete: "CASCADE",
    },

    transactions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    revenue: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    conversion_rate: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    avg_order_value: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
  },
  {
    tableName: "ga_conversions",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["ga_overall_id"],
        name: "unique_ga_conversions",
      },
    ],
  }
);

module.exports = GaConversions;
