const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GscSummary = sequelize.define(
  "GscSummary",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },

    // 🔑 CHUNK ID (FOREIGN KEY)
    gsc_overall_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "gsc_overall_data",
        key: "id",
      },
      onDelete: "CASCADE",
    },

    summary_name: {
      type: DataTypes.STRING, // web | news | discover
      allowNull: false,
    },

    clicks: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    impressions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    ctr: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    position: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
  },
  {
    tableName: "gsc_summary",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
        fields: ["gsc_overall_id", "summary_name"],
        name: "unique_gsc_summary_per_chunk",
      },
    ],
  }
);

module.exports = GscSummary;
