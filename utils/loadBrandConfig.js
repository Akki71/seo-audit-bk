// // utils/loadBrandConfig.js
// const { Brand, Competitor } = require("../models"); 
// const { Op } = require("sequelize");

// const AUTHORITY_DOMAINS = [
//   "healthline.com",
//   "mayoclinic.org",
//   "apollo247.com",
//   "unilever.com"
// ];

// /**
//  * Dynamically load brand and competitor data for a specific user
//  * @param {number} userId
//  * @returns {object} { BRANDS, DOMAIN_TO_BRAND, BRAND_DOMAINS, COMPETITOR_DOMAINS, AUTHORITY_DOMAINS }
//  */
// async function loadBrandConfig(userId) {
//   if (!userId) throw new Error("User ID is required to load brand config");

//   const brandRecords = await Brand.findAll({ where: { user_id: userId } });

//   const BRANDS = [];
//   const DOMAIN_TO_BRAND = {};
//   const BRAND_DOMAINS = [];

//   for (const b of brandRecords) {
//     const keywords = Array.isArray(b.keywords) ? b.keywords : JSON.parse(b.keywords || "[]");
//     const domains = Array.isArray(b.domain) ? b.domain : JSON.parse(b.domain || "[]");

//     BRANDS.push({
//       name: b.brand_name,
//       keywords,
//     });

//     for (const domain of domains) {
//       DOMAIN_TO_BRAND[domain] = b.brand_name;
//       BRAND_DOMAINS.push(domain);
//     }
//   }

//   const competitors = await Competitor.findAll({ where: { user_id: userId } });
//   const COMPETITOR_DOMAINS = competitors.flatMap(c => {
//     try {
//       return Array.isArray(c.domains) ? c.domains : JSON.parse(c.domains || "[]");
//     } catch {
//       return [];
//     }
//   });

//   return {
//     BRANDS,
//     DOMAIN_TO_BRAND,
//     BRAND_DOMAINS,
//     COMPETITOR_DOMAINS,
//     AUTHORITY_DOMAINS,
//   };
// }

// module.exports = { loadBrandConfig };


const { Brand, Competitor } = require("../models");
const { Op } = require("sequelize");

const AUTHORITY_DOMAINS = [
  "healthline.com",
  "mayoclinic.org",
  "apollo247.com",
  "unilever.com",
];

/**
 * Load brand & competitor data for the given user.
 */
// async function loadBrandConfig(userId) {
//   if (!userId) throw new Error("User ID is required to load brand config");

//   const brandRecords = await Brand.findAll({ where: { user_id: userId } });
//   const BRANDS = [];
//   const DOMAIN_TO_BRAND = {};
//   const BRAND_DOMAINS = [];

//   for (const b of brandRecords) {
//     const keywords = safeParse(b.keywords);
//     const domains = safeParse(b.domain);

//     BRANDS.push({
//       name: b.brand_name,
//       keywords,
//       domains,
//     });

//     for (const domain of domains) {
//       DOMAIN_TO_BRAND[domain.toLowerCase()] = b.brand_name;
//       BRAND_DOMAINS.push(domain.toLowerCase());
//     }
//   }

//   const competitors = await Competitor.findAll({ where: { user_id: userId } });
//   const COMPETITORS = competitors.map((c) => ({
//     name: c.competitor_name,
//     keywords: safeParse(c.keywords),
//     domains: safeParse(c.domains),
//   }));

//   const COMPETITOR_DOMAINS = COMPETITORS.flatMap((c) => c.domains || []);

//   return {
//     BRANDS,
//     DOMAIN_TO_BRAND,
//     BRAND_DOMAINS,
//     COMPETITOR_DOMAINS,
//     COMPETITORS,
//     AUTHORITY_DOMAINS,
//   };
// }

async function loadBrandConfig(userId) {
  if (!userId) throw new Error("User ID is required to load brand config");

  // ---------------------------
  // LOAD USER BRAND DETAILS
  // ---------------------------
  const brandRecords = await Brand.findAll({ where: { user_id: userId } });

  const BRANDS = [];
  const DOMAIN_TO_BRAND = {};
  const BRAND_DOMAINS = [];

  for (const b of brandRecords) {
    const domains = safeParse(b.domain); // ARRAY of domains

    BRANDS.push({
      name: b.brand_name,   // Brand name
      domains,              // Brand domains
    });

    // Map every domain → brand_name
    for (const d of domains) {
      const domain = d.toLowerCase().trim();
      DOMAIN_TO_BRAND[domain] = b.brand_name.toLowerCase();
      BRAND_DOMAINS.push(domain);
    }
  }

  // ---------------------------
  // LOAD COMPETITORS
  // ---------------------------
  const competitors = await Competitor.findAll({
    where: { user_id: userId }
  });

  const COMPETITORS = competitors.map((c) => ({
    name: c.competitor_name,
    domains: safeParse(c.domains),
  }));

  const COMPETITOR_DOMAINS = COMPETITORS.flatMap((c) =>
    (c.domains || []).map((d) => d.toLowerCase().trim())
  );

  // ---------------------------
  // RETURN CONFIG
  // ---------------------------
  return {
    BRANDS,                 
    DOMAIN_TO_BRAND,        
    BRAND_DOMAINS,          
    COMPETITORS,
    COMPETITOR_DOMAINS,     
    AUTHORITY_DOMAINS,     
  };
}

function safeParse(value) {
  try {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return JSON.parse(value);
  } catch {
    return [];
  }
}

module.exports = { loadBrandConfig };

