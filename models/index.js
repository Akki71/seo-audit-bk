const Brand = require("./Brand");
// const CompetitorSuggestions = require("./CompetitorSuggestions");
const User = require("./User");
const BasicSetting = require("./BasicSetting");
// const Competitor = require("./competitor");
const Topic = require("./Topic");
const Prompt = require("./Prompt");
const VisibilityLog = require("./VisibilityLog");
const ChatHistory  = require("./ChatHistory");
const Domain = require("./domain");
const Links = require("./link");  
const Platforms = require("./Platforms");
const BrandGbpData = require("./BrandGbpData");
Brand.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});
Domain.hasMany(Links, {
  foreignKey: "link",
  sourceKey: "link",
  constraints: false,
});
 
Links.belongsTo(Domain, {
  foreignKey: "link",
  targetKey: "link",
  constraints: false,
});
// Topic.hasMany(Prompt, { as: "prompts", foreignKey: "topicId" });
// Prompt.hasMany(Respose, { as: "responses", foreignKey: "promptId" });
// Respose.hasMany(VisibilityLog, { as: "visibility_logs", foreignKey: "response_id" });
// VisibilityLog.belongsTo(Respose, { as: "response", foreignKey: "response_id" });

Prompt.hasMany(Links, {
  foreignKey: "prompt_id",
  as: "links",
});
ChatHistory.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

User.hasMany(ChatHistory, {
  foreignKey: "user_id",
  as: "chatHistory",
});

Links.belongsTo(Prompt, {
  foreignKey: "prompt_id",
  as: "prompt",
});
module.exports = {Brand,Prompt,VisibilityLog,BrandGbpData, User,Domain,Links, BasicSetting ,ChatHistory , 
  Platforms
}
