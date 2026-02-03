const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GaTopPages = sequelize.define(
  "GaTopPages",
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
    path: {
      type: DataTypes.TEXT,
      allowNull: false, // URL path
    },

    views: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "ga_top_pages",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
       fields: ["ga_overall_id", "path"],
        name: "unique_ga_top_pages_period",
      },
    ],
  }
);

module.exports = GaTopPages;
