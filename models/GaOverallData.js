const { DataTypes } = require("sequelize");
// const sequelize = require("../config/database");
const { sequelize } = require("../config/database");

const GaOverallData = sequelize.define(
  "GaOverallData",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    brand_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    user_id: {
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
  },
  {
    tableName: "ga_overall_data", 
    timestamps: true,
    underscored: true,
      indexes: [
      {
        unique: true,
        fields: ["brand_id", "start_date", "end_date"],
        name: "unique_ga_chunk",
      },
    ],
  }
);

module.exports = GaOverallData;
