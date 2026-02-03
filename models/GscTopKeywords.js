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

    // user_id: {
    //   type: DataTypes.BIGINT,
    //   allowNull: false,
    // },

    // brand_id: {
    //   type: DataTypes.BIGINT,
    //   allowNull: false,
    // },

    // start_date: {
    //   type: DataTypes.DATEONLY,
    //   allowNull: false,
    // },

    // end_date: {
    //   type: DataTypes.DATEONLY,
    //   allowNull: false,
    // },
   gsc_overall_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "gsc_overall_data",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    keyword: {
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

    percent: {
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
        fields: ["gsc_overall_id", "keyword"],
        name: "unique_gsc_keyword_period",
      },
    ],
  }
);

module.exports = GscTopKeywords;
