const axios = require("axios");
const { Brand ,BrandGbpData,Prompt,VisibilityLog} = require("../models");
const { google } = require("googleapis");
const GscSnapshot =require("../models/GscSnapshot");
const GaSnapshot =require("../models/GaSnapshot");

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
const {
  collectAndStoreGADataForBrand,
} = require("../services/gaService");

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
  process.env.GBP_REDIRECT_URI
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
      }
    );

    if (account === "ga") {
      brand.ga_refresh_token = data.refresh_token;
    } else if (account === "gsc") {
      brand.gsc_refresh_token = data.refresh_token;
    }else if (account === "gbp") {
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
      }
    );

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(
      "Refresh token error:",
      error.response?.data || error.message
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
      siteUrl
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
        siteUrl
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
      siteUrl
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
      siteUrl
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
          }
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

    //     const prompt = `
    // You are a senior SEO & Analytics expert.

    // Analyze the following website analytics data between ${startDate} and ${endDate}.

    // 1. Google Search Console Data:
    // ${JSON.stringify(gscData, null, 2)}

    // Give:
    // - Overall website performance summary
    // - Traffic growth insights
    // - SEO visibility insights
    // - What improved
    // - What needs attention
    // - Clear next action points

    // Respond in simple business language.
    // `;
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
// with propt 
exports.chatbotdata = async (req, res) => {
  try {
    const { message, chat_id, overalldata } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        message: "Message required",
      });
    }

    const user_id = req.user.id;
    const chatId = chat_id || crypto.randomUUID();

    /* =======================
       🔎 GET DOMAIN FROM BRAND
    ======================= */
    const brand = await Brand.findOne({
      where: { user_id },
      attributes: ["domain"],
    });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found for user",
      });
    }

    const siteName = brand.domain;

    /* =======================
       💬 THREAD LOGIC
    ======================= */
    const previousCount = await ChatHistory.count({
      where: { chat_id: chatId, user_id },
    });

    let THREAD_ID;

    if (previousCount === 0) {
      const thread = await openaiClient.beta.threads.create();
      THREAD_ID = thread.id;
    } else {
      const lastRow = await ChatHistory.findOne({
        where: { chat_id: chatId, user_id },
        order: [["createdAt", "DESC"]],
      });
      THREAD_ID = lastRow.thread_id;
    }

    /* =======================
       🧠 SYSTEM PROMPT (ALWAYS)
    ======================= */
    const systemPrompt = `
You are an AI assistant for the website: ${siteName}.

RULES:
1. Answer ONLY using the information provided in DATA.
2. Do NOT use general knowledge or assumptions.
3. Summarize information clearly if multiple pages are relevant.
4. If medicines are mentioned:
   - Do NOT diagnose
   - Advise consulting a doctor if symptoms persist
5. Include URLs when helpful.
6. Be concise, clear, and user-friendly.
`;

    /* =======================
       🧾 BUILD MESSAGE CONTENT
    ======================= */
    const content = `
${systemPrompt}

${Array.isArray(overalldata) && overalldata.length > 0
  ? `DATA:\n${JSON.stringify(data, null, 2)}\n`
  : ""}

User message:
${message}
`;

    /* =======================
       📝 SAVE USER QUESTION
    ======================= */
    const row = await ChatHistory.create({
      user_id,
      chat_id: chatId,
      thread_id: THREAD_ID,
      question: message,
    });

    /* =======================
       📤 SEND TO OPENAI
    ======================= */
    await openaiClient.beta.threads.messages.create(THREAD_ID, {
      role: "user",
      content,
    });

    const run = await openaiClient.beta.threads.runs.createAndPoll(THREAD_ID, {
      assistant_id: GLOBAL_ASSISTANT_ID,
    });

    if (run.status !== "completed") {
      throw new Error(`Run failed: ${run.status}`);
    }

    const messages = await openaiClient.beta.threads.messages.list(THREAD_ID);
    const reply =
      messages.data?.[0]?.content?.[0]?.text?.value ?? "No response generated";

    await row.update({ answer: reply });

    /* =======================
       ✅ FINAL RESPONSE
    ======================= */
    return res.json({
      success: true,
      chat_id: chatId,
      reply,
    });

  } catch (error) {
    console.error("ERROR", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// with prompt + sending overall dat aof gsc ,ga n web with each msg 
// exports.chatbotdata = async (req, res) => {
//   try {
//     const { message, chat_id, overalldata } = req.body;

//     /* =======================
//        ✅ BASIC VALIDATION
//     ======================= */
//     if (!message || typeof message !== "string") {
//       return res.status(400).json({
//         success: false,
//         message: "Message required",
//       });
//     }

//     const user_id = req.user.id;
//     const chatId = chat_id || crypto.randomUUID();

//     /* =======================
//        🔎 GET DOMAIN FROM BRAND
//     ======================= */
//     const brand = await Brand.findOne({
//       where: { user_id },
//       attributes: ["domain"],
//     });

//     if (!brand) {
//       return res.status(404).json({
//         success: false,
//         message: "Brand not found for user",
//       });
//     }

//     const siteName = brand.domain;

//     /* =======================
//        💬 THREAD LOGIC (KEEP THIS)
//     ======================= */
//     const previousCount = await ChatHistory.count({
//       where: { chat_id: chatId, user_id },
//     });

//     let THREAD_ID;

//     if (previousCount === 0) {
//       const thread = await openaiClient.beta.threads.create();
//       THREAD_ID = thread.id;
//     } else {
//       const lastRow = await ChatHistory.findOne({
//         where: { chat_id: chatId, user_id },
//         order: [["createdAt", "DESC"]],
//       });
//       THREAD_ID = lastRow.thread_id;
//     }

//     /* =======================
//        🧠 SYSTEM PROMPT (ALWAYS)
//     ======================= */
//     const systemPrompt = `
// You are an AI assistant for the website: ${siteName}.

// RULES:
// 1. Answer ONLY using the information provided in DATA.
// 2. Do NOT use general knowledge or assumptions.
// 3. Summarize information clearly if multiple pages are relevant.
// 4. If medicines are mentioned:
//    - Do NOT diagnose
//    - Advise consulting a doctor if symptoms persist
// 5. Include URLs when helpful.
// 6. Be concise, clear, and user-friendly.
// `;

//     /* =======================
//        🧾 BUILD MESSAGE CONTENT
//        (NO FIRST-MESSAGE LOGIC)
//     ======================= */
//     const content = `
// ${systemPrompt}

// DATA:
// ${JSON.stringify(overalldata || [], null, 2)}

// User message:
// ${message}
// `;

//     /* =======================
//        📝 SAVE USER QUESTION
//     ======================= */
//     const row = await ChatHistory.create({
//       user_id,
//       chat_id: chatId,
//       thread_id: THREAD_ID,
//       question: message,
//     });

//     /* =======================
//        📤 SEND TO OPENAI
//     ======================= */
//     await openaiClient.beta.threads.messages.create(THREAD_ID, {
//       role: "user",
//       content,
//     });

//     const run = await openaiClient.beta.threads.runs.createAndPoll(THREAD_ID, {
//       assistant_id: GLOBAL_ASSISTANT_ID,
//     });

//     if (run.status !== "completed") {
//       throw new Error(`Run failed: ${run.status}`);
//     }

//     const messages = await openaiClient.beta.threads.messages.list(THREAD_ID);
//     const reply =
//       messages.data?.[0]?.content?.[0]?.text?.value ??
//       "No response generated";

//     await row.update({ answer: reply });

//     /* =======================
//        ✅ FINAL RESPONSE
//     ======================= */
//     return res.json({
//       success: true,
//       chat_id: chatId,
//       reply,
//     });
//   } catch (error) {
//     console.error("❌ CHATBOT ERROR:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
//without propt to responce 
// exports.chatbotdata = async (req, res) => {
//   try {
//     const { message, chat_id, gsc_data } = req.body;

//     if (!message || typeof message !== "string") {
//       return res.status(400).json({
//         success: false,
//         message: "Message required",
//       });
//     }

//     const user_id = req.user.id;
//     const chatId = chat_id || crypto.randomUUID();

//     const previousCount = await ChatHistory.count({
//       where: { chat_id: chatId, user_id },
//     });

//     const isFirstMessage = previousCount === 0;

//     let THREAD_ID;

//     if (isFirstMessage) {
//       const thread = await openaiClient.beta.threads.create();
//       THREAD_ID = thread.id;
//     } else {
//       const lastRow = await ChatHistory.findOne({
//         where: { chat_id: chatId, user_id },
//         order: [["createdAt", "DESC"]],
//       });
//       THREAD_ID = lastRow.thread_id;
//       console.log("REUSING THREAD:", THREAD_ID);
//     }

//     let content = message;

//     if (isFirstMessage && Array.isArray(gsc_data) && gsc_data.length > 0) {
//       content = `User data (remember and use these throughout this conversation):
// ${gsc_data.join(", ")}

// User message:
// ${message}`;
//     }

//     const row = await ChatHistory.create({
//       user_id,
//       chat_id: chatId,
//       thread_id: THREAD_ID,
//       question: message,
//     });

//     await openaiClient.beta.threads.messages.create(THREAD_ID, {
//       role: "user",
//       content,
//     });

//     const run = await openaiClient.beta.threads.runs.createAndPoll(THREAD_ID, {
//       assistant_id: GLOBAL_ASSISTANT_ID,
//     });

//     if (run.status !== "completed") {
//       throw new Error(`Run failed: ${run.status}`);
//     }

//     const messages = await openaiClient.beta.threads.messages.list(THREAD_ID);
//     const reply =
//       messages.data?.[0]?.content?.[0]?.text?.value ?? "No response generated";

//     await row.update({ answer: reply });

//     return res.json({
//       success: true,
//       chat_id: chatId,
//       reply,
//     });
//   } catch (error) {
//     console.error("ERROR", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };
exports.getChatHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const chats = await ChatHistory.findAll({
      where: {
        user_id: userId,
        is_deleted: false,
      },
      attributes: [
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
    const { chatId } = req.params;
    const userId = req.user.id;

    const [updatedCount] = await ChatHistory.update(
      { is_deleted: true },
      {
        where: {
          chat_id: chatId,
          user_id: userId,
          is_deleted: false,
        },
      }
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Chat not found or already deleted",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Chat cleared successfully",
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


//date_wise
exports.getGSCDataFromDB = async (req, res) => {
  try {
    /* =======================
       🔐 BRAND CHECK
    ======================= */
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: "Brand not found",
      });
    }

    /* =======================
       📊 GSC DATA (ARRAY)
    ======================= */
    const gscSnapshots = await GscSnapshot.findAll({
      where: { brand_id: brand.id },
      order: [["start_date", "ASC"]],
    });

    const gscData = gscSnapshots.length
      ? gscSnapshots.flatMap(row => row.gsc_data)
      : [];

    /* =======================
       📈 GA DATA (ARRAY)
    ======================= */
    const gaSnapshots = await GaSnapshot.findAll({
      where: { brand_id: brand.id },
      order: [["start_date", "ASC"]],
    });

    const gaData = gaSnapshots.length
      ? gaSnapshots.flatMap(row => row.ga_data)
      : [];

    /* =======================
       🌐 WEBPAGES DATA (ARRAY)
    ======================= */
    const webpages = await Webpage.findAll({
      where: {
        domainId: "3", // 👈 string, matches model
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

    const webpagesData = webpages.length
      ? webpages.map(page => ({
          date: page.date,
          url: page.url,
          title: page.title,
          meta_description: page.meta_description,
          body_text: page.body_text,
          canonical: page.canonical,
          h1: page.h1,
          h2: page.h2,
        }))
      : [];

    /* =======================
       ❌ NO DATA FOUND
    ======================= */
    if (!gscData.length && !gaData.length && !webpagesData.length) {
      return res.status(200).json({
        success: true,
        data: {
          gsc: [],
          ga: [],
          webpages: [],
        },
        message: "No GA, GSC, or Webpages data found in DB",
      });
    }

    /* =======================
       ✅ FINAL RESPONSE
    ======================= */
    return res.status(200).json({
      success: true,
      message: "hey",
      data: {
        gsc: gscData,           // ✅ ARRAY
        ga: gaData,             // ✅ ARRAY
        webpages: webpagesData // ✅ ARRAY
      },
    });

  } catch (error) {
    console.error("getAnalyticsDataFromDB error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch analytics data from DB",
    });
  }
};


// exports.getGSCDataFromDB = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     // ✅ Fetch all brands belonging to logged-in user
//     const brands = await Brand.findAll({
//       where: { user_id: userId },
//       attributes: ["id"],
//     });

//     if (!brands.length) {
//       return res.status(404).json({
//         success: false,
//         message: "No brand found for this user",
//       });
//     }

//     const brandIds = brands.map((b) => b.id);

//     // ✅ Fetch snapshots ONLY for these brand IDs
//     const snapshots = await GscSnapshot.findAll({
//       where: {
//         brand_id: brandIds,
//       },
//       order: [["start_date", "ASC"]],
//     });

//     if (!snapshots.length) {
//       return res.status(200).json({
//         success: true,
//         data: [],
//         message: "No GSC data found for this user",
//       });
//     }

//     // ✅ Flatten safely
//     const gscData = snapshots.flatMap((row) => row.gsc_data || []);

//     return res.status(200).json({
//       success: true,
//       message: "GSC data fetched for logged-in user",
//       data: gscData,
//     });
//   } catch (error) {
//     console.error("getGSCDataFromDB error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch GSC data",
//     });
//   }
// };

//overall(total) data calculate
// exports.getGSCDataFromDB = async (req, res) => {
//   try {
//     const brand = await Brand.findOne({
//       where: { user_id: req.user.id },
//     });

//     if (!brand) {
//       return res.status(404).json({
//         success: false,
//         message: "Brand not found",
//       });
//     }

//     const snapshots = await GscSnapshot.findAll({
//       where: { brand_id: brand.id },
//       order: [["start_date", "ASC"]],
//     });

//     if (!snapshots.length) {
//       return res.status(200).json({
//         success: true,
//         data: {},
//         message: "No GSC data found in DB",
//       });
//     }

//     const merged = {
//       summary: {
//         web: { clicks: 0, impressions: 0 },
//         discover: { clicks: 0, impressions: 0 },
//         news: { clicks: 0, impressions: 0 },
//       },
//       topKeywords: [],
//       topCountries: [],
//       topPages: [],
//       devices: [],
//     };

//     snapshots.forEach((row) => {
//       const d = row.gsc_data;

//       // SUMMARY
//       if (d?.summary?.web) {
//         merged.summary.web.clicks += d.summary.web.clicks || 0;
//         merged.summary.web.impressions += d.summary.web.impressions || 0;
//       }

//       // TOP KEYWORDS
//       merged.topKeywords.push(...(d.topKeywords || []));

//       // TOP COUNTRIES
//       merged.topCountries.push(...(d.topCountries || []));

//       // TOP PAGES
//       merged.topPages.push(...(d.topPages || []));

//       // DEVICES
//       merged.devices.push(...(d.devices || []));
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Merged GSC data fetched from DB",
//       data: merged,
//     });
//   } catch (error) {
//     console.error("getGSCDataFromDB error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch GSC data from DB",
//     });
//   }
// };
// exports.getGoogleBusinessProfileData = async (req, res) => {
//   try {
//     const brand = await Brand.findOne({
//       where: { user_id: req.user.id },
//     });

//     if (!brand?.gbp_refresh_token) {
//       return res.json({
//         success: true,
//         message: "Google Business Profile not connected",
//         data: {},
//       });
//     }

//     const now = new Date();
//     const lastSync = brand.gbp_last_synced
//       ? new Date(brand.gbp_last_synced)
//       : null;

//     const diffMinutes = lastSync
//       ? (now - lastSync) / (1000 * 60)
//       : Infinity;

//     // ✅ RETURN CACHED DATA IF RECENT
//     if (diffMinutes < 15 && brand.gbp_data) {
//       return res.json({
//         success: true,
//         source: "cache",
//         data: brand.gbp_data,
//       });
//     }

//     // 🔐 Refresh token (ONLY NOW)
//     const { access_token } = await refreshGoogleAccessToken(
//       brand.gbp_refresh_token
//     );

//     /* ---------- 1️⃣ Accounts ---------- */
//     const accountsRes = await axios.get(
//       "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
//       { headers: { Authorization: `Bearer ${access_token}` } }
//     );

//     const accountName = accountsRes.data.accounts?.[0]?.name;
//     if (!accountName) {
//       return res.json({ success: true, data: {} });
//     }

//     /* ---------- 2️⃣ Locations ---------- */
//     const locationsRes = await axios.get(
//       `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`,
//       { headers: { Authorization: `Bearer ${access_token}` } }
//     );

//     const locationName = locationsRes.data.locations?.[0]?.name;

//     /* ---------- 3️⃣ Reviews ---------- */
//     let reviews = [];
//     if (locationName) {
//       const reviewsRes = await axios.get(
//         `https://mybusiness.googleapis.com/v4/${locationName}/reviews`,
//         { headers: { Authorization: `Bearer ${access_token}` } }
//       );
//       reviews = reviewsRes.data.reviews || [];
//     }

//     const gbpData = {
//       account: accountName,
//       location: locationName,
//       reviews,
//       syncedAt: now,
//     };

//     // 💾 SAVE CACHE
//     await brand.update({
//       gbp_data: gbpData,
//       gbp_last_synced: now,
//     });

//     return res.json({
//       success: true,
//       source: "google",
//       data: gbpData,
//     });
//   } catch (error) {
//     if (error.response?.status === 429) {
//       return res.status(429).json({
//         success: false,
//         message:
//           "Google Business Profile rate limit exceeded. Please try again later.",
//       });
//     }

//     console.error("GBP Error:", error.response?.data || error.message);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch GBP data",
//     });
//   }
// };
// exports.getGBPLocations = async (req, res) => {
//   try {
//     const brand = await Brand.findOne({
//       where: { user_id: req.user.id },
//     });

//     if (!brand?.gbp_account_name) {
//       return res.status(400).json({
//         success: false,
//         message: "GBP account not selected",
//       });
//     }

//     const { access_token } = await refreshGoogleAccessToken(
//       brand.gbp_refresh_token
//     );

//     const { data } = await axios.get(
//       `https://mybusinessbusinessinformation.googleapis.com/v1/${brand.gbp_account_name}/locations`,
//       {
//         headers: { Authorization: `Bearer ${access_token}` },
//       }
//     );

//     const location = data.locations?.[0];

//     if (location) {
//       brand.gbp_location_id = location.name; // locations/XXXX
//       await brand.save();
//     }

//     return res.json({
//       success: true,
//       locations: data.locations || [],
//     });
//   } catch (err) {
//     console.error("GBP Locations Error:", err.response?.data || err.message);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch GBP locations",
//     });
//   }
// };
// exports.selectGBPAccount = async (req, res) => {
//   const { account_name } = req.body;

//   if (!account_name) {
//     return res.status(400).json({
//       success: false,
//       message: "account_name is required",
//     });
//   }

//   const brand = await Brand.findOne({
//     where: { user_id: req.user.id },
//   });

//   brand.gbp_account_name = account_name;
//   await brand.save();

//   return res.json({
//     success: true,
//     message: "GBP account selected",
//   });
// };
// exports.getGBPInsights = async (req, res) => {
//   try {
//     const brand = await Brand.findOne({
//       where: { user_id: req.user.id },
//     });

//     if (!brand?.gbp_location_id) {
//       return res.status(400).json({
//         success: false,
//         message: "GBP location not selected",
//       });
//     }

//     const now = new Date();
//     const lastSync = brand.gbp_last_synced
//       ? new Date(brand.gbp_last_synced)
//       : null;

//     // ✅ CACHE FOR 24 HOURS (FIXES 429)
//     if (
//       lastSync &&
//       (now - lastSync) / (1000 * 60) < 1440 &&
//       brand.gbp_data
//     ) {
//       return res.json({
//         success: true,
//         source: "cache",
//         data: brand.gbp_data,
//       });
//     }

//     const { access_token } = await refreshGoogleAccessToken(
//       brand.gbp_refresh_token
//     );

//     const body = {
//       dailyMetrics: [
//         "WEBSITE_CLICKS",
//         "CALL_CLICKS",
//         "DIRECTIONS_REQUESTS",
//         "BUSINESS_IMPRESSIONS",
//       ],
//       dateRange: {
//         startDate: { year: 2024, month: 1, day: 1 },
//         endDate: { year: 2024, month: 1, day: 31 },
//       },
//     };

//     const { data } = await axios.post(
//       `https://businessprofileperformance.googleapis.com/v1/${brand.gbp_location_id}:fetchMultiDailyMetricsTimeSeries`,
//       body,
//       {
//         headers: { Authorization: `Bearer ${access_token}` },
//       }
//     );

//     await brand.update({
//       gbp_data: data,
//       gbp_last_synced: now,
//     });

//     return res.json({
//       success: true,
//       source: "google",
//       data,
//     });
//   } catch (err) {
//     if (err.response?.status === 429) {
//       return res.status(429).json({
//         success: false,
//         message: "GBP quota exceeded. Try again later.",
//       });
//     }

//     console.error("GBP Insights Error:", err.response?.data || err.message);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch GBP insights",
//     });
//   }
// };
// exports.getGBPReviews = async (req, res) => {
//   try {
//     const brand = await Brand.findOne({
//       where: { user_id: req.user.id },
//     });

//     if (!brand?.gbp_location_id) {
//       return res.status(400).json({
//         success: false,
//         message: "GBP location not selected",
//       });
//     }

//     const { access_token } = await refreshGoogleAccessToken(
//       brand.gbp_refresh_token
//     );

//     const { data } = await axios.get(
//       `https://mybusiness.googleapis.com/v4/${brand.gbp_location_id}/reviews`,
//       {
//         headers: { Authorization: `Bearer ${access_token}` },
//       }
//     );

//     return res.json({
//       success: true,
//       reviews: data.reviews || [],
//     });
//   } catch (err) {
//     console.error("GBP Reviews Error:", err.response?.data || err.message);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch GBP reviews",
//     });
//   }
// };
// exports.startGBPOAuth = async (req, res) => {
//   try {
//     console.log("GBP OAUTH ENV CHECK:", {
//       CLIENT_ID: process.env.CLIENT_ID ,
//       CLIENT_SECRET: process.env.CLIENT_SECRET ,
//       GBP_REDIRECT_URI: process.env.GBP_REDIRECT_URI,
//     });

//     const oauth2Client = new OAuth2Client(
//       process.env.CLIENT_ID,
//       process.env.CLIENT_SECRET,
//       process.env.GBP_REDIRECT_URI
//     );

//     const authUrl = oauth2Client.generateAuthUrl({
//       access_type: "offline",
//       prompt: "consent",
//       scope: ["https://www.googleapis.com/auth/business.manage"],
//     });

//     return res.redirect(authUrl);
//   } catch (err) {
//     console.error("startGBPOAuth ERROR:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to start GBP OAuth",
//     });
//   }
// };
// exports.getGBPAccounts = async (req, res) => {
//   try {
//     const brand = await Brand.findOne({
//       where: { user_id: req.user.id },
//     });

//     if (!brand || !brand.gbp_refresh_token) {
//       return res.status(400).json({
//         success: false,
//         message: "GBP not connected",
//       });
//     }

//     // ✅ FIND OR CREATE BRAND GBP DATA ROW
//     const [gbpData] = await BrandGbpData.findOrCreate({
//       where: { brand_id: brand.id },
//       defaults: {
//         gbp_refresh_token: brand.gbp_refresh_token,
//       },
//     });

//     // ✅ 1️⃣ RETURN FROM DB IF EXISTS
//     if (gbpData.gbp_accounts && gbpData.gbp_accounts_synced_at) {
//       return res.json({
//         success: true,
//         source: "db",
//         accounts: gbpData.gbp_accounts,
//       });
//     }

//     // ✅ 2️⃣ GET ACCESS TOKEN
//     const accessToken = await refreshGoogleAccessToken(
//       brand.gbp_refresh_token
//     );

//     // 🚫 NO RETRIES
//     const response = await axios.get(
//       "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
//       {
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//         },
//         timeout: 10000,
//       }
//     );

//     const accounts = response.data.accounts || [];

//     // ✅ 3️⃣ SAVE TO DB (THIS WAS MISSING)
//     await gbpData.update({
//       gbp_accounts: accounts,
//       gbp_accounts_synced_at: new Date(),
//     });

//     return res.json({
//       success: true,
//       source: "google",
//       accounts,
//     });

//   } catch (err) {
//     if (err.response?.status === 429) {
//       return res.status(429).json({
//         success: false,
//         message: "GBP quota hit. Wait 5 minutes. Do NOT retry.",
//       });
//     }

//     console.error("GBP ACCOUNTS ERROR:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch GBP accounts",
//     });
//   }
// };

// exports.startGBPOAuth = async (req, res) => {
//   try {
//     const brand = await Brand.findOne({
//       where: { user_id: req.user.id },
//     });

//     if (!brand) {
//       return res.status(404).json({
//         success: false,
//         message: "Brand not found for user",
//       });
//     }

//     const authUrl = oauth2Client.generateAuthUrl({
//       access_type: "offline",
//       prompt: "consent", // 🔴 REQUIRED
//       scope: ["https://www.googleapis.com/auth/business.manage"],
//       state: JSON.stringify({
//         brandId: brand.id, // ✅ THIS IS CRITICAL
//       }),
//     });

//     return res.redirect(authUrl);
//   } catch (err) {
//     console.error("startGBPOAuth error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to start GBP OAuth",
//     });
//   }
// };
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
    /* ===========================
       1️⃣ FETCH BRAND
    =========================== */
    const brand = await Brand.findOne({
      where: { user_id: req.user.id },
    });

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
      Date.now() - gbp.gbp_accounts_synced_at.getTime() <
        24 * 60 * 60 * 1000
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
    const tokenData = await refreshGoogleAccessToken(
      brand.gbp_refresh_token
    );

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
      }
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
    return res.status(400).json({ success: false, message: "Account not selected" });
  }

  if (gbp.gbp_location_id) {
    return res.json({ success: true, source: "db", location_id: gbp.gbp_location_id });
  }

  const { access_token } = await refreshGoogleAccessToken(brand.gbp_refresh_token);

  const { data } = await axios.get(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${gbp.gbp_account_name}/locations`,
    { headers: { Authorization: `Bearer ${access_token}` } }
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
    return res.status(400).json({ success: false, message: "Location not selected" });
  }

  // ⛔ Allow refresh only once per 24 hours
  if (
    gbp.gbp_insights_synced_at &&
    Date.now() - gbp.gbp_insights_synced_at.getTime() < 24 * 60 * 60 * 1000
  ) {
    return res.status(429).json({
      success: false,
      message: "Insights already refreshed in last 24 hours",
    });
  }

  const { access_token } = await refreshGoogleAccessToken(brand.gbp_refresh_token);

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
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  await gbp.update({
    gbp_insights: data,
    gbp_insights_synced_at: new Date(),
  });

  res.json({ success: true, source: "google", data });
};


//limit excied mail
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
  { type: QueryTypes.SELECT }
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
      }
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
      d => d.yesterday === true && d.today === false
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

    const blocks = drops.map(d => `
      <div style="margin-bottom:16px; padding:12px; border-left:4px solid #dc2626; background:#fef2f2;">
        <p><b>Prompt:</b> ${d.prompt_title}</p>
        <p><b>Platform:</b> ${d.platform}</p>
        <p style="color:#dc2626;">
          <b>Status:</b> ❌ Mention DROPPED (Yesterday → Today)
        </p>
      </div>
    `).join("");

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

// exports.gemailtriggervisibility = async (req, res) => {
//   try {
//     // 🔐 user id from JWT
//     const userId = req.user?.id;

//     if (!userId) {
//       return res.status(401).json({
//         success: false,
//         message: "Unauthorized: user id missing",
//       });
//     }

//     const today = new Date().toISOString().slice(0, 10);
//     const yesterday = new Date(Date.now() - 86400000)
//       .toISOString()
//       .slice(0, 10);

//     /* =========================
//        1️⃣ FETCH DATA USING SEQUELIZE
//     ========================= */
//     const prompts = await Prompt.findAll({
//       where: {
//         userId: userId,
//         [Op.or]: [
//           { is_deleted: false },
//           { is_deleted: null },
//         ],
//       },
//       attributes: ["id", "title"],
//       include: [
//         {
//           model: User,
//            as: "user",
//           attributes: ["username", "email"],
//         },
//         {
//           model: Brand,
//           where: { status: true },
//           attributes: ["brand_name"],
//         },
//         {
//           model: VisibilityLog,
//           required: false,
//           attributes: [
//             "platform",
//             "mentioned",
//             "mentions",
//             "visibility_score",
//             "run_date",
//           ],
//           where: {
//             run_date: {
//               [Op.between]: [
//                 new Date(`${yesterday}T00:00:00`),
//                 new Date(`${today}T23:59:59`),
//               ],
//             },
//           },
//         },
//       ],
//       order: [["id", "ASC"]],
//     });

//     if (!prompts || prompts.length === 0) {
//       return res.json({
//         success: true,
//         message: "No visibility data found",
//       });
//     }

//     /* =========================
//        2️⃣ GROUP + DETECT DROPS
//     ========================= */
//     const map = {};

//     for (const p of prompts) {
//       for (const v of p.VisibilityLogs || []) {
//         const runDay = v.run_date.toISOString().slice(0, 10);
//         const key = `${p.id}|${v.platform}`;

//         if (!map[key]) {
//           map[key] = {
//             email: p.User.email,
//             username: p.User.username,
//             brand: p.Brand.brand_name,
//             prompt_title: p.title,
//             platform: v.platform,
//             today: null,
//             yesterday: null,
//           };
//         }

//         if (runDay === today) {
//           map[key].today = v.mentioned;
//         } else if (runDay === yesterday) {
//           map[key].yesterday = v.mentioned;
//         }
//       }
//     }

//     const drops = Object.values(map).filter(
//       r => r.yesterday === true && r.today === false
//     );

//     if (drops.length === 0) {
//       return res.json({
//         success: true,
//         message: "No visibility drops detected",
//       });
//     }

//     /* =========================
//        3️⃣ BUILD EMAIL
//     ========================= */
//     const brandName = drops[0].brand || "-";
//     const toEmail = drops[0].email;

//     const blocks = drops.map(d => `
//       <div style="margin-bottom:16px; padding:12px; border-left:4px solid #dc2626; background:#fef2f2;">
//         <p><b>Prompt:</b> ${d.prompt_title}</p>
//         <p><b>Platform:</b> ${d.platform}</p>
//         <p style="color:#dc2626;">
//           <b>Status:</b> ❌ Mention DROPPED (Yesterday → Today)
//         </p>
//       </div>
//     `).join("");

//     const html = `
//       <p>Hi ${drops[0].username || ""},</p>

//       <p>
//         ⚠️ <b>Brand Visibility Alert</b><br/>
//         The following mentions have <b>dropped today</b>.
//       </p>

//       <p><b>Brand:</b> ${brandName}</p>

//       ${blocks}

//       <p style="margin-top:24px;">
//         Regards,<br/>
//         <b>Visibility Monitoring System</b>
//       </p>
//     `;

//     /* =========================
//        4️⃣ SEND EMAIL
//     ========================= */
//     await transporter.sendMail({
//       from: `"Visibility Alert" <${process.env.SMTP_USER}>`,
//       to: toEmail,
//       subject: `⚠️ Brand Visibility Drop – ${brandName}`,
//       html,
//     });

//     return res.json({
//       success: true,
//       message: "Visibility drop email sent",
//       email: toEmail,
//       brand: brandName,
//       drops: drops.length,
//     });

//   } catch (error) {
//     console.error("❌ Visibility Email Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };