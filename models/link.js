const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Links = sequelize.define(
  'links',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    response_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    prompt_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    link: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    redirect_link: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    // // PostgreSQL column: created_at
    // created_at: {
    //   type: DataTypes.DATE,
    //   allowNull: false,
    //   defaultValue: DataTypes.NOW,
    // },

    // // PostgreSQL column: updated_at
    // updated_at: {
    //   type: DataTypes.DATE,
    //   allowNull: false,
    //   defaultValue: DataTypes.NOW,
    // },
  },
  {
    tableName: 'links',

    // Tells Sequelize the timestamp field names
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

module.exports = Links;
