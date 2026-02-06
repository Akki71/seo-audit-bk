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

    ga_overall_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: "ga_overall_data",
        key: "id",
      },
      onDelete: "CASCADE",
    },

    keys: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    sessions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    tableName: "ga_top_countries",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["ga_overall_id", "keys"],
        name: "unique_ga_country_period",
      },
    ],
  }
);

module.exports = GaTopCountries;
