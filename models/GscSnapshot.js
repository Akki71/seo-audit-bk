const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GscSnapshot = sequelize.define(
  "GscSnapshot",
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

    gsc_data: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    brand_id: {
  type: DataTypes.INTEGER,
  allowNull: false,
}

  },
  {
    tableName: "gsc_snapshots",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
        fields: ["brand_id", "start_date", "end_date"],
        name: "unique_brand_date",
      },
    ],
  }
);

module.exports = GscSnapshot;
