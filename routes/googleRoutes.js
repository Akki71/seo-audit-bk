const express = require("express");
const { authenticateToken } = require("../middlewares/auth");

const {
  getGoogleTokens,

  getGAAccounts,
  getGa4Properties,
  getGAData,
  getGoogleBusinessProfileData,
  getSearchConsoleSites,
  getSearchConsoleGetSite,
  getGSCData,
  getTrendingKeywords,
  collectAndStoreGSCData,
  getGSCGaWebDataFromDB,
  getChatbotAnalyticsContext,
  // gemailtrigger,
  // gemailtriggervisibility,
  startGBPOAuth,
  handleGBPOAuthCallback,
  getGBPAccounts,
  selectGBPAccount,
  getGBPLocations,
  getGBPInsights,
  refreshGBPInsights,
  chatbotdata,
  getChatHistory,
  deleteChat,
  getOverallAnalyticsSummary,
  getSectionWiseSummary,
  getPageData,
  collectAndStoreGAData,
} = require("../controllers/googleController");

const router = express.Router();
// console.log({
//   startGBPOAuth,
//   getGBPAccounts,
//   selectGBPAccount,
//   getGBPLocations,
//   getGBPInsights,
//   refreshGBPInsights,
// });

router.post("/tokens", authenticateToken, getGoogleTokens);

router.get("/analytics/accounts", authenticateToken, getGAAccounts);
router.post("/analytics/getGa4Properties", authenticateToken, getGa4Properties);
router.get("/analytics/getGAData", authenticateToken, getGAData);

router.post("/analytics/store-ga", authenticateToken, collectAndStoreGAData);
// router.get("/analytics/get-ga-db", authenticateToken, getGADataFromDB);

router.get("/search-console/sites", authenticateToken, getSearchConsoleSites);
router.post("/search-console/site", authenticateToken, getSearchConsoleGetSite);
router.get("/search-console/getGSCData", authenticateToken, getGSCData);
router.get(
  "/search-console/getTrendingKeywords",
  authenticateToken,
  getTrendingKeywords,
);

router.post(
  "/search-console/store-gsc",
  authenticateToken,
  collectAndStoreGSCData,
);
router.get("/search-console/get-gsc-ga-web-db", authenticateToken, getGSCGaWebDataFromDB);

// router.get("/search-console/chatbot-analytics", authenticateToken, getChatbotAnalyticsContext);
// router.get("/search-console/gemailtrigger", authenticateToken, gemailtrigger);

// router.get(
//   "/gemailtrigger",
//   authenticateToken,
//   gemailtrigger
// );
// router.get(
//   "/gemailtriggervisibility",
//   authenticateToken,
//   gemailtriggervisibility
// );

// router.get(
//   "/google-business-profile/gbp",
//   authenticateToken,
//   getGoogleBusinessProfileData
// );
// OAuth
router.get("/gbp/connect", startGBPOAuth);
router.post("/gbp/callback", handleGBPOAuthCallback);

// Data flow
router.get("/gbp/accounts", authenticateToken, getGBPAccounts);
router.post("/gbp/select-account", authenticateToken, selectGBPAccount);
// router.get("/gbp/locations", authenticateToken, getGBPLocations);
router.get("/gbp/insights", authenticateToken, getGBPInsights);
router.get("/gbp/location", authenticateToken, getGBPLocations);
router.post("/gbp/insights/refresh", authenticateToken, refreshGBPInsights);

router.post(
  "/analytics/ai-summary",
  authenticateToken,
  getOverallAnalyticsSummary,
);
router.post(
  "/analytics/section-summary",
  authenticateToken,
  getSectionWiseSummary,
);
router.post("/chat/ai-chat-send", authenticateToken, chatbotdata);
router.get("/chat/history", authenticateToken, getChatHistory);
router.delete("/chat/deleteChat", authenticateToken, deleteChat);

router.get("/pages", authenticateToken, getPageData);

module.exports = router;
