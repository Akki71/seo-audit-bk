const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GaTopCountries = sequelize.define(
  "GaTopCountries",
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
    ga_overall_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "ga_overall_data",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    country: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    sessions: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "ga_top_countries",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
        fields: ["ga_overall_id", "country"],
        name: "unique_ga_country_period",
      },
    ],
  },
);

module.exports = GaTopCountries;
