const { DataTypes, Sequelize } = require("sequelize");
const { sequelize } = require("../config/database");

const Brand = sequelize.define(
  "Brand",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    brand_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    domain: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    region: {
      type: DataTypes.JSONB,
        allowNull: true,
    },
    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true, 
    },
    keywords: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    localArea:{
      type: DataTypes.BOOLEAN,
          defaultValue: false, 
    },
    cities:{
      type: DataTypes.JSONB,
        allowNull: true,
    },
    image_url:{
      type:DataTypes.STRING,
      allowNull:true
    },
    domain_authority: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
     refresh_token:{
      type:DataTypes.STRING,
      allowNull:true
    },
     ga_refresh_token:{
      type:DataTypes.STRING,
      allowNull:true
    },
    gbp_refresh_token: {
  type: DataTypes.STRING,
  allowNull: true,
},
     gsc_refresh_token:{
      type:DataTypes.STRING,
      allowNull:true
    },
      property_id:{
      type:DataTypes.STRING,
      allowNull:true
    },
       site_url:{
      type:DataTypes.STRING,
      allowNull:true
    },
    country:{
      type:DataTypes.STRING,
      allowNull:true
    },
     country_code:{
      type:DataTypes.STRING,
      allowNull:true
    },
  },

  {
    tableName: "brands",
    timestamps: true, 
  }
);

module.exports = Brand;
