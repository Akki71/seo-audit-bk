const axios = require("axios");

async function refreshGoogleAccessToken(refresh_token) {
  if (!refresh_token) throw new Error("refresh_token is required");

  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    refresh_token,
    grant_type: "refresh_token",
    include_granted_scopes: "true",
  });

  try {
    const { data } = await axios.post(
      "https://oauth2.googleapis.com/token",
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return data;
  } catch (err) {
    const info = err.response?.data || err.message;
    console.error("refreshGoogleAccessToken failed:", info);
    throw new Error(
      err.response?.data?.error_description || "Failed to refresh token"
    );
  }
}

exports.getGASeoData = async ({ refreshToken, propertyId, startDate,endDate }) => {
  try {
    const accessToken = await refreshGoogleAccessToken(refreshToken);

    const access_token = accessToken.access_token;        

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
        { name: "sessionConversionRate" }, // ✅ CORRECT
        { name: "conversions" }   
      ],
    });

        const values = overviewReport.rows?.[0]?.metricValues ?? [];

     const finalData = {
      sessions: Number(values[0]?.value ?? 0),
      pageviews: Number(values[1]?.value ?? 0),

      avgSessionDurationMinutes: Number(
        (Number(values[2]?.value ?? 0) / 60).toFixed(2)
      ),

      bounceRatePercent: Number(
        (Number(values[3]?.value ?? 0) * 100).toFixed(2)
      ),

      sessionConversionRatePercent: Number(
        (Number(values[4]?.value ?? 0) * 100).toFixed(2)
      ),

      totalConversions: Number(values[5]?.value ?? 0),
    };
    return finalData;

  } catch (err) {
    console.error("GA SEO Error:", err.message);
    return { summary: {}, topLandingPages: [] };
  }
};

exports.getGSCSeoData = async ({ refreshToken, siteUrl, startDate,endDate}) => {
  try {
       const getToken = await refreshGoogleAccessToken(refreshToken);
    const access_token = getToken.access_token;



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
    const fetchSearchTypeData = async (searchType) => {
      try {
        const response = await fetchApi({
          startDate,
          endDate,
          dimensions: [],
          searchType,
        });

        const row = response.rows?.[0] || {};
console.log("row data",searchType, row);
        return {
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr ? Number((row.ctr * 100).toFixed(2)) : 0,
          avg_position: row.position || 0,
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
      rowLimit: 10
    });

    const pageResponse = await fetchApi({
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 10,
      searchType: "web",
    });

    const [webSummary] = await Promise.all([
      fetchSearchTypeData("web")
    ]);

    const gscData = await axios.post(
    url,
    {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 5000,
    },
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    }
  );

    const rows = gscData.data.rows || [];
    // ---------- TOP QUERIES ----------
    const topQueries =
      queryResponse.rows?.map((r) => {
        const clicks = r.clicks ?? 0;
        return {
          name: r.keys?.[0] ?? "Unknown",
          clicks,
          impressions: r.impressions ?? 0,
          avgPosition: r.avgPosition ?? 0,
          ctr: r.ctr ? Number((r.ctr * 100).toFixed(2)) : 0,
          percent:
            webSummary.clicks > 0
              ? ((clicks / webSummary.clicks) * 100).toFixed(1)
              : "0",
        };
      }) ?? [];


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



    // ---------- FINAL RESPONSE ----------

    const finalData = {
      summary: {
        web: webSummary,
        totalQueries: topQueries.length,
        totalPages: topPages.length,
        startDate,
        endDate,
      },
      topQueries,
      topPages,
      gscPageData :{
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    ctr:
      rows.reduce((s, r) => s + r.ctr * r.impressions, 0) /
      (rows.reduce((s, r) => s + r.impressions, 0) || 1),
    avgPosition:
      rows.reduce((s, r) => s + r.position * r.impressions, 0) /
      (rows.reduce((s, r) => s + r.impressions, 0) || 1),
    keywordCount: rows.length,
    keywords: rows.slice(0, 20),
  }
    };


    return finalData

  } catch (err) {
    console.error("GSC SEO Error:", err.message);
    return { summary: {}, topPages: [] };
  }
};
const MOZ_API_KEY = "bW96c2NhcGUtOVhNSTg2ZXdqaDpNdGF2YU9zNVh4a3Jsd2hRaFpjMGRZQ1JIaGg1YVYySg==";

exports.getGSCDataAndSEOOverview = async ({
  siteUrl,        
  refreshToken,       
  startDate,   
  endDate  
}) => {

    const getToken = await refreshGoogleAccessToken(refreshToken);
    const access_token = getToken.access_token;
  // -----------------------------
  // 1️⃣ GOOGLE SEARCH CONSOLE
  // -----------------------------
  const gscUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl
  )}/searchAnalytics/query`;

  const gscRes = await axios.post(
    gscUrl,
    {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 1000
    },
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const rows = gscRes.data.rows || [];

  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);

  const avgCTR =
    rows.reduce((s, r) => s + r.ctr * r.impressions, 0) /
    (totalImpressions || 1);

  const avgPosition =
    rows.reduce((s, r) => s + r.position * r.impressions, 0) /
    (totalImpressions || 1);

  const lowCTRKeywords = rows.filter(
    r => r.impressions > 1000 && r.ctr < 0.01 && r.position <= 10
  );

  const nearTop10Keywords = rows.filter(
    r => r.position >= 4 && r.position <= 10
  );

  // -----------------------------
  // 2️⃣ MOZ DATA
  // -----------------------------
  const mozRes = await axios.post(
    "https://lsapi.seomoz.com/v2/url_metrics",
    {
      targets: [siteUrl]
    },
    {
      headers: {
        Authorization: `Basic ${MOZ_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const moz = mozRes.data.results[0];

  // -----------------------------
  // 3️⃣ FINAL RESPONSE (Dashboard)
  // -----------------------------
  return {
    overview: {
      organicTraffic: totalClicks,
      impressions: totalImpressions,
      ctr: +(avgCTR * 100).toFixed(2),
      avgPosition: +avgPosition.toFixed(2),
      organicKeywords: rows.length
    },

    seoAuthority: {
      domainAuthority: moz.domain_authority,
      pageAuthority: moz.page_authority,
      spamScore: moz.spam_score
    },

    links: {
      backlinks: moz.pages_to_root_domain,
      referringDomains: moz.root_domains_to_root_domain,
      nofollowLinks: moz.nofollow_pages_to_root_domain
    },

    opportunities: {
      lowCTRKeywords: lowCTRKeywords.length,
      nearTop10Keywords: nearTop10Keywords.length
    },

    topKeywords: rows
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 20)
      .map(r => ({
        keyword: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: +(r.ctr * 100).toFixed(2),
        position: +r.position.toFixed(2)
      }))
  };
}
