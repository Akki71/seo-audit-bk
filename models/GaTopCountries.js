const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GscTopKeywords = sequelize.define(
  "GscTopKeywords",
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },

    gsc_overall_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "gsc_overall_data",
        key: "id",
      },
      onDelete: "CASCADE",
    },

    keys: {
      type: DataTypes.TEXT,
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
    tableName: "gsc_top_keywords",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
        fields: ["gsc_overall_id", "keys"],
        name: "unique_gsc_keyword_period",
      },
    ],
  },
);

module.exports = GscTopKeywords;
