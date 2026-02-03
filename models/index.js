const Brand = require("./Brand");
// const CompetitorSuggestions = require("./CompetitorSuggestions");
const User = require("./User");
const BasicSetting = require("./BasicSetting");
// const Competitor = require("./competitor");
const Topic = require("./Topic");
const Prompt = require("./Prompt");
const VisibilityLog = require("./VisibilityLog");
const ChatHistory = require("./ChatHistory");
const Domain = require("./domain");
const Links = require("./link");
const Platforms = require("./Platforms");
const BrandGbpData = require("./BrandGbpData");


// GA models
const GaOverallData = require("./GaOverallData");
const GaSummary = require("./GaSummary");
const GaChannels = require("./GaChannels");
const GaTopPages = require("./GaTopPages");
const GaTopCountries = require("./GaTopCountries");
const GaDevices = require("./GaDevices");
const GaConversions = require("./GaConversions");

// GSC models
const GscOverallData = require("./GscOverallData");
const GscSummary = require("./GscSummary");
const GscDevices = require("./GscDevices");
const GscTopPages = require("./GscTopPages");
const GscTopKeywords = require("./GscTopKeywords");
const GscTopCountries = require("./GscTopCountries");

Brand.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
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

// GA Overall → Summary
GaOverallData.hasOne(GaSummary, {
  foreignKey: "ga_overall_id",
  as: "summary",
  onDelete: "CASCADE",
});
GaSummary.belongsTo(GaOverallData, {
  foreignKey: "ga_overall_id",
});

// GA Overall → Channels
GaOverallData.hasMany(GaChannels, {
  foreignKey: "ga_overall_id",
  as: "channels",
  onDelete: "CASCADE",
});
GaChannels.belongsTo(GaOverallData, {
  foreignKey: "ga_overall_id",
});

// GA Overall → Top Pages
GaOverallData.hasMany(GaTopPages, {
  foreignKey: "ga_overall_id",
  as: "top_pages",
  onDelete: "CASCADE",
});
GaTopPages.belongsTo(GaOverallData, {
  foreignKey: "ga_overall_id",
});

// GA Overall → Countries
GaOverallData.hasMany(GaTopCountries, {
  foreignKey: "ga_overall_id",
  as: "top_countries",
  onDelete: "CASCADE",
});
GaTopCountries.belongsTo(GaOverallData, {
  foreignKey: "ga_overall_id",
});

// GA Overall → Devices
GaOverallData.hasMany(GaDevices, {
  foreignKey: "ga_overall_id",
  as: "devices",
  onDelete: "CASCADE",
});
GaDevices.belongsTo(GaOverallData, {
  foreignKey: "ga_overall_id",
});

// GA Overall → Conversions (if used)
GaOverallData.hasMany(GaConversions, {
  foreignKey: "ga_overall_id",
  as: "conversions",
  onDelete: "CASCADE",
});
GaConversions.belongsTo(GaOverallData, {
  foreignKey: "ga_overall_id",
});
// GSC Overall → Summary
GscOverallData.hasMany(GscSummary, {
  foreignKey: "gsc_overall_id",
  as: "summaries",
  onDelete: "CASCADE",
});
GscSummary.belongsTo(GscOverallData, {
  foreignKey: "gsc_overall_id",
});

// GSC Overall → Devices
GscOverallData.hasMany(GscDevices, {
  foreignKey: "gsc_overall_id",
  as: "devices",
  onDelete: "CASCADE",
});
GscDevices.belongsTo(GscOverallData, {
  foreignKey: "gsc_overall_id",
});

// GSC Overall → Top Pages
GscOverallData.hasMany(GscTopPages, {
  foreignKey: "gsc_overall_id",
  as: "top_pages",
  onDelete: "CASCADE",
});
GscTopPages.belongsTo(GscOverallData, {
  foreignKey: "gsc_overall_id",
});

// GSC Overall → Top Keywords
GscOverallData.hasMany(GscTopKeywords, {
  foreignKey: "gsc_overall_id",
  as: "top_keywords",
  onDelete: "CASCADE",
});
GscTopKeywords.belongsTo(GscOverallData, {
  foreignKey: "gsc_overall_id",
});

// GSC Overall → Countries
GscOverallData.hasMany(GscTopCountries, {
  foreignKey: "gsc_overall_id",
  as: "top_countries",
  onDelete: "CASCADE",
});
GscTopCountries.belongsTo(GscOverallData, {
  foreignKey: "gsc_overall_id",
});

module.exports = {
  GaOverallData,
  GaSummary,
  GaChannels,
  GaTopPages,
  GaTopCountries,
  GaDevices,
  GaConversions,

  // GSC
  GscOverallData,
  GscSummary,
  GscDevices,
  GscTopPages,
  GscTopKeywords,
  GscTopCountries,
  Brand,
  Prompt,
  VisibilityLog,
  BrandGbpData,
  User,
  Domain,
  Links,
  BasicSetting,
  ChatHistory,
  Platforms,
};
