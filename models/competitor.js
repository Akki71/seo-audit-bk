const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
 
const Competitor = sequelize.define(
  "Competitor",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    competitor_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    competitor_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    keywords: {
      type: DataTypes.JSON, 
      allowNull: true,
      defaultValue: [],
    },
      user_id: {
      type: DataTypes.BIGINT, 
      allowNull: true,        
    },
domains: {
  type: DataTypes.JSON,
  allowNull: true
},
image_url:{
  type:DataTypes.STRING,
  allowNull:true
},
  },
  {
    tableName: "competitors",
    timestamps: false,
  }
);
 
// Competitor.associate = (models) => {
//   Competitor.belongsTo(models.User, {
//     foreignKey: "user_id",
//     as: "user",
//   });
// };
module.exports = Competitor;