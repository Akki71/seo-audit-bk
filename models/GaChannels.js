const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GaChannels = sequelize.define(
  "GaChannels",
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
    session_default_channel_group: {
      type: DataTypes.STRING,
      allowNull: false, // Direct, Organic Search, Referral, etc.
    },

    total_users: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    sessions: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    average_session_duration: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
  },
  {
    tableName: "ga_channels",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
        fields: ["ga_overall_id", "channel"],
        name: "unique_ga_channel_period",
      },
    ],
  },
);

module.exports = GaChannels;
