const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Topic = sequelize.define('Topic', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    context: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    visibility_score: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0.0,
    },
    rank: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
    },
    execution: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
}, {
    tableName: 'topics',
    timestamps: true,
});

// Associations will be defined after all models are loaded
Topic.associate = (models) => {
    Topic.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Topic.hasMany(models.Prompt, { foreignKey: 'topicId', as: 'prompts' });
};

module.exports = Topic;
