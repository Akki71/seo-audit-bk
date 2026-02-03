const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GscOverallData = sequelize.define(
  "GscOverallData",
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
  },
  {
    tableName: "gsc_overall_data",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
        fields: ["brand_id", "start_date", "end_date"],
        name: "unique_gsc_chunk",
      },
    ],
  }
);

module.exports = GscOverallData;
