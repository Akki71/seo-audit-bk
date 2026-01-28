const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Platforms = sequelize.define(
  "Platforms",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    platform: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    image_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "platforms",    // MUST MATCH actual table name in Postgres
    timestamps: true,          // enables created_at & updated_at
    createdAt: "created_at",   // map to your column name
    updatedAt: "updated_at",   // map to your column name
  }
);

module.exports = Platforms;
