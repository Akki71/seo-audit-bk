const axios = require("axios");
const { refreshGoogleAccessToken } = require("../utils/googleAuth");

const GaOverallData = require("../models/GaOverallData");
const GaSummary = require("../models/GaSummary");
const GaChannels = require("../models/GaChannels");
const GaTopPages = require("../models/GaTopPages");
const GaConversions = require("../models/GaConversions");
const GaTopCountries = require("../models/GaTopCountries");
const GaDevices = require("../models/GaDevices");

async function collectAndStoreGADataForBrand(brand) {
  if (!brand?.id || !brand?.user_id) {
    throw new Error("Invalid brand object");
  }

  console.log(`🔹 GA Service started for brand ${brand.id}`);

  /* =======================
     1️⃣ TOKEN
  ======================= */
  const { access_token } = await refreshGoogleAccessToken(
    brand.ga_refresh_token,
  );
console.log("access_token",access_token);

  if (!access_token) throw new Error("GA access token failed");
  if (!brand.property_id) throw new Error("GA property_id missing");

  const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${brand.property_id}:runReport`;

  const fetchApi = async (body) => {
    const { data } = await axios.post(apiUrl, body, {
      headers: { Authorization: `Bearer ${access_token}` },
      timeout: 30000,
    });
    // console.log("📥 GA RAW RESPONSE");
    // console.log(JSON.stringify(data, null, 2));

    return data;
  };

  /* =======================
     2️⃣ DATE LOGIC
  ======================= */
  const GA_DELAY_DAYS = 2;
  const CHUNK_SIZE = 3;

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() - GA_DELAY_DAYS);
  maxDate.setHours(0, 0, 0, 0);

  const START_DATE = new Date("2025-11-10");
  START_DATE.setHours(0, 0, 0, 0);

  let current = new Date(START_DATE);
  let storedCount = 0;
  let skippedCount = 0;

  /* =======================
     3️⃣ LOOP
  ======================= */
  while (current <= maxDate) {
    const start = new Date(current);
    const end = new Date(start);
    end.setDate(end.getDate() + CHUNK_SIZE - 1);
    if (end > maxDate) end.setTime(maxDate.getTime());

    const startDate = start.toISOString().split("T")[0];
    const endDate = end.toISOString().split("T")[0];

    console.log(`📆 ${startDate} → ${endDate}`);

    /* =======================
       4️⃣ SKIP IF EXISTS
    ======================= */
    const exists = await GaOverallData.findOne({
      where: {
        brand_id: brand.id,
        start_date: startDate,
        end_date: endDate,
      },
    });

    if (exists) {
      console.log(
        `⏭️ GA slot already exists | Brand: ${brand.id} | ${startDate} → ${endDate} | skipped`,
      );
      skippedCount++;
      current.setDate(current.getDate() + CHUNK_SIZE);
      continue;
    }

    /* =======================
       5️⃣ CREATE PARENT
    ======================= */
    const overall = await GaOverallData.create({
      brand_id: brand.id,
      user_id: brand.user_id,
      start_date: startDate,
      end_date: endDate,
    });

    const gaOverallId = overall.id;

    /* =======================
       6️⃣ SUMMARY
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

    await GaSummary.create({
      ga_overall_id: gaOverallId,
      sessions: +m[0]?.value || 0,
      total_users: +m[1]?.value || 0,
      screen_page_views: +m[2]?.value || 0,
      bounce_rate: m[3]?.value ? +(parseFloat(m[3].value) * 100).toFixed(2) : 0,
      average_session_duration: +m[4]?.value || 0,
    });

    /* =======================
       7️⃣ CONVERSIONS
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

    await GaConversions.create({
      ga_overall_id: gaOverallId,
      transactions: +c[0]?.value || 0,
      total_revenue: +c[1]?.value || 0,
      session_conversion_rate: c[2]?.value
        ? +(parseFloat(c[2].value) * 100).toFixed(2)
        : 0,
      average_purchase_revenue: +c[3]?.value || 0,
    });

    /* =======================
       8️⃣ TOP PAGES
    ======================= */
    const pageRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      limit: 10,
    });
    await GaTopPages.bulkCreate(
      pageRes.rows?.map((r) => ({
        ga_overall_id: gaOverallId,
        page_path: r.dimensionValues?.[0]?.value,
        screen_page_views: +r.metricValues?.[0]?.value || 0,
      })) || [],
    );

    /* =======================
       9️⃣ COUNTRIES
    ======================= */
    const countryRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "sessions" }],
    });

    // await GaTopCountries.bulkCreate(
    //   countryRes.rows?.map((r) => ({
    //     ga_overall_id: gaOverallId,
    //     key: r.value,
    //     // sessions: +r.metricValues?.[0]?.value || 0,
    //   })) || [],
    // );
await GaTopCountries.bulkCreate(
  (countryRes.rows || []).map((r) => ({
    ga_overall_id: gaOverallId,
    keys: r.keys?.[0] || "",
    sessions: r.clicks || 0,   // GA clicks → sessions
    ctr: r.ctr || 0,
    position: r.position || 0,
  })),
  { ignoreDuplicates: true }
);

    /* =======================
       🔟 DEVICES
    ======================= */
    const deviceRes = await fetchApi({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
    });

    await GaDevices.bulkCreate(
      deviceRes.rows?.map((r) => ({
        ga_overall_id: gaOverallId,
        device_category: r.dimensionValues?.[0]?.value,
        sessions: +r.metricValues?.[0]?.value || 0,
      })) || [],
    );

    /* =======================
       1️⃣1️⃣ CHANNELS
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

    await GaChannels.bulkCreate(
      channelRes.rows?.map((r) => ({
        ga_overall_id: gaOverallId,
        session_default_channel_group: r.dimensionValues?.[0]?.value,
        total_users: +r.metricValues?.[0]?.value || 0,
        sessions: +r.metricValues?.[1]?.value || 0,
        average_session_duration: +r.metricValues?.[2]?.value || 0,
      })) || [],
    );

    console.log("💾 GA data stored");
    storedCount++;
    current.setDate(current.getDate() + CHUNK_SIZE);
  }

  console.log(
    `📊 GA Result | Stored: ${storedCount} | Skipped: ${skippedCount}`,
  );
  console.log(`✅ GA Service finished for brand ${brand.id}`);

  return storedCount;
}

module.exports = { collectAndStoreGADataForBrand };
