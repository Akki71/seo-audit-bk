const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Prompt = sequelize.define('Prompt', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    visibility: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
    },
    execution: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
    },
    topicId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'topics',
            key: 'id'
        }
    },
    status: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    tableName: 'prompts',
    timestamps: true,
});

// Associations will be defined after all models are loaded
Prompt.associate = (models) => {
    Prompt.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Prompt.belongsTo(models.Topic, { foreignKey: 'topicId', as: 'topic' });
};

module.exports = Prompt;
