const axios = require("axios");
const GaSnapshot = require("../models/GaSnapshot");
const { refreshGoogleAccessToken } = require("../utils/googleAuth");

async function collectAndStoreGADataForBrand(brand) {
  if (!brand || !brand.id || !brand.user_id) {
    throw new Error("Invalid brand object passed to GA service");
  }

  const userId = brand.user_id;
  console.log(`🔹 GA Service started for brand ${brand.id}`);

  /* =======================
     1️⃣ TOKEN
  ======================= */
  const { access_token } = await refreshGoogleAccessToken(
    brand.ga_refresh_token
  );

  if (!access_token) throw new Error("Failed to get GA access token");
  if (!brand.property_id) throw new Error("GA property_id missing for brand");

  const propertyPath = `properties/${brand.property_id}`;
  const apiUrl = `https://analyticsdata.googleapis.com/v1beta/${propertyPath}:runReport`;

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
  const GA_DELAY_DAYS = 2;
  const CHUNK_SIZE = 3;

  const maxAvailableDate = new Date();
  maxAvailableDate.setDate(maxAvailableDate.getDate() - GA_DELAY_DAYS);
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
    if (end > maxAvailableDate) end.setTime(maxAvailableDate.getTime());

    const startDate = start.toISOString().split("T")[0];
    const endDate = end.toISOString().split("T")[0];

    console.log(`📆 GA RANGE: ${startDate} → ${endDate}`);

    const exists = await GaSnapshot.findOne({
      where: { brand_id: brand.id, start_date: startDate, end_date: endDate },
    });

    if (exists) {
      current.setDate(current.getDate() + CHUNK_SIZE);
      continue;
    }

    /* =======================
       4️⃣ SUMMARY
    ======================= */
    const summaryRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "screenPageViews" },
        { name: "bounceRate" },
        { name: "averageSessionDuration" },
      ],
    });

    const m = summaryRes.rows?.[0]?.metricValues || [];
    const summary = {
      sessions: +m[0]?.value || 0,
      users: +m[1]?.value || 0,
      pageViews: +m[2]?.value || 0,
      bounceRate: m[3]?.value ? +(parseFloat(m[3].value) * 100).toFixed(2) : 0,
      avgSessionDuration: +m[4]?.value || 0,
    };

    /* =======================
       5️⃣ CONVERSIONS
    ======================= */
    const conversionRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "transactions" },
        { name: "totalRevenue" },
        { name: "sessionConversionRate" },
        { name: "averagePurchaseRevenue" },
      ],
    });

    const c = conversionRes.rows?.[0]?.metricValues || [];
    const conversions = {
      transactions: +c[0]?.value || 0,
      revenue: +c[1]?.value || 0,
      conversionRate: c[2]?.value
        ? +(parseFloat(c[2].value) * 100).toFixed(2)
        : 0,
      avgOrderValue: +c[3]?.value || 0,
    };

    /* =======================
       6️⃣ TOP PAGES
    ======================= */
    const pageRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      limit: 10,
    });

    const topPages =
      pageRes.rows?.map(r => ({
        path: r.dimensionValues?.[0]?.value,
        views: +r.metricValues?.[0]?.value || 0,
      })) || [];

    /* =======================
       7️⃣ COUNTRIES
    ======================= */
    const countryRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "sessions" }],
      limit: 10,
    });

    const topCountries =
      countryRes.rows?.map(r => ({
        country: r.dimensionValues?.[0]?.value,
        sessions: +r.metricValues?.[0]?.value || 0,
      })) || [];

    /* =======================
       8️⃣ DEVICES
    ======================= */
    const deviceRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
    });

    const devices =
      deviceRes.rows?.map(r => ({
        device: r.dimensionValues?.[0]?.value,
        sessions: +r.metricValues?.[0]?.value || 0,
      })) || [];

    /* =======================
       9️⃣ CONVERSION SOURCES
    ======================= */
    const sourceRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
      ],
      metrics: [
        { name: "transactions" },
        { name: "totalRevenue" },
      ],
      orderBys: [
        { metric: { metricName: "transactions" }, desc: true },
      ],
      limit: 10,
    });

    const conversionSources =
      sourceRes.rows?.map(r => ({
        source: r.dimensionValues?.[0]?.value,
        medium: r.dimensionValues?.[1]?.value,
        transactions: +r.metricValues?.[0]?.value || 0,
        revenue: +r.metricValues?.[1]?.value || 0,
      })) || [];

    /* =======================
       🔟 CHANNEL BREAKDOWN
    ======================= */
    const channelRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [
        { name: "totalUsers" },
        { name: "sessions" },
        { name: "averageSessionDuration" },
      ],
    });

    const channels =
      channelRes.rows?.map(r => ({
        channel: r.dimensionValues?.[0]?.value,
        users: +r.metricValues?.[0]?.value || 0,
        sessions: +r.metricValues?.[1]?.value || 0,
        avgSessionDuration: +r.metricValues?.[2]?.value || 0,
      })) || [];

    /* =======================
       1️⃣1️⃣ STORE
    ======================= */
    await GaSnapshot.create({
      user_id: userId,
      brand_id: brand.id,
      start_date: startDate,
      end_date: endDate,
      ga_data: {
        startDate,
        endDate,
        summary,
        conversions,
        conversionSources,
        channels,
        topPages,
        topCountries,
        devices,
      },
    });

    console.log("💾 GA snapshot stored");
    storedCount++;
    current.setDate(current.getDate() + CHUNK_SIZE);
  }

  console.log(`✅ GA Service finished for brand ${brand.id}`);
  return storedCount;
}

module.exports = { collectAndStoreGADataForBrand };
