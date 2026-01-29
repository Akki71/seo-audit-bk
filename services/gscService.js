const axios = require("axios");
const GscSnapshot = require("../models/GscSnapshot");
const { refreshGoogleAccessToken } = require("../utils/googleAuth");

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
    brand.gsc_refresh_token
  );

  const siteUrl = brand.site_url;
  const apiUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl
  )}/searchAnalytics/query`;

  const fetchApi = async (body) => {
    const { data } = await axios.post(apiUrl, body, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
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
     3️⃣ LOOP CHUNKS
  ======================= */
  while (current <= maxAvailableDate) {
    const start = new Date(current);
    const end = new Date(start);
    end.setDate(end.getDate() + CHUNK_SIZE - 1);

    if (end > maxAvailableDate) {
      end.setTime(maxAvailableDate.getTime());
    }

    const startDate = start.toISOString().split("T")[0];
    const endDate = end.toISOString().split("T")[0];

    const exists = await GscSnapshot.findOne({
      where: {
        brand_id: brand.id,
        start_date: startDate,
        end_date: endDate,
      },
    });

    if (exists) {
  //      console.log(
  //   `⏭️ GSC snapshot exists, skipping (${startDate} → ${endDate})`
  // );
      current.setDate(current.getDate() + CHUNK_SIZE);
      continue;
    }

    /* =======================
       4️⃣ SUMMARY
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

    const [web, discover, news] = await Promise.all([
      fetchSummary("web"),
      fetchSummary("discover"),
      fetchSummary("news"),
    ]);

    /* =======================
       5️⃣ TOP QUERIES
    ======================= */
    const queryRes = await fetchApi({
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 10,
      searchType: "web",
    });

    const topKeywords =
      queryRes.rows?.map((r) => ({
        name: r.keys?.[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        percent:
          web.clicks > 0
            ? +((r.clicks / web.clicks) * 100).toFixed(1)
            : 0,
      })) || [];

    /* =======================
       6️⃣ TOP PAGES
    ======================= */
    const pageRes = await fetchApi({
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 10,
      searchType: "web",
    });

    const topPages =
      pageRes.rows?.map((r) => ({
        url: r.keys?.[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
      })) || [];

    /* =======================
       7️⃣ DEVICES
    ======================= */
    const deviceRes = await fetchApi({
      startDate,
      endDate,
      dimensions: ["device"],
      rowLimit: 3,
      searchType: "web",
    });

    const devices =
      deviceRes.rows?.map((r) => ({
        device: r.keys?.[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
      })) || [];

    /* =======================
       8️⃣ COUNTRIES
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
        country: r.keys?.[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
      })) || [];

    /* =======================
       9️⃣ STORE
    ======================= */
    await GscSnapshot.create({
      user_id: userId,
      brand_id: brand.id,
      start_date: startDate,
      end_date: endDate,
      gsc_data: {
        startDate,
        endDate,
        summary: {
          web,
          discover,
          news,
          totalQueries: topKeywords.length,
          totalPages: topPages.length,
        },
        topKeywords,
        topPages,
        topCountries,
        devices,
      },
    });

    storedCount++;
    current.setDate(current.getDate() + CHUNK_SIZE);
  }

  console.log(`✅ GSC Service finished for brand ${brand.id}`);
  return storedCount;
}

module.exports = { collectAndStoreGSCDataForBrand };
