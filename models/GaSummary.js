const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GaSummary = sequelize.define(
  "GaSummary",
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
    total_users: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    sessions: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    screen_page_views: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    bounce_rate: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    average_session_duration : {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
  },
  {
    tableName: "ga_summary",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["ga_overall_id"],
        name: "unique_ga_summary_period",
      },
    ],
  },
);

module.exports = GaSummary;
