// utils/logVisibility.js
// const VisibilityLog = require("../models/VisibilityLog");

// module.exports = async function logVisibility({
//   promptId,
//   platform,
//   brand,
//   mentions = 0,
//   serp_hits = 0,
//   visibility_score = 0
// }) {
//   return await VisibilityLog.create({
//     promptId,
//     platform,
//     brand,
//     mentions,
//     serp_hits,
//     visibility_score
//   });
// };

const VisibilityLog = require("../models/VisibilityLog");

module.exports = async function logVisibility({
  promptId,
  platform,
  response_id = null,
  mentions = 0,
  serp_hits = 0,
  visibility_score = 0,
  mentioned = false,
  other_mentioned_brands = [],
  brand = null
}) {
  // ✅ Only enforce response_id for non-Google platforms
  if (platform !== "Google" && !response_id) {
    throw new Error("response_id is required in logVisibility()");
  }

  const log = await VisibilityLog.create({
    promptId,
    platform,
    brand,
    mentions,
    serp_hits,
    visibility_score,
    response_id,
    mentioned,
    other_mentioned_brands
  });

  return log;
};

