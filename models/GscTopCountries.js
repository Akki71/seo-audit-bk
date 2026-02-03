const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GscTopCountries = sequelize.define(
  "GscTopCountries",
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
    country: {
      type: DataTypes.STRING, // ISO code: ind, usa, deu
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
  },
  {
    tableName: "gsc_top_countries",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
          fields: ["gsc_overall_id", "country"],
        name: "unique_gsc_country_period",
      },
    ],
  }
);

module.exports = GscTopCountries;
