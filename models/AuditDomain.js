const { DataTypes } = require('sequelize');
const {sequelize} = require('../config/database');

const Domain = sequelize.define('domain', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  domain: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  ga_refresh_token:{
  type:DataTypes.STRING,
  allowNull:true
},
  gsc_refresh_token:{
  type:DataTypes.STRING,
  allowNull:true
},
  property_id:{
  type:DataTypes.STRING,
  allowNull:true
},
});

module.exports = Domain;
