const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
 
const VisibilityLog = sequelize.define("visibility_logs", {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },
  promptId: { 
    type: DataTypes.INTEGER, 
    allowNull: false 
  },
  platform: { 
    type: DataTypes.STRING, 
    allowNull: false 
  }, 
  brand: { 
    type: DataTypes.STRING, 
    allowNull: true 
  }, 
  mentions: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0 
  }, 
  serp_hits: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0 
  }, 
  visibility_score: { 
    type: DataTypes.FLOAT, 
    defaultValue: 0 
  },
  run_date: { 
    type: DataTypes.DATEONLY, 
    defaultValue: DataTypes.NOW 
  },
  response_id: { 
    type: DataTypes.INTEGER, 
    allowNull: true 
  },
  mentioned: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  other_mentioned_brands: {
     type: DataTypes.JSONB, 
     defaultValue: []
   }
}, {
  indexes: [
    { fields: ["promptId", "platform", "brand", "run_date"] }
  ]
});
 
module.exports = VisibilityLog;