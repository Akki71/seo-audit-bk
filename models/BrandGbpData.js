const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const BrandGbpData = sequelize.define(
  "BrandGbpData",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    brand_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // OAuth
    gbp_refresh_token: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Accounts cache
    gbp_accounts: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    gbp_accounts_synced_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Selected account & location
    gbp_account_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    gbp_location_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Insights cache
    gbp_insights: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    gbp_insights_synced_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "brand_gbp_data",
    underscored: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = BrandGbpData;
