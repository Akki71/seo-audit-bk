const axios = require("axios");
const { refreshGoogleAccessToken } = require("../utils/googleAuth");

const GscOverallData = require("../models/GscOverallData");
const GscSummary = require("../models/GscSummary");
const GscDevices = require("../models/GscDevices");
const GscTopPages = require("../models/GscTopPages");
const GscTopKeywords = require("../models/GscTopKeywords");
const GscTopCountries = require("../models/GscTopCountries");

async function collectAndStoreGSCDataForBrand(brand) {
  if (!brand || !brand.id || !brand.user_id) {
    throw new Error("Invalid brand object passed to GSC service");
  }

  const userId = brand.user_id;
  console.log(`🔹 GSC Service started for brand ${brand.id}`);

  /* =======================
     1️⃣ TOKEN
  ======================= */
  const { access_token } = await refreshGoogleAccessToken(
    brand.gsc_refresh_token,
  );
  console.log("access_tokenvvvvv", access_token);

  const siteUrl = brand.site_url;
  const apiUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl,
  )}/searchAnalytics/query`;

  const fetchApi = async (body) => {
    const { data } = await axios.post(apiUrl, body, {
      headers: { Authorization: `Bearer ${access_token}` },
      timeout: 30000,
    });
    return data;
  };

  /* =======================
     2️⃣ DATE RULES
  ======================= */
  const GSC_DELAY_DAYS = 2;
  const CHUNK_SIZE = 3;

  const maxAvailableDate = new Date();
  maxAvailableDate.setDate(maxAvailableDate.getDate() - GSC_DELAY_DAYS);
  maxAvailableDate.setHours(0, 0, 0, 0);

  const START_DATE = new Date("2025-11-10");
  START_DATE.setHours(0, 0, 0, 0);

  let current = new Date(START_DATE);
  let storedCount = 0;

  /* =======================
     3️⃣ LOOP DATE CHUNKS
  ======================= */
  while (current <= maxAvailableDate) {
    const start = new Date(current);
    const end = new Date(start);
    end.setDate(end.getDate() + CHUNK_SIZE - 1);
    if (end > maxAvailableDate) end.setTime(maxAvailableDate.getTime());

    const startDate = start.toISOString().split("T")[0];
    const endDate = end.toISOString().split("T")[0];

    console.log(`📆 GSC RANGE: ${startDate} → ${endDate}`);

    /* =======================
       4️⃣ CREATE / GET OVERALL
    ======================= */
    const [overall, created] = await GscOverallData.findOrCreate({
      where: {
        brand_id: brand.id,
        start_date: startDate,
        end_date: endDate,
      },
      defaults: {
        user_id: userId,
      },
    });

    if (!created) {
      console.log(
        `⏭️ GSC slot already exists | Brand: ${brand.id} | ${startDate} → ${endDate} | skipped`,
      );
    }

    const gscOverallId = overall.id;

    /* =======================
       5️⃣ SUMMARY (FIXED)
    ======================= */
    const fetchSummary = async (searchType) => {
      const res = await fetchApi({
        startDate,
        endDate,
        dimensions: [],
        searchType,
      });

      const row = res.rows?.[0] || {};
      return {
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr ? +(row.ctr * 100).toFixed(2) : 0,
        position: row.position || 0,
      };
    };

    const web = await fetchSummary("web");

    await GscSummary.upsert({
      gsc_overall_id: gscOverallId,
      summary_name: "web", // ✅ REQUIRED FIX
      clicks: web.clicks,
      impressions: web.impressions,
      ctr: web.ctr,
      position: web.position,
    });

    /* =======================
       6️⃣ TOP KEYWORDS
    ======================= */
    const queryRes = await fetchApi({
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 2000,
      searchType: "web",
    });

    const topKeywords =
      queryRes.rows?.map((r) => ({
        keys: r.keys?.[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        // percent:
        //   web.clicks > 0 ? +((r.clicks / web.clicks) * 100).toFixed(1) : 0,
        ctr: r.ctr || 0,
        position: r.position || 0,
      })) || [];

    if (topKeywords.length) {
      await GscTopKeywords.bulkCreate(
        topKeywords.map((k) => ({
          gsc_overall_id: gscOverallId,
          keys: k.keys,
          clicks: k.clicks,
          impressions: k.impressions,
          ctr: k.ctr || 0,
          position: k.position || 0,
        })),
        {
          updateOnDuplicate: ["clicks", "impressions", "percent"],
        },
      );
    }

    /* =======================
       7️⃣ TOP PAGES
    ======================= */
    const pageRes = await fetchApi({
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 50,
    });

    const topPages =
      pageRes.rows?.map((r) => ({
        keys: r.keys?.[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        ctr: r.ctr || 0,
        position: r.position || 0,
      })) || [];

    if (topPages.length) {
      await GscTopPages.bulkCreate(
        topPages.map((p) => ({
          gsc_overall_id: gscOverallId,
          keys: p.keys,
          clicks: p.clicks,
          impressions: p.impressions,
          ctr: p.ctr,
          position: p.position,
        })),
        {
          updateOnDuplicate: ["clicks", "impressions"],
        },
      );
    }

    /* =======================
       8️⃣ DEVICES
    ======================= */
    const deviceRes = await fetchApi({
      startDate,
      endDate,
      dimensions: ["device"],
      rowLimit: 3,
    });

    const devices =
      deviceRes.rows?.map((r) => ({
        keys: r.keys?.[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        ctr: r.ctr || 0,
        position: r.position || 0,
      })) || [];

    if (devices.length) {
      await GscDevices.bulkCreate(
        devices.map((d) => ({
          gsc_overall_id: gscOverallId,
          keys: d.keys,
          clicks: d.clicks,
          impressions: d.impressions,
          ctr: d.ctr,
          position: d.position,
        })),
        {
          updateOnDuplicate: ["clicks", "impressions","ctr","position"],
        },
      );
    }

    /* =======================
       9️⃣ COUNTRIES
    ======================= */
    const countryRes = await fetchApi({
      startDate,
      endDate,
      dimensions: ["country"],
      rowLimit: 10,
      searchType: "web",
    });

    const topCountries =
      countryRes.rows?.map((r) => ({
        keys: r.keys?.[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        ctr: r.ctr,
        position: r.position,
      })) || [];

    if (topCountries.length) {
      await GscTopCountries.bulkCreate(
        topCountries.map((c) => ({
          gsc_overall_id: gscOverallId,
          keys: c.keys,
          clicks: c.clicks,
          impressions: c.impressions,
          ctr: c.ctr,
          position: c.position,
        })),
        {
          updateOnDuplicate: ["clicks", "impressions","ctr","position"],
        },
      );
    }

    storedCount++;
    current.setDate(current.getDate() + CHUNK_SIZE);
  }

  console.log(`✅ GSC Service finished for brand ${brand.id}`);
  return storedCount;
}

module.exports = { collectAndStoreGSCDataForBrand };
