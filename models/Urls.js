const { DataTypes } = require('sequelize');
const {sequelize} = require('../config/database');

const Urls = sequelize.define('urls', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  domainId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  url:{
    type: DataTypes.TEXT,
    allowNull:true,
  },
},
 {
    timestamps: false,
    tableName: 'urls',
  });

module.exports = Urls;
