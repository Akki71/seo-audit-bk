
const Domain = require("../models/Domain");
const Links = require("../models/link");
const { DOMAIN_TO_BRAND, BRANDS, classifyDomain } = require("../config/brands");
const {
  computeRankScore,
  computeVisibilityScore,
  getHostname,
} = require("./serpHelpers");
const logVisibility = require("./logVisibility");

module.exports = async function runSerp({
  promptId,
  title,
  userId,
  region,
  cities = [],
  country_code,
}) {
  let query = title;

  // Add region
  if (region) query += ` ${region}`;

  // Add cities
  if (Array.isArray(cities) && cities.length > 0) {
    query += ` ${cities.join(" ")}`;
  }
//serpdata 
  // const results = await new Promise((resolve, reject) => {
  //   googleClient.json(
  //     { engine: "google", q: query, hl: "en", gl: country_code? country_code.toLowerCase() :"in" },
  //     (data) => {
  //       if (data?.error) return reject(data.error);
  //       resolve(data?.organic_results || []);
  //     }
  //   );
  // });
  //serpdata end

  //ankiata START ( BRIHGT DATA FREE) 
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(
    query
  )}&hl=en&gl=${country_code ? country_code.toLowerCase() : "in"}`;
  const payload = {
    zone: process.env.BRIGHT_DATA_ZONE,
    url: googleUrl,
     format: "raw",
  };
  const triggerUrl = "https://api.brightdata.com/request";
  let results = [];
  try {
    // console.log(" Bright Data Request:", {
    //   zone: payload.zone,
    //   url: payload.url,
    // });

    const response = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.BRIGHT_DATA_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    // console.log(
    //   " Bright Data Response Keys:",
    //   Object.keys(data || {})
    // );

    if (!data || data.status === "error") {
      throw new Error(data?.message || "Bright Data Error");
    }
    // console.log(
    //   " Organic Results Count:",
    //   data?.organic?.length || 0
    // );
    const organic = data?.organic || [];

    results = organic.map((item, index) => ({
      title: item.title || "",
      link: item.link || "",
      position: item.position || index + 1,
      snippet: item.snippet || "",
    }));
//     console.log(
//   " Generated Links JSON:",
//   JSON.stringify(results, null, 2)
// );
  } catch (err) {
    console.error("Bright Data Fetch Failed:", err.message);
    return [];
  }
  //ANKITA END 
  
  const serpHitsByBrand = {};
  BRANDS.forEach((b) => (serpHitsByBrand[b.name] = 0));

  const formatted = [];
  for (const item of results) {
    if (!item.link) continue;

    const domain = getHostname(item.link);
    const type = classifyDomain(domain);

    const rankScore = computeRankScore(item.position);
    const visibilityScore = computeVisibilityScore(
      rankScore,
      item.title,
      query
    );

    await Links.create({
      link: item.link,
      redirect_link: item.link || "",
      user_id: userId,
      prompt_id: promptId,
    }).catch(() => { });

    const existing = await Domain.findOne({ where: { link: domain } });
    if (existing) {
      await existing.update({
        count: (existing.count || 0) + 1,
        rank_score: rankScore,
        visibility_score: visibilityScore,
        type,
      });
    } else {
      await Domain.create({
        link: domain,
        count: 1,
        rank_score: rankScore,
        visibility_score: visibilityScore,
        type,
      });
    }

    const mappedBrand = DOMAIN_TO_BRAND[domain];
    if (mappedBrand) serpHitsByBrand[mappedBrand]++;

    formatted.push({
      ...item,
      domain,
      type,
      rankScore,
      visibilityScore,
    });
  }

  return formatted;
};
