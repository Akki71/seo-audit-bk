const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ChatHistory = sequelize.define(
  "ChatHistory",
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
    chat_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    // openai_req_id: {
    //   type: DataTypes.STRING,
    //   allowNull: true,
    // },
    // client_id: {
    //   type: DataTypes.UUID,
    //   allowNull: true,
    // },
    thread_id: {
      type: DataTypes.STRING,

      allowNull: true,
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "chathistory",
    timestamps: true,
    freezeTableName: true,
  }
);

ChatHistory.associate = (models) => {
  ChatHistory.belongsTo(models.User, {
    foreignKey: "user_id",
    as: "user",
  });
};

module.exports = ChatHistory;
