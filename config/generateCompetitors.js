const competitorAgents = require("./competitorAgents");

function safeJSONParse(str) {
  try {
    const cleaned = str
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return [];
  }
}

function mergeCompetitors(arrays) {
  const map = new Map();

  arrays.flat().forEach(item => {
    if (!item?.competitor_name) return;

    const key = item.competitor_name.trim().toLowerCase();

    if (!map.has(key)) {
      map.set(key, item);
    }
  });

  return [...map.values()];
}

async function generateCompetitors({ brand_name, keywords, cities ,region}) {

  const prompt = `
    Brand: ${brand_name}
    Keywords: ${JSON.stringify(keywords)}
    ${cities ? `Cities: ${JSON.stringify(cities)}` : ""}
    Regions: ${region && region.length ? JSON.stringify(region) : "[]"}
    Generate exactly 10 competitor brands relevant to the given brand, keywords,  ${cities ?"cities":""}, and regions.

    Generate exactly 10 competitor brands in this JSON format:
    [
      {
        "competitor_name": "Brand",
        "domain": "brand.com",
        "keywords": ["k1","k2"],
        "image_url": "https://www.google.com/s2/favicons?domain=brand.com"
      }
    ]

    Do NOT include explanations.
    Return ONLY JSON.
  `;
console.log("prompt",prompt)
  const allResults = [];

  for (const agent of competitorAgents) {
    try {
      const response = await agent.generate(prompt);
      const parsed = safeJSONParse(response);
    
      if (Array.isArray(parsed)) {
        allResults.push(parsed);
      }

    } catch (err) {
      console.error(`AI Error from ${agent.name}:`, err.message);
    }
  }

  return mergeCompetitors(allResults);
}

module.exports = { generateCompetitors };
