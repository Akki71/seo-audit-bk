const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GaDevices = sequelize.define(
  "GaDevices",
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
    device_category: {
      type: DataTypes.STRING,
      allowNull: false, // desktop | mobile | tablet
    },

    sessions: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "ga_devices",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
        fields: ["ga_overall_id", "device_category"],
        name: "unique_ga_device_period",
      },
    ],
  }
);

module.exports = GaDevices;
