const axios = require("axios");
const { Brand, BrandGbpData, Prompt, VisibilityLog } = require("../models");
const { google } = require("googleapis");
const GscSnapshot = require("../models/GscSnapshot");
const GaSnapshot = require("../models/GaSnapshot");

const GaSummary = require("../models/GaSummary");
const GaChannels = require("../models/GaChannels");
const GaTopPages = require("../models/GaTopPages");
const GaConversions = require("../models/GaConversions");
const GaTopCountries = require("../models/GaTopCountries");
const GaDevices = require("../models/GaDevices");

const GscDevices = require("../models/GscDevices");
const GscSummary = require("../models/GscSummary");
const GscTopPages = require("../models/GscTopPages");
const GscTopKeywords = require("../models/GscTopKeywords");
const GscTopCountries = require("../models/GscTopCountries");
const GscOverallData = require("../models/GscOverallData");
const GaOverallData = require("../models/GaOverallData");

const { refreshGoogleAccessToken } = require("../utils/googleAuth");
const { OAuth2Client } = require("google-auth-library");
const OpenAI = require("openai");
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const ChatHistory = require("../models/ChatHistory");
const Webpage = require("../models/Webpage");
const User = require("../models/User");
const { collectAndStoreGSCDataForBrand } = require("../services/gscService");
const { collectAndStoreGADataForBrand } = require("../services/gaService");

const nodemailer = require("nodemailer");
// const { sequelize } = require("../models");
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const { Op } = require("sequelize");
const crypto = require("crypto");
const GLOBAL_ASSISTANT_ID = process.env.GLOBAL_ASSISTANT_ID;
// console.log('GLOBAL_ASSISTANT_ID',GLOBAL_ASSISTANT_ID)
// console.log("🔍 GBP OAUTH ENV CHECK:", {
//   CLIENT_ID: process.env.CLIENT_ID
//     ? `${process.env.CLIENT_ID}`
//     : "❌ MISSING",

//   CLIENT_SECRET: process.env.CLIENT_SECRET
//     ? `${process.env.CLIENT_SECRET}`
//     : "❌ MISSING",

//   GBP_REDIRECT_URI: process.env.GBP_REDIRECT_URI || "❌ MISSING",
// });
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.GBP_REDIRECT_URI,
);
exports.getGoogleTokens = async (req, res) => {
  try {
    const { code, account } = req.body;
    if (!code || !account) {
      return res.status(400).json({
        success: false,
        error: "Authorization code and account are required",
      });
    }
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    const params = new URLSearchParams({
      code: code,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      // redirect_uri:
      //   account === "ga"
      //     ? process.env.GA_REDIRECT_URI
      //     : process.env.GSC_REDIRECT_URI,
      // grant_type: "authorization_code",
      redirect_uri:
        account === "ga"
          ? process.env.GA_REDIRECT_URI
          : account === "gsc"
            ? process.env.GSC_REDIRECT_URI
            : process.env.GBP_REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const { data } = await axios.post(
      "https://oauth2.googleapis.com/token",
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );

    if (account === "ga") {
      brand.ga_refresh_token = data.refresh_token;
    } else if (account === "gsc") {
      brand.gsc_refresh_token = data.refresh_token;
    } else if (account === "gbp") {
      brand.gbp_refresh_token = data.refresh_token;
    }

    await brand.save();

    return res.status(200).json({
      success: true,
      message: "Tokens successfully generated",
    });
  } catch (error) {
    console.log("Google token error", error);
    console.error("Google token error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch Google OAuth tokens",
      details: error.response?.data || null,
    });
  }
};
//2
exports.getGAAccounts = async (req, res) => {
  // console.log(GaSummary);

  try {
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }
    if (!brand.ga_refresh_token) {
      return res.status(404).json({
        success: false,
        message: "Brand not register for google analytics",
      });
    }

    const getToken = await refreshGoogleAccessToken(brand.ga_refresh_token);
    const access_token = getToken.access_token;

    const url = "https://analyticsadmin.googleapis.com/v1beta/accounts";

    const { data } = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("GA Accounts Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch GA accounts",
      details: error.response?.data || null,
    });
  }
};
//3
exports.getGa4Properties = async (req, res) => {
  try {
    const { displayName } = req.body;

    if (!displayName) {
      return res.status(400).json({
        success: false,
        message: "Missing  displayName",
      });
    }
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }
    if (!brand.ga_refresh_token) {
      return res.status(404).json({
        success: false,
        message: "Brand not register for google analytics",
      });
    }

    const getToken = await refreshGoogleAccessToken(brand.ga_refresh_token);
    const access_token = getToken.access_token;

    const url = `https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:${displayName}`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const properties = response.data.properties || [];

    if (properties.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No GA4 properties found",
      });
    }

    const propertyIds = properties.map((p) => p.name.split("/")[1]);
    const propertyId = propertyIds[0];

    brand.property_id = propertyId;
    await brand.save();

    return res.status(200).json({ success: true, message: "GA4 data saved" });
  } catch (error) {
    console.error("GA4 API Error:", error.response?.data || error);
    return res.status(500).json({
      success: false,
      message: "Error fetching GA4 properties",
      error: error.response?.data || error.message,
    });
  }
};
exports.getGAData = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });
    if (!brand) {
      return res.status(200).json({
        success: false,
        message: "Brand not found",
      });
    }
    if (!brand.ga_refresh_token) {
      return res.status(200).json({
        success: false,
        message: "Brand not register for google analytics",
      });
    }
    const getToken = await refreshGoogleAccessToken(brand.ga_refresh_token);
    const propertyId = brand.property_id;
    const access_token = getToken.access_token;

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

    const fetchApi = async ({
      metrics = [],
      dimensions = [{ name: "pagePath" }],
    }) => {
      const body = {
        dateRanges: [
          {
            startDate,
            endDate,
          },
        ],
        metrics,
        dimensions,
      };

      const { data } = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      return data;
    };

    const overviewReport = await fetchApi({
      metrics: [
        { name: "sessions" },
        { name: "screenPageViews" },
        { name: "averageSessionDuration" },
        { name: "bounceRate" },
        { name: "conversions" },
      ],
    });

    const deviceReport = await fetchApi({
      metrics: [{ name: "sessions" }],
      dimensions: [{ name: "deviceCategory" }],
    });

    const channelReport = await fetchApi({
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "averageSessionDuration" },
      ],
      dimensions: [{ name: "sessionDefaultChannelGrouping" }],
    });

    const referralReport = await fetchApi({
      metrics: [{ name: "sessions" }],
      dimensions: [{ name: "sourceMedium" }],
      // dimensionFilter: {
      //   filter: {
      //     fieldName: "sourceMedium",
      //     stringFilter: {
      //       matchType: "CONTAINS",
      //       value: "chat gpt",
      //       caseSensitive: false,
      //     },
      //   },
      // },
    });

    const overviewMetrics = overviewReport.rows?.[0]?.metricValues ?? [];
    const sessions = Number(overviewMetrics?.[0]?.value ?? 0);
    const pageviews = Number(overviewMetrics?.[1]?.value ?? 0);
    const avgSessionDuration =
      (Number(overviewMetrics?.[2]?.value ?? 0) / 60).toFixed(2) + "m";
    const bounceRate =
      Number(overviewMetrics?.[3]?.value ?? 0).toFixed(2) + "%";
    const conversionRate =
      Number(overviewMetrics?.[4]?.value ?? 0).toFixed(2) + "%";

    const deviceBreakdown =
      deviceReport.rows?.map((r) => ({
        device: r.dimensionValues?.[0]?.value ?? "Unknown",
        percentage: (
          (Number(r.metricValues?.[0]?.value ?? 0) / sessions) *
          100
        ).toFixed(2),
      })) ?? [];

    const trafficData =
      channelReport.rows?.map((r) => ({
        channel: r.dimensionValues?.[0]?.value ?? "Unknown",
        users: Number(r.metricValues?.[1]?.value ?? 0),
        sessions: Number(r.metricValues?.[0]?.value ?? 0),
        avgSession:
          (Number(r.metricValues?.[2]?.value ?? 0) / 60).toFixed(2) + "m",
      })) ?? [];

    const referralTraffic =
      referralReport.rows?.[0]?.metricValues?.[0]?.value ?? 0;

    const finalData = {
      sessions,
      pageviews,
      avgSessionDuration,
      bounceRate,
      conversionRate,
      transactions: 0,
      revenue: "$0",
      avgOrderValue: "$0.00",
      deviceBreakdown,
      trafficData,
      referralTraffic,
    };

    return res.status(200).json({
      success: true,
      data: finalData,
    });
  } catch (error) {
    console.error("GA API Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
//helper function to get GA properties
exports.refreshGoogleAccessToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res
        .status(400)
        .json({ success: false, error: "refresh_token is required" });
    }

    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      refresh_token,
      grant_type: "refresh_token",
      include_granted_scopes: "true",
    });

    const { data } = await axios.post(
      "https://oauth2.googleapis.com/token",
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(
      "Refresh token error:",
      error.response?.data || error.message,
    );
    return res.status(500).json({
      success: false,
      details: error.response?.data || null,
    });
  }
};
// exports.refreshGoogleAccessToken = async (refresh_token) => {
//   const params = new URLSearchParams({
//     client_id: process.env.CLIENT_ID,
//     client_secret: process.env.CLIENT_SECRET,
//     refresh_token,
//     grant_type: "refresh_token",
//   });

//   const { data } = await axios.post(
//     "https://oauth2.googleapis.com/token",
//     params.toString(),
//     { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
//   );

//   return data; // { access_token, expires_in }
// };

/// google search console functions can be added here
exports.getSearchConsoleSites = async (req, res) => {
  try {
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }
    if (!brand.gsc_refresh_token) {
      return res.status(404).json({
        success: false,
        message: "Brand not register for google search console",
      });
    }

    const getToken = await refreshGoogleAccessToken(brand.gsc_refresh_token);
    const access_token = getToken.access_token;

    const url = "https://www.googleapis.com/webmasters/v3/sites";

    const { data } = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GSC Sites Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch Search Console sites",
      details: error.response?.data || null,
    });
  }
};
exports.getSearchConsoleGetSite = async (req, res) => {
  try {
    const { site_url } = req.body;

    if (!site_url) {
      return res.status(200).json({
        success: false,
        error: " siteUrl are required",
      });
    }

    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });
    if (!brand) {
      return res.status(200).json({
        success: false,
        message: "Brand not found",
      });
    }
    if (!brand.gsc_refresh_token) {
      return res.status(200).json({
        success: false,
        message: "Brand not register for google Search Console",
      });
    }

    brand.site_url = site_url;
    await brand.save();
    return res.status(200).json({
      success: true,
      message: "Search Console data fetched successfully",
    });
  } catch (error) {
    console.error("GSC data Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch Search Console data",
      details: error.response?.data || null,
    });
  }
};
exports.getGSCData = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    if (!brand.gsc_refresh_token) {
      return res.status(404).json({
        success: false,
        message: "Brand not registered for Google Search Console",
      });
    }

    const getToken = await refreshGoogleAccessToken(brand.gsc_refresh_token);
    const access_token = getToken.access_token;

    const siteUrl = brand.site_url;

    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      siteUrl,
    )}/searchAnalytics/query`;

    // ---------- FIXED fetchApi ----------
    const fetchApi = async (body) => {
      const { data } = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
      return data;
    };
    const fetchSearchTypeData = async (searchType) => {
      try {
        const response = await fetchApi({
          startDate,
          endDate,
          dimensions: [],
          searchType,
        });

        const row = response.rows?.[0] || {};

        return {
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr ? (row.ctr * 100).toFixed(2) : "0.00",
          position: row.position || 0,
        };
      } catch (err) {
        console.warn(`⚠️ Failed to fetch summary for ${searchType}`, err);
        return { clicks: 0, impressions: 0, ctr: "0.00", position: 0 };
      }
    };
    // ---------- SEARCH CONSOLE QUERIES ----------
    const queryResponse = await fetchApi({
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 10,
      searchType: "web",
    });

    const countryResponse = await fetchApi({
      startDate,
      endDate,
      dimensions: ["country"],
      rowLimit: 10,
      searchType: "web",
    });

    const pageResponse = await fetchApi({
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 10,
      searchType: "web",
    });

    const deviceResponse = await fetchApi({
      startDate,
      endDate,
      dimensions: ["device"],
      rowLimit: 3,
      searchType: "web",
    });

    // ---------- SUMMARY ----------

    const [webSummary, discoverSummary, newsSummary] = await Promise.all([
      fetchSearchTypeData("web"),
      fetchSearchTypeData("discover"),
      fetchSearchTypeData("news"),
    ]);

    // ---------- TOP QUERIES ----------
    const topQueries =
      queryResponse.rows?.map((r) => {
        const clicks = r.clicks ?? 0;
        return {
          name: r.keys?.[0] ?? "Unknown",
          clicks,
          impressions: r.impressions ?? 0,
          percent:
            webSummary.clicks > 0
              ? ((clicks / webSummary.clicks) * 100).toFixed(1)
              : "0",
        };
      }) ?? [];

    const topCountries =
      countryResponse.rows?.map((r) => ({
        country: r.keys?.[0] ?? "Unknown",
        impressions: r.impressions ?? 0,
        clicks: r.clicks ?? 0,
      })) ?? [];

    const topPages =
      pageResponse.rows?.map((r) => ({
        url: r.keys?.[0] ?? "Unknown",
        impressions: r.impressions ?? 0,
        clicks: r.clicks ?? 0,
        percent:
          webSummary.impressions > 0
            ? ((r.impressions / webSummary.impressions) * 100).toFixed(1)
            : "0",
      })) ?? [];

    const devices =
      deviceResponse.rows?.map((r) => ({
        device: r.keys?.[0] ?? "Unknown",
        impressions: r.impressions ?? 0,
        clicks: r.clicks ?? 0,
      })) ?? [];

    // ---------- FINAL RESPONSE ----------

    const finalData = {
      summary: {
        web: webSummary,
        discover: discoverSummary,
        news: newsSummary,
        totalQueries: topQueries.length,
        totalPages: topPages.length,
        startDate,
        endDate,
      },
      topQueries,
      topCountries,
      topPages,
      devices,
    };

    return res.status(200).json({
      success: true,
      message: "Search Console data fetched successfully",
      data: finalData,
    });
  } catch (error) {
    console.error("GSC Error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch Search Console data",
      details: error.response?.data || null,
    });
  }
};
exports.getTrendingKeywords = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const brand = await Brand.findOne({ where: { user_id: req.user.id } });

    if (!brand) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }
    if (!brand.gsc_refresh_token) {
      return res.status(404).json({
        success: false,
        message: "Brand not registered for Google Search Console",
      });
    }

    const getToken = await refreshGoogleAccessToken(brand.gsc_refresh_token);
    const access_token = getToken.access_token;

    const siteUrl = brand.site_url;

    if (!siteUrl) {
      return res.status(400).json({
        success: false,
        message: "No site_url saved for this brand",
      });
    }

    // Convert dates
    const currentStart = new Date(startDate);
    const currentEnd = new Date(endDate);

    const days = Math.ceil((currentEnd - currentStart) / (1000 * 60 * 60 * 24));

    const prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - days);

    const prevEnd = new Date(currentEnd);
    prevEnd.setDate(prevEnd.getDate() - days);

    const fetchApi = async (body) => {
      const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        siteUrl,
      )}/searchAnalytics/query`;

      const { data } = await axios.post(url, body, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      return data.rows ?? [];
    };

    // Fetch current period keywords
    const currentRows = await fetchApi({
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 10,
      searchType: "web",
    });

    // Fetch previous period keywords
    const prevRows = await fetchApi({
      startDate: prevStart.toISOString().split("T")[0],
      endDate: prevEnd.toISOString().split("T")[0],
      dimensions: ["query"],
      rowLimit: 10,
      searchType: "web",
    });

    // Convert to lookup
    const prevMap = {};
    prevRows.forEach((r) => {
      prevMap[r.keys[0]] = r;
    });

    const trending = [];
    const declining = [];

    currentRows.forEach((current) => {
      const keyword = current.keys[0];
      const prev = prevMap[keyword] || { clicks: 0, impressions: 0 };

      const clickDiff = (current.clicks || 0) - (prev.clicks || 0);
      const impDiff = (current.impressions || 0) - (prev.impressions || 0);

      const growthPercent =
        prev.clicks > 0
          ? ((clickDiff / prev.clicks) * 100).toFixed(1)
          : current.clicks > 0
            ? "100"
            : "0";

      const growthPercentImpression =
        prev.impressions > 0
          ? ((impDiff / prev.impressions) * 100).toFixed(1)
          : current.impressions > 0
            ? "100"
            : "0";

      const item = {
        keyword,
        currentClicks: current.clicks,
        previousClicks: prev.clicks,
        clickDiff,
        growthPercent,
        currentImpressions: current.impressions,
        previousImpressions: prev.impressions,
        impressionDiff: impDiff,
        growthPercentImpression,
      };

      if (clickDiff > 0) trending.push(item);
      else if (clickDiff < 0) declining.push(item);
    });

    trending.sort((a, b) => b.clickDiff - a.clickDiff);
    declining.sort((a, b) => a.clickDiff - b.clickDiff);

    return res.status(200).json({
      success: true,
      message: "Trending keywords fetched",
      data: {
        trendingKeywords: trending.slice(0, 20),
        // decliningKeywords: declining.slice(0, 20),
      },
    });
  } catch (error) {
    console.error("Trending Keywords Error:", error.response?.data || error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch trending keywords",
      details: error.response?.data || null,
    });
  }
};
exports.getUrls = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    if (!brand.gsc_refresh_token) {
      return res.status(404).json({
        success: false,
        message: "Brand not registered for Google Search Console",
      });
    }

    const getToken = await refreshGoogleAccessToken(brand.gsc_refresh_token);
    const access_token = getToken.access_token;

    const siteUrl = brand.site_url;

    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      siteUrl,
    )}/searchAnalytics/query`;

    // ---------- FIXED fetchApi ----------
    const fetchApi = async (body) => {
      const { data } = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
      return data;
    };

    // ---------- SEARCH CONSOLE QUERIES ----------
    const queryResponse = await fetchApi({
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 25000,
    });

    const finalData = queryResponse.rows?.map((r) => r.keys[0]);

    return res.status(200).json({
      success: true,
      message: "Search Console data fetched successfully",

      finalData,
    });
  } catch (error) {
    console.error("GSC Error:", error.response?.data || error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch Search Console data",
      details: error.response?.data || null,
    });
  }
};
//pages
exports.getPageData = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    if (!brand.gsc_refresh_token) {
      return res.status(404).json({
        success: false,
        message: "Brand not registered for Google Search Console",
      });
    }

    const getToken = await refreshGoogleAccessToken(brand.gsc_refresh_token);
    const access_token = getToken.access_token;

    const siteUrl = brand.site_url;

    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      siteUrl,
    )}/searchAnalytics/query`;

    const fetchApi = async (body) => {
      const { data } = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });
      return data;
    };

    // ---------- SEARCH CONSOLE QUERIES ----------
    const queryResponse = await fetchApi({
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 25000,
    });

    const urls = queryResponse.rows?.map((r) => r.keys[0]);

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "URLs array is required",
      });
    }

    const results = [];

    for (const url of urls) {
      try {
        const response = await axios.post(
          "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
          {
            inspectionUrl: url,
            siteUrl: brand.site_url,
          },
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          },
        );

        const result = response.data.inspectionResult;

        results.push({
          url,
          lastCrawlTime: result.indexStatusResult?.lastCrawlTime || null,
          //   coverageState: result.indexStatusResult?.coverageState || null,
          //   pageFetchState: result.indexStatusResult?.pageFetchState || null,
          //   robotsTxtState: result.indexStatusResult?.robotsTxtState || null,
          //   mobileFriendly: result.mobileUsabilityResult?.verdict || null
        });
      } catch (err) {
        results.push({
          url,
          error: err.response?.data?.error?.message || "Failed to check URL",
        });
      }
    }

    return res.status(200).json({
      success: true,
      pages: results,
      //   urls: urlData
    });
  } catch (error) {
    console.error("URL Inspection API Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
exports.getOverallAnalyticsSummary = async (req, res) => {
  try {
    const { gscData, startDate, endDate } = req.body;

    if (!gscData) {
      return res.status(400).json({
        success: false,
        message: "GSC data are required",
      });
    }

    const prompt = `
You are a senior SEO strategist and technical SEO expert.
 
Analyze the following Google Search Console data for the website between ${startDate} and ${endDate}.
 
Google Search Console Data:
${JSON.stringify(gscData, null, 2)}
 
Your task is to provide a VERY ACTIONABLE SEO improvement report.
 
Include the following sections clearly:
 
1. Overall Performance Diagnosis
- What the data clearly indicates about the website's current SEO health
- Whether the site is underperforming, average, or strong (and why)
 
2. Ranking & Visibility Problems (Specific)
- What the average position means in practical terms
- Which type of pages are hurting rankings (homepage, service pages, blogs, etc.)
- Why impressions are high but clicks are low (if applicable)
 
3. Keyword-Level Improvement Plan
- What types of keywords are missing (non-branded, service-based, local, long-tail)
- Exact examples of keyword categories the site should target
- Which existing queries should be expanded into full pages or blogs
 
4. Page-Level Improvements (Very Specific)
- What needs to be improved on top-performing pages (titles, meta descriptions, content depth, internal links)
- What needs to be fixed on low-performing pages
- Whether new landing pages are required (yes/no and why)
 
5. CTR Optimization Suggestions
- What changes should be made to meta titles & descriptions
- How to improve SERP appearance (numbers, power words, local intent, branding)
 
6. Content Strategy Recommendations
- What type of content is missing (blogs, service pages, location pages, case studies)
- Content ideas based on current data trends
- Whether blog or service content should be prioritized
 
7. Technical & UX SEO Improvements
- Likely technical SEO issues based on data patterns
- Mobile vs desktop considerations
- Internal linking, page speed, crawlability suggestions
 
8. Google Discover & News Opportunities
- Why the site is not appearing in Discover/News
- What exact content changes are required to qualify
 
9. 30-Day SEO Action Plan
- Week-by-week tasks
- What should be done immediately
- What will bring the fastest ranking improvement
 
Write in clear, simple business language.
Avoid generic advice.
Be specific, practical, and data-driven.
`;

    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert digital marketing analyst.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 900,
    });

    return res.status(200).json({
      success: true,
      summary: response.choices[0].message.content,
    });
  } catch (error) {
    console.error("AI Summary Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to generate analytics summary",
    });
  }
};

async function buildStrategyDataContext(user_id) {
  const [
    ga_summary,
    ga_top_pages,
    gsc_summary,
    gsc_top_pages,
    gsc_top_keywords,
    webpages,
  ] = await Promise.all([
    GaSummary.findAll({
      include: [{ model: GaOverallData, where: { user_id } }],
      limit: 1,
      order: [["created_at", "DESC"]],
    }),
    GaTopPages.findAll({
      limit: 10,
      order: [["screen_page_views", "DESC"]],
    }),
    GscSummary.findAll({
      include: [{ model: GscOverallData, where: { user_id } }],
      limit: 1,
      order: [["created_at", "DESC"]],
    }),
    GscTopPages.findAll({
      limit: 10,
      order: [["impressions", "DESC"]],
    }),
    GscTopKeywords.findAll({
      limit: 10,
      order: [["impressions", "DESC"]],
    }),
    Webpage.findAll({
      where: { user_id },
      attributes: ["url", "title", "meta_description", "canonical", "h1", "h2"],
      limit: 10,
    }),
  ]);

  return {
    ga_summary,
    ga_top_pages,
    gsc_summary,
    gsc_top_pages,
    gsc_top_keywords,
    webpages,
  };
}


function detectIntent(question) {
  const q = question.toLowerCase().trim();

  // STRATEGY / GUIDANCE (NO SQL)
  if (
    q.startsWith("how to") ||
    q.startsWith("how can") ||
    q.startsWith("how do") ||
    q.startsWith("how should") ||
    q.startsWith("what should") ||
    q.startsWith("what can") ||
    q.startsWith("what is the best way") ||
    q.startsWith("which step") ||
    q.startsWith("which steps") ||

    q.includes("improve my site") ||
    q.includes("improve my website") ||
    q.includes("improve my page") ||
    q.includes("improve content") ||
    q.includes("improve seo") ||
    q.includes("increase traffic") ||
    q.includes("increase impressions") ||
    q.includes("increase clicks") ||
    q.includes("boost seo") ||
    q.includes("optimize my site") ||
    q.includes("optimize content") ||

    q.includes("what to do first") ||
    q.includes("what should i do first") ||
    q.includes("next steps") ||
    q.includes("action plan") ||
    q.includes("steps to improve") ||
    q.includes("things to fix") ||
    q.includes("what is missing") ||
    q.includes("what am i missing") ||

    q.includes("why my site") ||
    q.includes("why my page") ||
    q.includes("why is my seo") ||
    q.includes("reason my traffic") ||
    q.includes("cause of low") ||

    q.includes("seo strategy") ||
    q.includes("content strategy") ||
    q.includes("marketing strategy") ||
    q.includes("growth strategy")
  ) {
    return {
      intent: "strategy_guidance",
      mode: "direct_answer", // 🚫 SQL
    };
  }

  // DEFAULT → SQL
  return {
    intent: "data_query",
    mode: "sql",
  };
}

exports.getSectionWiseSummary = async (req, res) => {
  try {
    const { gaData, gscData, startDate, endDate } = req.body;

    if (!gaData || !gscData) {
      return res.status(400).json({
        success: false,
        message: "GA and GSC data are required",
      });
    }

    const summary = {
      dateRange: { startDate, endDate },

      trafficSummary: {
        sessions: gaData.sessions,
        pageviews: gaData.pageviews,
        avgSessionDuration: gaData.avgSessionDuration,
        bounceRate: gaData.bounceRate,
      },

      seoSummary: {
        totalClicks: gscData.summary.web.clicks,
        totalImpressions: gscData.summary.web.impressions,
        ctr: gscData.summary.web.ctr + "%",
        avgPosition: gscData.summary.web.position,
      },

      deviceBreakdown: gaData.deviceBreakdown,

      topPages: gscData.topPages.slice(0, 5),

      topQueries: gscData.topQueries.slice(0, 5),

      countries: gscData.topCountries.slice(0, 5),

      insights: {
        strengths: [
          "Strong branded search traffic",
          "Homepage is top-performing page",
        ],
        improvements: [
          "Improve CTR on service pages",
          "Work on non-branded keyword rankings",
        ],
      },
    };

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Section Summary Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate section-wise summary",
    });
  }
};
const tableDescription =
`
table =  ga_overall_data
| Column       | Description         
 'id'         = Primary key for the GA report record  
 'user_id'    = User who owns this GA data            
 'brand_id'   = Brand/domain this GA data belongs to 
 'start_date' = Report start date                    
 'end_date'   = Report end date
 ------------ ----------------------------------------------- 

table =gsc_overall_data
| Column      | Description

 'id'         = Primary key for the GA report record 
 'user_id'    = User who owns this GA data           
 'brand_id'   = Brand/domain this GA data belongs to 
 'start_date' = Report start date                    
 'end_date'   = Report end date                 

 ------------ ----------------------------------------------- 

table = seo_summaries 
| Column      | Description                                     

 'id'         = Unique UUID for each SEO summary                
 'user_id'    = User who generated the summary                  
 'domain'     = Domain name for which summary was generated     
 'summary'    = JSON SEO summary (AI output, metrics, insights) 
 ------------------------------------------------ 
 
table = urls
| Column     | Description             

 'id'       = Primary key             
 'domainId' = Brand/domain identifier 
 'url'      = Full page URL           
 'user_id'  = User who owns this URL  

 ------------------------------------------------ 

table = users 
| Column           | Description                        

 'id'             = Primary key                        
 'assistant_id'   = AI assistant identifier (if any)   
 'username'       = Unique username                    
 'email'          = User email address                 
 'password'       = Hashed password                    
 'isVerified'     = Whether email is verified          
 'otp'            = One-time password for verification 
 'otpExpires'     = OTP expiry time                    
 'brand_register' = Flag indicating brand registration 

 ------------------------------------------------ 

TABLE =webpages
| Column             | Description                    

  'id'               =  Primary key                     
  'domainId'         =  Brand/domain identifier         
  'date'             =  Crawl date                      
  'url'              = Page URL                        
  'title'            = Page title                      
  'meta_description' = Meta description                
  'body_text'        = Extracted page content          
  'canonical'        = Canonical URL                   
  'h1'               = JSON array of H1 tags           
  'h2'               = JSON array of H2 tags                       
  'embedding'        = Vector embedding for AI search  
  'user_id'          = Owner user                      


 ------------------------------------------------ 

TABLE=brands 
| Column              | Description                      
 
 'id'                = Primary key                      
 'user_id'           = Owner user                       
 'brand_name'        = Brand name                       
 'domain'            = JSON list of domains             
 'region'            = Target regions                   
 'status'            = Active/inactive brand            
 'keywords'          = Target keywords                  
 'localArea'         = Whether brand targets local area 
 'cities'            = Target cities                    
 'image_url'         = Brand favicon/logo               
 'domain_authority'  = Domain authority data            
 'refresh_token'     = OAuth refresh token              
 'ga_refresh_token'  = GA refresh token                 
 'gbp_refresh_token' = Google Business Profile token    
 'gsc_refresh_token' = GSC refresh token                
 'property_id'       = GA4 property ID                  
 'site_url'          = Site URL                         
 'country'           = Country name                     
 'country_code'      = Country code                     


 ------------------------------------------------ 

table = ga_channels 
| Column                          | Description            

 'ga_overall_id'                 = Reference to GA report 
 'session_default_channel_group' = Channel name           
 'total_users'                   = Users from channel     
 'sessions'                      = Sessions from channel  
 ------------------------------------------------ 

TABLE =ga_conversions
| Column                     | Description           
 'ga_overall_id'            = Reference to GA report
 'transactions'             = Number of conversions 
 'total_revenue'            = Revenue generated     
 'session_conversion_rate'  = Conversion rate       
 'average_purchase_revenue' = Avg order value  
 --------------------------------------------- 
 
 table= ga_devices
 | Column            | Description               
 'ga_overall_id'   = Reference to GA report
 'device_category' = Desktop / Mobile / Tablet 
 'sessions'        = Sessions from device   
 --------------------------------------------- 

  table= ga_summary
 | Column            | Description               
 'ga_overall_id'            = Reference to GA report 
 'total_users'              = Total users          
 'sessions'                 = Total sessions       
 'screen_page_views'        = Page views           
 'bounce_rate'              = Bounce rate          
 'average_session_duration' = Avg session duration    
------------------------------------------ 

 table=ga_top_countries
 | Column     | Description        

 'ga_overall_id' = Reference to GA report 
 'keys'     	   = Country name       
 'sessions' 	   = Sessions           
 'ctr'      	   = Click-through rate 
 'position' 	   = Avg position       
------------------------------------------ 

  table=ga_top_pages
 | Column            | Description        
 'ga_overall_id'     = Reference to GA report 
 'page_path'     	   = Page path        
 'screen_page_views' = Views   
 
| --------------------------------------

   table=gsc_devices
 | Column        | Description        |
 'gsc_overall_id' = Reference to GSC report
 'keys'           = Device type        
 'clicks'         = Clicks             
 'impressions'    = Impressions        
 'ctr'            = Click-through rate 
 'position'       = Avg position   


 --------------------------------------------

table=gsc_summary

| Column           | Description             |
 'gsc_overall_id' = Reference to GSC report 
 'summary_name'   = Metric group name       
 'clicks'         = Total clicks      
 'impressions'    = Total impressions 
 'ctr'            = CTR              
 'position'       = Avg position    
 ------------------------------- 

table=gsc_top_countries
| Column        | Description |
 'gsc_overall_id' = Reference to GSC report     
 'keys'           = Country     
 'clicks'         = Clicks      
 'impressions'    = Impressions 
 'ctr'            = CTR          
 'position'       = Avg position 

---------------------------------
table=gsc_top_keywords
| Column        | Description  |

 'gsc_overall_id' = Reference to GSC report    
 'keys'           = Search query 
 'clicks'         = Clicks       
 'impressions'    = Impressions  
 'ctr'            = CTR          
'position'        = Avg position 

---------------------------------
table=gsc_top_pages
| Column        | Description  |

 'gsc_overall_id' = Reference to GSC report    
 'keys'           = Search pages 
 'clicks'         = Clicks       
 'impressions'    = Impressions  
 'ctr'            = CTR          
'position'        = Avg position 
`
async function generateSQL({
  schema,
  question,
  user_id,
  previousSQL = null,
  error = null,
  openaiClient,
}) {
  let repairContext = "";

  if (previousSQL && error) {
    console.log("🛠 STEP 5: SQL REPAIR INITIATED");
    console.log("❌ DATABASE ERROR:", error);

    repairContext = `
PREVIOUS SQL (BROKEN):
${previousSQL}

DATABASE ERROR:
${error}

FIX RULES:
- Fix ONLY the reported error
- DO NOT change SELECT column order
- DO NOT remove GA pre-aggregation
- KEEP keys as FIRST column
`;
  }

  console.log("🧠 STEP 3: GENERATING SQL FROM INTENT");

  const sqlPrompt = `
// You are an expert PostgreSQL analytics query generator.

// ABSOLUTE RULES:
// - Output ONLY raw SQL
// - ONE SELECT only
// - NO markdown, NO comments
// - NEVER invent tables or columns
// - Use ONLY tables from the SCHEMA
// - Use double-quoted identifiers
// -
// INTENT RULES:
// (Top pages, keywords, joins, GA pre-aggregation rules apply)

// SCHEMA:
// ${schema}
table description 
${tableDescription}
// QUESTION:
// ${question}
You are an expert PostgreSQL analytics query generator.

Your task is to convert a user SEO question into ONE advanced PostgreSQL SELECT query.

You must think like a data analyst, not a simple selector.

You MUST use analytical SQL:
- GROUP BY
- ORDER BY
- aggregates
- comparisons
- ratios
- date ranges (when applicable)

You are NOT allowed to write simple SELECT queries.
use id datatype in numeric not in string
━━━━━━━━━━━━━━━━━━━━━━
INTENT (CRITICAL)

INTENT:
{{ $items("Intent")[0].json.intent }}

━━━━━━━━━━━━━━━━━━━━━━
DATA MODEL (MANDATORY – READ CAREFULLY)

GOOGLE ANALYTICS (GA):
- public."ga_top_pages"
  - page_path (RELATIVE URL, e.g. /about-us/)
  - screen_page_views
  - ga_overall_id → public."ga_overall_data"."id"

- public."ga_overall_data"
  - id
  - user_id (TENANT FILTER — REQUIRED)

GOOGLE SEARCH CONSOLE (GSC):
- public."gsc_top_pages"
  - keys (FULL URL)
  - impressions
  - gsc_overall_id → public."gsc_overall_data"."id"

- public."gsc_overall_data"
  - id
  - user_id (TENANT FILTER — REQUIRED)

  

━━━━━━━━━━━━━━━━━━━━━━
WEBPAGES (CONTENT QUALITY SOURCE – VERY IMPORTANT)

You have a fully crawled content table.

Table: public."webpages"

Columns available for analytics:
- id (page id)
- domainId (domain grouping)
- date (crawl date)
- url (FULL URL)
- title (page title)
- meta_description (meta description)
- body_text (full extracted content)
- canonical (canonical URL, TEXT)
- h1 (jsonb array of H1 tags)
- h2 (jsonb array of H2 tags)
- createdAt (crawl timestamp)
- updatedAt (crawl timestamp)
- embedding (IGNORE — DO NOT USE)
- user_id (TENANT FILTER — REQUIRED)

This table stores the REAL PAGE CONTENT of the website.
GA_ANALYSIS INTENT (MANDATORY)

If the user question mentions:
- "GA"
- "Google Analytics"
- "traffic"
- "sessions"
- "users"
- "page views"
- "engagement"

THEN:

- You MUST use Google Analytics tables
- You MUST NOT use public."webpages" as the primary source
- Allowed GA tables:
  - public."ga_overall_data"
  - public."ga_summary"
  - public."ga_channels"
  - public."ga_devices"
  - public."ga_top_pages"
  - public."ga_top_countries"

- public."webpages" MAY ONLY be used as a LEFT JOIN
  for URL or title enrichment

━━━━━━━━━━━━━━━━━━━━━━
CONTENT_QUALITY INTENT (MANDATORY RULES)

You MUST use public."webpages" as the PRIMARY source.

Do NOT use embeddings.
Do NOT invent content signals.
Use ONLY numeric and structural signals.

CONTENT_QUALITY INTENT OVERRIDE RULE

If intent = ga_analysis
OR question explicitly references GA,
THEN:
- IGNORE content quality rules
- DO NOT analyze h1, h2, title, meta_description, canonical
- DO NOT compute content length metrics

━━━━━━━━━━━━━━━━━━━━━━
COLUMN DATA TYPE & EMPTY VALUE RULES (CRITICAL)

- canonical is TEXT
  - Missing canonical is represented as EMPTY STRING ''
  - NEVER use canonical IS NULL
  - ALWAYS use:
    public."webpages"."canonical" = ''

- h1 and h2 are jsonb ARRAYS
  - Empty heading list is represented as:
    '[]'::jsonb
  - NEVER use: h1 = [] or h2 = []
  - ALWAYS use:
    h1 = '[]'::jsonb
    h2 = '[]'::jsonb

━━━━━━━━━━━━━━━━━━━━━━
REQUIRED CONDITIONS (DO NOT MODIFY)

To detect pages with missing H2 tags, use ONLY:

SELECT *
FROM public."webpages"
WHERE public."webpages"."h2" = '[]'::jsonb;

━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━
TEXT DATA TYPE NULLABILITY RULE (ABSOLUTE)

For ANY column with data type TEXT or VARCHAR:

- Missing or invalid values MAY be stored as:
  - NULL
  - empty string ''

- When checking for missing / empty TEXT values,
  you MUST ALWAYS check BOTH conditions.

MANDATORY pattern for TEXT columns:
(
  column_name IS NULL
  OR column_name = ''
)

FORBIDDEN patterns:
- column_name IS NULL   (alone)
- column_name = ''      (alone)

This rule applies to (but is not limited to):
- title
- meta_description
- canonical
- url
- domainId
---------------------------------
CONTENT QUALITY ANALYSIS RULES

You MUST support the following analyses:

1️⃣ MISSING STRUCTURE (H1 / H2)

- Missing H1:
  h1 = '[]'::jsonb

- Missing H2:
  h2 = '[]'::jsonb

- Missing BOTH H1 and H2:
  h1 = '[]'::jsonb
  AND h2 = '[]'::jsonb

━━━━━━━━━━━━━━━━━━━━━━
2️⃣ DUPLICATE CONTENT SIGNALS

Detect duplicates using ONLY these columns:
- title
- meta_description
- canonical

Allowed duplicate detection patterns:
- GROUP BY title HAVING COUNT(*) > 1
- GROUP BY meta_description HAVING COUNT(*) > 1
- GROUP BY canonical HAVING COUNT(*) > 1

Do NOT use body_text similarity.
Do NOT use embeddings.

━━━━━━━━━━━━━━━━━━━━━━
3️⃣ COUNT / MAX / MIN ANALYSIS

You MAY compute the following:

- COUNT(*)                       → number of affected pages
- MAX(LENGTH(body_text))         → deepest content
- MIN(LENGTH(body_text))         → thinnest content
- MAX(jsonb_array_length(h1))    → strongest structure
- MIN(jsonb_array_length(h2))    → weakest structure

Use aggregate functions ONLY with GROUP BY when required.

━━━━━━━━━━━━━━━━━━━━━━
TENANT FILTER (ABSOLUTE)

Every query using public."webpages" MUST include:

WHERE public."webpages"."user_id" = ${user_id}

Do NOT apply user_id filter to any other table.

━━━━━━━━━━━━━━━━━━━━━━
OUTPUT RULES

- SELECT queries only
- ONE query per response
- No explanations
- No comments
- No markdown


━━━━━━━━━━━━━━━━━━━━━━
JOIN ORDER RULE (CRITICAL – NEVER BREAK)

You MUST respect SQL scope rules.
AND (
column_name IS NULL
OR column_name = ''
)
A table:
- MUST appear in FROM or JOIN
- BEFORE it is referenced in ON / WHERE / SELECT

Specifically:
- public."gsc_overall_data" MUST be joined
  BEFORE public."gsc_top_pages" references it
- public."ga_overall_data" MUST be joined
  BEFORE filtering by user_id

Queries that reference a table
before it appears in FROM/JOIN
ARE INVALID and MUST NOT be generated.

━━━━━━━━━━━━━━━━━━━━━━
URL JOIN NORMALIZATION (CRITICAL)

GA uses RELATIVE paths  
GSC uses FULL URLs  

Direct equality (=) between them IS FORBIDDEN.

Allowed GA ↔ GSC join patterns ONLY (BOOLEAN REQUIRED):

- gsc_top_pages.keys ILIKE '%' || ga_top_pages.page_path
OR
- (split_part(gsc_top_pages.keys, '/', 3) || ga_top_pages.page_path)
    = gsc_top_pages.keys

━━━━━━━━━━━━━━━━━━━━━━
BOOLEAN JOIN CONDITION RULE (CRITICAL)

Every condition used with AND / OR MUST evaluate to BOOLEAN.

The following are FORBIDDEN after AND / OR:
- raw text expressions
- string concatenations
- function calls without comparison

Examples of INVALID SQL (DO NOT GENERATE):
- AND split_part(col, '/', 3) || other_col
- AND col || '/path'
- AND concat(col1, col2)

Allowed patterns ONLY:
- column = column
- column LIKE '%value%'
- column ILIKE '%' || other_column
- function(column) = value
- function(column) ILIKE '%value%'

If a string expression is used, it MUST be compared using:
= , <> , LIKE , or ILIKE

━━━━━━━━━━━━━━━━━━━━━━
INTENT-SPECIFIC RULES

IF intent = page_performance:
- You MUST use:
  public."ga_top_pages"
  public."ga_overall_data"
  public."gsc_overall_data"
  public."gsc_top_pages"

- You MUST JOIN IN THIS EXACT ORDER:
  1. ga_top_pages
  2. ga_overall_data
  3. gsc_overall_data
  4. gsc_top_pages

- You MUST calculate:

  performance_ratio =
    SUM(public."ga_top_pages"."screen_page_views")::float
    / NULLIF(SUM(public."gsc_top_pages"."impressions"), 0)

- You MUST ORDER BY performance_ratio ASC
- You MUST LIMIT weak-performing pages

IF intent = ctr_issue:
- You MUST use ONLY:
  public."gsc_overall_data"
  public."gsc_top_pages"

- You MUST JOIN:
  gsc_top_pages → gsc_overall_data

- You MUST calculate:
  ctr =
    SUM(clicks)::float / NULLIF(SUM(impressions), 0)

- You MUST filter impressions > 100
- You MUST ORDER BY ctr ASC

IF intent = content_quality:
- You MUST use public."webpages"
- You MAY LEFT JOIN GA or GSC
- URL matching MUST be used
- Do NOT use embeddings
- Use numeric engagement signals only

━━━━━━━━━━━━━━━━━━━━━━
MULTI-TENANT RULE (ABSOLUTE)

User filtering MUST appear in WHERE
and MUST use ONLY ONE of these:

- public."ga_overall_data"."user_id" = {{ $json.user_id }}
- public."gsc_overall_data"."user_id" = {{ $json.user_id }}
- public."webpages"."user_id" = {{ $json.user_id }}

DO NOT filter user_id on any other table.

━━━━━━━━━━━━━━━━━━━━━━
SQL STRUCTURE RULE (NON-NEGOTIABLE)



AGGREGATION SAFETY RULE (ABSOLUTE)
 
- NEVER include metric columns in GROUP BY
- Metric columns include (but are not limited to):
  - screen_page_views
  - impressions
  - clicks
  - sessions
  - users
  - ctr
  - position
- ALL metric columns MUST be aggregated using:
  SUM(), AVG(), MIN(), or MAX()
- GROUP BY is allowed ONLY on:
  - page identifiers (url, page_path, keys, title)
  - dimensions (country, device, keyword, date)
The query MUST follow this exact order:

1. SELECT
2. FROM
3. JOIN   (ALL JOINs here)
4. WHERE  (TENANT FILTER HERE)
5. GROUP BY
6. HAVING
7. ORDER BY
8. LIMIT

The WHERE clause MUST appear
IMMEDIATELY AFTER JOINs.
WEAK SEO SIGNAL RULES (CRITICAL)
 
If the question mentions:
- "lack strong SEO signals"
- "needs improvement"
- "better title"
- "better meta description"
- "content improvement"
- "SEO ready"
 
THEN:
 
You MUST detect WEAK signals, not only missing ones.
 
Allowed WEAK SIGNAL definitions:
 
1️⃣ Weak title:
(
  title IS NULL
  OR title = ''
  OR LENGTH(title) < 30
)
 
2️⃣ Weak meta description:
(
  meta_description IS NULL
  OR meta_description = ''
  OR LENGTH(meta_description) < 70
)
 
3️⃣ Weak heading structure:
- jsonb_array_length(h1) = 0
- OR jsonb_array_length(h2) < 2
 
4️⃣ Weak SEO structure means ANY of the above.
 
You MUST NOT require ALL conditions to be true.
Use OR logic for weak signals.
 
━━━━━━━━━━━━━━━━━━━━━━
DECISION INSIGHT INTENT (MANDATORY)
 
If the question includes phrases like:
- "should be optimized"
- "needs improvement"
- "priority"
- "highest potential"
- "SEO ready"
- "wasting impressions"
- "lacks SEO signals"
- "content improvement"
 
THEN:
 
SET intent = decision_insight
 
DECISION_INSIGHT RULES:
 
1️⃣ You MUST derive insight using thresholds:
- High impressions: SUM(impressions) > 300
- Low CTR: ctr < 0.03
- Low traffic: SUM(screen_page_views) < 100
- High traffic: SUM(screen_page_views) > 300
 
2️⃣ You MUST calculate at least ONE ratio or comparison:
- ctr = clicks / impressions
- performance_ratio = GA views / GSC impressions
 
3️⃣ You MUST rank results using ORDER BY
- Worst first (ASC for CTR / ratios)
- Best first (DESC for traffic / impressions)
 
4️⃣ You MUST LIMIT results (5–15 rows)
 
5️⃣ You MAY combine:
- GA + GSC
- GSC + webpages
- GA + webpages
 
6️⃣ If content structure is mentioned:
- Use h1 = '[]'::jsonb
- OR h2 = '[]'::jsonb
 
7️⃣ NEVER return empty results by default
If risk of zero rows:
- Relax thresholds slightly
━━━━━━━━━━━━━━━━━━━━━━
STRICT SQL SAFETY RULES

- SELECT only
- NO INSERT / UPDATE / DELETE / DROP / ALTER
- NEVER invent tables or columns
- NEVER reference a table before JOIN
- NEVER aggregate array or json columns
- NEVER use subqueries unless necessary

━━━━━━━━━━━━━━━━━━━━━━
OUTPUT RULES

- Output ONLY ONE SELECT query
- DO NOT explain
- DO NOT wrap in markdown
- DO NOT return JSON
- DO NOT include comments

DATABASE:
PostgreSQL 14.19

SCHEMA:
{{ $json.schema }}

QUESTION:
{{ $items("User Question2")[0].json.question }}

${repairContext}
`;

  const resp = await openaiClient.chat.completions.create({
    model: "gpt-4",
    temperature: 0.3,
      max_tokens: 900,
    messages: [{ role: "system", content: sqlPrompt }],
  });

  const sql = (resp.choices?.[0]?.message?.content || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();

  console.log("✅ GENERATED SQL:");
  console.log(sql);

  console.log("🧾 SQL EXPLANATION:");
  console.log(`
  - Fetches SEO performance data from GSC
  - Filters rows by user_id = ${user_id}
  - Keeps URL / keyword as primary dimension
  - Pre-aggregates GA page views before joining
  - Orders by clicks & impressions
  - Limits output to top 10 rows
  `);

  return sql;
}
async function generateStrategyAnswer({
  question,
  openaiClient,
  dataContext, // 👈 NEW
}) {
  const prompt = `
You are a senior SEO strategist.

IMPORTANT RULES:
- Use ONLY the data provided below
- Do NOT assume anything not visible in the data
- Do NOT generate SQL
- Do NOT mention databases, tables, GA, or GSC explicitly
- Do NOT ask follow-up questions
- Be data-driven, not generic
- Use numbered, actionable steps
- If data is insufficient for a point, say so clearly

====================
AVAILABLE DATA
====================
${JSON.stringify(dataContext, null, 2)}

====================
USER QUESTION
====================
"${question}"

====================
RESPONSE FORMAT
====================
1. Diagnosis (based on data)
2. What is missing / weak
3. Priority actions (ordered)
4. Quick wins vs long-term fixes
`;

  const resp = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.25,
    messages: [{ role: "system", content: prompt }],
    max_tokens: 800,
  });

  return (
    resp.choices?.[0]?.message?.content?.trim() ||
    "Insufficient data to generate strategy."
  );
}
exports.chatbotdata = async (req, res) => {
  try {
    console.log("🚀 STEP 1: REQUEST RECEIVED");

    const { message, chat_id } = req.body;

    if (!message || typeof message !== "string") {
      console.log("❌ STEP 1 FAILED: Message missing");
      return res
        .status(400)
        .json({ success: false, message: "Message required" });
    }

    if (!req.user || req.user.id == null) {
      console.log("❌ STEP 1 FAILED: User not authenticated");
      return res
        .status(401)
        .json({ success: false, message: "User not authenticated" });
    }

    const user_id = Number(req.user.id);
    const question = message.trim();
    const chatId = chat_id || crypto.randomUUID();

    console.log("✅ STEP 1 COMPLETE");
    console.log("👤 User ID:", user_id);
    console.log("❓ Question:", question);

    /* ======================= */
    console.log("📚 STEP 2: LOADING DATABASE SCHEMA");
    /* ======================= */

    const schema = `
    TABLE public.users (
  id integer,
  assistant_id varchar,
  username varchar,
  email varchar,
  password varchar,
  isVerified boolean,
  otp varchar,
  otpExpires timestamptz,
  brand_register integer,
  createdAt timestamptz,
  updatedAt timestamptz
);

TABLE public.brands (
  id integer,
  user_id integer,
  brand_name varchar,
  domain jsonb,
  region jsonb,
  status boolean,
  keywords json,
  localArea boolean,
  cities jsonb,
  image_url varchar,
  domain_authority jsonb,
  refresh_token varchar,
  ga_refresh_token varchar,
  gbp_refresh_token varchar,
  gsc_refresh_token varchar,
  property_id varchar,
  site_url varchar,
  country varchar,
  country_code varchar,
  createdAt timestamptz,
  updatedAt timestamptz
);

TABLE public.brand_gbp_data (
  id integer,
  brand_id integer,
  gbp_refresh_token varchar,
  gbp_accounts jsonb,
  gbp_accounts_synced_at timestamptz,
  gbp_account_name varchar,
  gbp_location_id varchar,
  gbp_insights jsonb,
  gbp_insights_synced_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.domains (
  id integer,
  userId varchar,
  domain varchar,
  ga_refresh_token text,
  gsc_refresh_token text,
  property_id varchar,
  createdAt timestamptz,
  updatedAt timestamptz
);

TABLE public.webpages (
  id integer,
  domainId varchar,
  date varchar,
  url text,
  title text,
  meta_description text,
  body_text text,
  canonical text,
  h1 jsonb,
  h2 jsonb,
  embedding double precision[],
  createdAt timestamptz,
  updatedAt timestamptz,
  user_id bigint
);

TABLE public.urls (
  id integer,
  domainId varchar,
  url text,
  user_id bigint
);

=========================
GOOGLE ANALYTICS (GA)
=========================

TABLE public.ga_overall_data (
  id bigint,
  user_id bigint,
  brand_id bigint,
  start_date date,
  end_date date,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.ga_summary (
  id bigint,
  ga_overall_id bigint,
  total_users integer,
  sessions integer,
  screen_page_views integer,
  bounce_rate double precision,
  average_session_duration double precision,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.ga_channels (
  id bigint,
  ga_overall_id bigint,
  session_default_channel_group varchar,
  total_users integer,
  sessions integer,
  average_session_duration double precision,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.ga_devices (
  id bigint,
  ga_overall_id bigint,
  device_category varchar,
  sessions integer,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.ga_top_pages (
  id bigint,
  ga_overall_id bigint,
  page_path text,
  screen_page_views integer,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.ga_top_countries (
  id bigint,
  ga_overall_id bigint,
  keys varchar,
  sessions integer,
  ctr double precision,
  position double precision,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.ga_conversions (
  id bigint,
  ga_overall_id bigint,
  transactions integer,
  total_revenue double precision,
  session_conversion_rate double precision,
  average_purchase_revenue double precision,
  created_at timestamptz,
  updated_at timestamptz
);

=========================
GOOGLE SEARCH CONSOLE (GSC)
=========================

TABLE public.gsc_overall_data (
  id bigint,
  user_id bigint,
  brand_id bigint,
  start_date date,
  end_date date,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.gsc_summary (
  id bigint,
  gsc_overall_id bigint,
  summary_name varchar,
  clicks integer,
  impressions integer,
  ctr double precision,
  position double precision,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.gsc_devices (
  id bigint,
  gsc_overall_id bigint,
  keys varchar,
  clicks integer,
  impressions integer,
  ctr double precision,
  position double precision,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.gsc_top_pages (
  id bigint,
  gsc_overall_id bigint,
  keys text,
  clicks integer,
  impressions integer,
  ctr double precision,
  position double precision,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.gsc_top_keywords (
  id bigint,
  gsc_overall_id bigint,
  keys text,
  clicks integer,
  impressions integer,
  ctr double precision,
  position double precision,
  created_at timestamptz,
  updated_at timestamptz
);

TABLE public.gsc_top_countries (
  id bigint,
  gsc_overall_id bigint,
  keys varchar,
  clicks integer,
  impressions integer,
  ctr double precision,
  position double precision,
  created_at timestamptz,
  updated_at timestamptz
);
`;
    console.log("✅ STEP 2 COMPLETE");

    /* ======================= */
    console.log("🧠 STEP 3: SQL GENERATION");
    /* ======================= */

    let rawSQL;
    let rows;
const { intent, mode } = detectIntent(question);


if (mode === "direct_answer") {
const dataContext = await buildStrategyDataContext(user_id);
const answer = await generateStrategyAnswer({
  question,
  openaiClient,
  dataContext,
});
  await ChatHistory.create({
    user_id,
    chat_id: chatId,
    question,
    answer,
    is_deleted: false,
  });

  return res.json({
    success: true,
    chat_id: chatId,
    reply: answer,
  });
}

    rawSQL = await generateSQL({
      schema,
      question,
      user_id,
      openaiClient,
    });

    /* ======================= */
    console.log("🗄 STEP 4: EXECUTING SQL QUERY");
    /* ======================= */

    try {
      rows = await sequelize.query(
        rawSQL.replace(/{{USER_ID}}/g, String(user_id)),
        { type: sequelize.QueryTypes.SELECT },
      );

      console.log("✅ STEP 4 COMPLETE: SQL EXECUTED SUCCESSFULLY");
    } catch (err1) {
      console.log("⚠️ STEP 4 FAILED → MOVING TO REPAIR");

      rawSQL = await generateSQL({
        schema,
        question,
        user_id,
        previousSQL: rawSQL,
        error: err1.message,
        openaiClient,
      });

      rows = await sequelize.query(
        rawSQL.replace(/{{USER_ID}}/g, String(user_id)),
        { type: sequelize.QueryTypes.SELECT },
      );

      console.log("✅ STEP 5 COMPLETE: SQL REPAIRED & EXECUTED");
    }

    /* ======================= */
    console.log("🧾 STEP 6: FORMATTING RESPONSE");
    /* ======================= */

    let answer = "No data found";

    if (rows && rows.length) {
      const finalPrompt = `
Convert data into numbered list.
FIRST field is title.
No JSON.
`;

      const finalResp = await openaiClient.chat.completions.create({
        model: "gpt-3.5-turbo",
        temperature: 0,
        messages: [
          { role: "system", content: finalPrompt + JSON.stringify(rows) },
        ],
      });

      answer = finalResp.choices?.[0]?.message?.content?.trim();
    }

    console.log("✅ STEP 6 COMPLETE");

    /* ======================= */
    console.log("💾 STEP 7: SAVING CHAT HISTORY");
    /* ======================= */

    await ChatHistory.create({
      user_id,
      chat_id: chatId,
      question,
      answer,
      is_deleted: false,
    });

    console.log("🎉 STEP 7 COMPLETE: RESPONSE SENT");

    return res.json({
      success: true,
      chat_id: chatId,
      reply: answer,
    });
  } catch (err) {
    console.error("🔥 CHATBOT ERROR:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};
exports.getChatHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const chats = await ChatHistory.findAll({
      where: {
        user_id: userId,
        is_deleted: false,
      },
      attributes: [
        "id",
        "chat_id",
        "user_id",
        "question",
        "answer",
        "is_deleted",
        "createdAt",
      ],
      order: [["createdAt", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      data: chats,
    });
  } catch (error) {
    console.error("Get Chat History Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch chat history",
    });
  }
};

exports.deleteChat = async (req, res) => {
  try {
    const userId = req.user.id;

    const chats = await ChatHistory.findAll({
      where: {
        user_id: userId,
        is_deleted: false,
      },
      attributes: ["chat_id"],
    });

    if (!chats.length) {
      return res.status(404).json({
        success: false,
        message: "No chats found or already deleted",
      });
    }

    const chatIds = chats.map((c) => c.chat_id);

    // 2️⃣ Mark them as deleted
    await ChatHistory.update(
      { is_deleted: true },
      {
        where: {
          chat_id: chatIds,
          user_id: userId,
        },
      },
    );

    return res.status(200).json({
      success: true,
      message: "Chats cleared successfully",
    });
  } catch (error) {
    console.error("Delete Chat Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete chat",
    });
  }
};

exports.collectAndStoreGSCData = async (req, res) => {
  try {
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand || !brand.gsc_refresh_token || !brand.site_url) {
      return res.status(404).json({
        success: false,
        message: "Brand not registered with Google Search Console",
      });
    }

    const storedCount = await collectAndStoreGSCDataForBrand(brand);

    return res.json({
      success: true,
      storedRecords: storedCount,
    });
  } catch (err) {
    console.error("❌ Controller error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to collect GSC data",
    });
  }
};
exports.collectAndStoreGAData = async (req, res) => {
  try {
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand || !brand.ga_refresh_token || !brand.property_id) {
      return res.status(404).json({
        success: false,
        message: "Brand not registered with Google Analytics",
      });
    }

    const storedCount = await collectAndStoreGADataForBrand(brand);

    return res.json({
      success: true,
      storedRecords: storedCount,
    });
  } catch (err) {
    console.error("❌ GA Controller error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to collect GA data",
    });
  }
};

exports.getGSCGaWebDataFromDB = async (req, res) => {
  try {
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    const gscOverall = await GscOverallData.findAll({
      where: { brand_id: brand.id },
      order: [["start_date", "ASC"]],
      include: [
        {
          model: GscSummary,
          as: "summaries",
        },
        {
          model: GscTopKeywords,
          as: "top_keywords",
        },
        {
          model: GscTopPages,
          as: "top_pages",
        },
        {
          model: GscDevices,
          as: "devices",
        },
        {
          model: GscTopCountries,
          as: "top_countries",
        },
      ],
    });

    const gscData = gscOverall.map((row) => ({
      startDate: row.start_date,
      endDate: row.end_date,
      summaries: row.summaries || [],
      topKeywords: row.top_keywords || [],
      topPages: row.top_pages || [],
      devices: row.devices || [],
      topCountries: row.top_countries || [],
    }));

    const gaOverall = await GaOverallData.findAll({
      where: { brand_id: brand.id },
      order: [["start_date", "ASC"]],
      include: [
        {
          model: GaSummary,
          as: "summary",
        },
        {
          model: GaChannels,
          as: "channels",
        },
        {
          model: GaTopPages,
          as: "top_pages",
        },
        {
          model: GaDevices,
          as: "devices",
        },
        {
          model: GaTopCountries,
          as: "top_countries",
        },
        {
          model: GaConversions,
          as: "conversions",
        },
      ],
    });

    const gaData = gaOverall.map((row) => ({
      startDate: row.start_date,
      endDate: row.end_date,
      summary: row.summary || null,
      channels: row.channels || [],
      topPages: row.top_pages || [],
      devices: row.devices || [],
      topCountries: row.top_countries || [],
      conversions: row.conversions || null,
    }));

    const webpages = await Webpage.findAll({
      where: {
        user_id: req.user.id,
        domainId: String(brand.id),
      },
      attributes: [
        "date",
        "url",
        "title",
        "meta_description",
        "body_text",
        "canonical",
        "h1",
        "h2",
      ],
      order: [["date", "ASC"]],
    });

    const webpagesData = webpages.map((page) => ({
      date: page.date,
      url: page.url,
      title: page.title,
      meta_description: page.meta_description,
      body_text: page.body_text,
      canonical: page.canonical,
      h1: page.h1,
      h2: page.h2,
    }));

    if (!gscData.length && !gaData.length && !webpagesData.length) {
      return res.status(200).json({
        success: true,
        message: "No GA, GSC, or Webpages data found in DB",
        data: {
          gsc: [],
          ga: [],
          webpages: [],
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Analytics data fetched successfully",
      data: {
        gsc: gscData,
        ga: gaData,
        webpages: webpagesData,
      },
    });
  } catch (error) {
    console.error("getGSCGaWebDataFromDB error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch analytics data from DB",
    });
  }
};

// controllers/googleController.js
exports.startGBPOAuth = async (req, res) => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/business.manage"],
    });

    return res.redirect(authUrl);
  } catch (err) {
    console.error("startGBPOAuth error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to start GBP OAuth",
    });
  }
};

exports.handleGBPOAuthCallback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ message: "Authorization code missing" });
    }

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return res.status(400).json({
        message: "No refresh token received. Revoke access and retry.",
      });
    }

    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    await brand.update({
      gbp_refresh_token: tokens.refresh_token,
      gbp_connected: true,
    });

    return res.redirect("http://localhost:3001/gbp/select-account");
  } catch (err) {
    console.error("GBP callback error:", err);
    return res.status(500).json({ message: "GBP OAuth failed" });
  }
};

exports.getGBPAccounts = async (req, res) => {
  console.log("🔵 GBP: getGBPAccounts API called");

  let gbp;

  try {
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });
    console.log("🔵 GBP brand", brand);
    console.log("🔵 GBP gbp_refresh_token", brand?.gbp_refresh_token);

    if (!brand || !brand.gbp_refresh_token) {
      return res.status(400).json({
        success: false,
        message: "GBP not connected",
      });
    }

    /* ===========================
       2️⃣ FIND / CREATE GBP DATA
    =========================== */
    [gbp] = await BrandGbpData.findOrCreate({
      where: { brand_id: brand.id },
      defaults: {
        brand_id: brand.id,
        gbp_refresh_token: brand.gbp_refresh_token,
      },
    });

    /* ===========================
       3️⃣ CACHE CHECK (24H)
    =========================== */
    if (
      gbp.gbp_accounts &&
      gbp.gbp_accounts_synced_at &&
      Date.now() - gbp.gbp_accounts_synced_at.getTime() < 24 * 60 * 60 * 1000
    ) {
      return res.json({
        success: true,
        source: "cache",
        accounts: gbp.gbp_accounts,
      });
    }

    /* ===========================
       🔒 3.5️⃣ SYNC LOCK
    =========================== */
    if (gbp.is_syncing) {
      console.log("⏳ GBP: Sync in progress, returning cached data");

      return res.json({
        success: true,
        source: "cache",
        accounts: gbp.gbp_accounts || [],
      });
    }

    gbp.is_syncing = true;
    await gbp.save();

    /* ===========================
       4️⃣ REFRESH TOKEN
    =========================== */
    const tokenData = await refreshGoogleAccessToken(brand.gbp_refresh_token);

    const access_token = tokenData.access_token;
    if (!access_token) throw new Error("Access token missing");

    /* ===========================
       5️⃣ GOOGLE API CALL
    =========================== */
    const { data } = await axios.get(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      {
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 10000,
      },
    );

    /* ===========================
       6️⃣ SAVE TO DB
    =========================== */
    await gbp.update({
      gbp_accounts: data.accounts || [],
      gbp_accounts_synced_at: new Date(),
      is_syncing: false,
    });

    return res.json({
      success: true,
      source: "google",
      accounts: data.accounts || [],
    });
  } catch (err) {
    console.error("🔥 GBP ERROR:", err.response?.data || err.message);

    if (gbp) {
      gbp.is_syncing = false;
      await gbp.save();
    }

    if (err.response?.status === 429) {
      return res.status(429).json({
        success: false,
        message: "GBP quota hit. Try again later.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch GBP accounts",
    });
  }
};

exports.selectGBPAccount = async (req, res) => {
  const { account_name } = req.body;

  if (!account_name) {
    return res.status(400).json({
      success: false,
      message: "account_name required",
    });
  }

  const brand = await Brand.findOne({
    where: { user_id: req.user.id },
  });

  const gbp = await BrandGbpData.findOne({
    where: { brand_id: brand.id },
  });

  await gbp.update({
    gbp_account_name: account_name,
    gbp_location_id: null,
  });

  return res.json({ success: true });
};

exports.getGBPLocations = async (req, res) => {
  const brand = await Brand.findOne({ where: { user_id: req.user.id } });
  const gbp = await BrandGbpData.findOne({ where: { brand_id: brand.id } });

  if (!gbp?.gbp_account_name) {
    return res
      .status(400)
      .json({ success: false, message: "Account not selected" });
  }

  if (gbp.gbp_location_id) {
    return res.json({
      success: true,
      source: "db",
      location_id: gbp.gbp_location_id,
    });
  }

  const { access_token } = await refreshGoogleAccessToken(
    brand.gbp_refresh_token,
  );

  const { data } = await axios.get(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${gbp.gbp_account_name}/locations`,
    { headers: { Authorization: `Bearer ${access_token}` } },
  );

  const location = data.locations?.[0]?.name || null;

  await gbp.update({ gbp_location_id: location });

  res.json({ success: true, source: "google", location_id: location });
};
exports.getGBPInsights = async (req, res) => {
  const brand = await Brand.findOne({ where: { user_id: req.user.id } });
  const gbp = await BrandGbpData.findOne({ where: { brand_id: brand.id } });

  return res.json({
    success: true,
    source: "db",
    data: gbp?.gbp_insights || {},
    synced_at: gbp?.gbp_insights_synced_at,
  });
};
exports.refreshGBPInsights = async (req, res) => {
  const brand = await Brand.findOne({ where: { user_id: req.user.id } });
  const gbp = await BrandGbpData.findOne({ where: { brand_id: brand.id } });

  if (!gbp?.gbp_location_id) {
    return res
      .status(400)
      .json({ success: false, message: "Location not selected" });
  }

  if (
    gbp.gbp_insights_synced_at &&
    Date.now() - gbp.gbp_insights_synced_at.getTime() < 24 * 60 * 60 * 1000
  ) {
    return res.status(429).json({
      success: false,
      message: "Insights already refreshed in last 24 hours",
    });
  }

  const { access_token } = await refreshGoogleAccessToken(
    brand.gbp_refresh_token,
  );

  const body = {
    dailyMetrics: [
      "WEBSITE_CLICKS",
      "CALL_CLICKS",
      "DIRECTIONS_REQUESTS",
      "BUSINESS_IMPRESSIONS",
    ],
    dateRange: {
      startDate: { year: 2024, month: 1, day: 1 },
      endDate: { year: 2024, month: 12, day: 31 },
    },
  };

  const { data } = await axios.post(
    `https://businessprofileperformance.googleapis.com/v1/${gbp.gbp_location_id}:fetchMultiDailyMetricsTimeSeries`,
    body,
    { headers: { Authorization: `Bearer ${access_token}` } },
  );

  await gbp.update({
    gbp_insights: data,
    gbp_insights_synced_at: new Date(),
  });

  res.json({ success: true, source: "google", data });
};

const transporterr = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_PORT == "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

exports.gemailtrigger = async (req, res) => {
  try {
    const function_name = (agent) => `
      <div style="font-family: Arial, sans-serif; line-height: 1.6">
        <h2 style="color: #dc2626;">⚠️ ${agent} Usage Limit Reached</h2>
        <p>Your <b>${agent}</b> usage limit has been exhausted.</p>
        <p>Please upgrade your plan or wait for the next reset.</p>
        <br />
        <p><b>Action required immediately.</b></p>
      </div>
    `;

    if (!process.env.SMTP_USER || !process.env.EMAIL_USER) {
      throw new Error("SMTP_USER or EMAIL_USER is not defined");
    }

    const agent = req.body?.agent || "chatgpt";

    const mailOptions = {
      from: `"System Alert" <${process.env.SMTP_USER}>`,
      to: process.env.EMAIL_USER,
      subject: ` ${agent} Usage Limit Reached`,
      html: function_name(agent),
    };

    await transporterr.sendMail(mailOptions);

    return res.json({
      success: true,
      message: `${agent} limit email sent via SMTP`,
    });
  } catch (error) {
    console.error(" SMTP email error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
//n8n aksy enail
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_PORT == "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

exports.gemailtriggervisibility = async (req, res) => {
  const dbInfo = await sequelize.query(
    `SELECT current_database() AS db, inet_server_addr() AS host`,
    { type: QueryTypes.SELECT },
  );

  console.log("🧪 CONNECTED DB INFO:", dbInfo);
  try {
    console.log("📩 Visibility email trigger started");

    /* =========================
       0️⃣ AUTH CHECK
    ========================= */
    const userId = req.user?.id;
    console.log("🔐 User ID from JWT:", userId);

    if (!userId) {
      console.log("❌ Missing user id");
      return res.status(401).json({
        success: false,
        message: "Unauthorized: user id missing",
      });
    }

    /* =========================
       1️⃣ RAW SQL QUERY
       (status = true FIXED)
    ========================= */
    console.log("🧠 Executing SQL query...");

    const rows = await sequelize.query(
      `
      SELECT
        u.id           AS user_id,
        u.username,
        u.email,

        b.brand_name   AS brand,

        p.id           AS prompt_id,
        p.title        AS prompt_title,

        v.platform,
        v.mentioned,
        v.mentions,
        v.visibility_score,

        (v.run_date AT TIME ZONE 'Asia/Kolkata')::date AS run_day

      FROM users u

      LEFT JOIN brands b
        ON b.user_id = u.id
        AND b.status = true

      JOIN prompts p
        ON p."userId" = u.id
        AND p.status = true
        AND (p.is_deleted = false OR p.is_deleted IS NULL)

      LEFT JOIN visibility_logs v
        ON v."promptId" = p.id
        AND (v.run_date AT TIME ZONE 'Asia/Kolkata')::date
            IN (CURRENT_DATE, CURRENT_DATE - INTERVAL '1 day')

      WHERE u.id = :userId

      ORDER BY p.id, v.platform, run_day
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
      },
    );

    console.log("📊 Raw rows count:", rows.length);
    console.log("📦 Sample row:", rows[0]);

    /* =========================
       2️⃣ NO DATA CHECK
    ========================= */
    if (!rows || rows.length === 0) {
      console.log("⚠️ No rows returned from SQL");
      return res.json({
        success: true,
        message: "No visibility data found",
      });
    }

    /* =========================
       3️⃣ GROUP + DROP DETECTION
    ========================= */
    console.log("🔍 Detecting drops...");

    const today = new Date().toISOString().slice(0, 10);
    const map = {};

    for (const r of rows) {
      if (!r.platform) continue;

      const key = `${r.prompt_id}|${r.platform}`;

      if (!map[key]) {
        map[key] = {
          email: r.email,
          username: r.username,
          brand: r.brand || "-",
          prompt_title: r.prompt_title,
          platform: r.platform,
          today: null,
          yesterday: null,
        };
      }

      if (r.run_day === today) {
        map[key].today = r.mentioned;
      } else {
        map[key].yesterday = r.mentioned;
      }
    }

    const drops = Object.values(map).filter(
      (d) => d.yesterday === true && d.today === false,
    );

    console.log("🚨 Drops detected:", drops.length);
    console.log("🚨 Drop sample:", drops[0]);

    /* =========================
       4️⃣ NO DROPS → EXIT
    ========================= */
    if (drops.length === 0) {
      console.log("✅ No visibility drops found");
      return res.json({
        success: true,
        message: "No visibility drops detected",
      });
    }

    /* =========================
       5️⃣ BUILD EMAIL
    ========================= */
    console.log("✉️ Building email...");

    const brandName = drops[0].brand;
    const toEmail = drops[0].email;
    const username = drops[0].username || "";

    const blocks = drops
      .map(
        (d) => `
      <div style="margin-bottom:16px; padding:12px; border-left:4px solid #dc2626; background:#fef2f2;">
        <p><b>Prompt:</b> ${d.prompt_title}</p>
        <p><b>Platform:</b> ${d.platform}</p>
        <p style="color:#dc2626;">
          <b>Status:</b> ❌ Mention DROPPED (Yesterday → Today)
        </p>
      </div>
    `,
      )
      .join("");

    const html = `
      <p>Hi ${username},</p>

      <p>
        ⚠️ <b>Brand Visibility Alert</b><br/>
        The following mentions have <b>dropped today</b>.
      </p>

      <p><b>Brand:</b> ${brandName}</p>

      ${blocks}

      <p style="margin-top:24px;">
        Regards,<br/>
        <b>Visibility Monitoring System</b>
      </p>

      <hr/>

      <div style="font-size:12px; color:#555;">
        Powered by <b style="color:#4f46e5;">Aquil Tech Lab</b><br/>
        SEO • AI • Automation • Analytics<br/>
        <a href="https://aquiltechlabs.com/"
           target="_blank"
           style="color:#4f46e5; text-decoration:none;">
          aquiltechlabs.com
        </a>
      </div>
    `;

    /* =========================
       6️⃣ SEND EMAIL
    ========================= */
    console.log("📤 Sending email to:", toEmail);

    await transporter.sendMail({
      from: `"Visibility Alert" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `⚠️ Brand Visibility Drop – ${brandName}`,
      html,
    });

    console.log("✅ Email sent");

    return res.json({
      success: true,
      message: "Visibility drop email sent",
      email: toEmail,
      brand: brandName,
      drops: drops.length,
    });
  } catch (error) {
    console.error("❌ Visibility Email Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
