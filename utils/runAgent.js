const Response = require("../models/Respose");
const { analyzeMentions } = require("./brandMetrics");
const { loadBrandConfig } = require("./loadBrandConfig");
const logVisibility = require("./logVisibility");

module.exports = async function runAgent({ promptId, platform, linksArray, getResponse, userId }) {
  const reply = await getResponse();

  // Save the raw response
  const responseRecord = await Response.create({
    promptId,
    response: reply,
    platform,
    link: JSON.stringify(linksArray),
  });
  const responseId = responseRecord.id;

  // Load brand configuration
  const { BRANDS, COMPETITOR_DOMAINS, COMPETITORS } = await loadBrandConfig(userId);

  // Analyze mentions
  const {
    totalMentions,
    userMentionedBrands,
    otherMentionedBrands,
    mentioned,
  } = await analyzeMentions(reply, userId);

  // Log visibility
  await logVisibility({
    promptId,
    platform,
    response_id: responseId,
    mentions: totalMentions,
    serp_hits: 0,
    visibility_score: mentioned ? 100 : 0,
    mentioned,
    other_mentioned_brands: otherMentionedBrands,
  });

  return reply;
};



