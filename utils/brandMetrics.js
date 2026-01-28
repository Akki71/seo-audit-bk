// utils/brandMetrics.js
// const { BRANDS } = require("../config/brands");

// function countMentionsByBrand(text) {
//   const lower = (text || "").toLowerCase();

//   return BRANDS.map((brandObj) => {
//     let count = 0;
//     for (const keyword of brandObj.keywords) {
//       const regex = new RegExp(`\\b${keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "g");
//       const matches = lower.match(regex);
//       if (matches) count += matches.length;
//     }
//     return { brand: brandObj.name, count };
//   });
// }

// module.exports = { countMentionsByBrand };

// // utils/brandMetrics.js
// const { loadBrandConfig } = require("./loadBrandConfig");

// /**
//  * Count brand mentions dynamically for the logged-in user's brands
//  * @param {string} text
//  * @param {number} userId
//  */
// async function countMentionsByBrand(text, userId) {
//   const lower = (text || "").toLowerCase();

//   // 🔹 Dynamically fetch user's brands
//   const { BRANDS } = await loadBrandConfig(userId);

//   return BRANDS.map((brandObj) => {
//     let count = 0;
//     for (const keyword of brandObj.keywords) {
//       const regex = new RegExp(
//         `\\b${keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
//         "g"
//       );
//       const matches = lower.match(regex);
//       if (matches) count += matches.length;
//     }
//     return { brand: brandObj.name, count };
//   });
// }

// module.exports = { countMentionsByBrand };


const { loadBrandConfig } = require("./loadBrandConfig");

// async function analyzeMentions(text, userId) {
//   const lowerText = (text || "").toLowerCase();
//   const { BRANDS, COMPETITORS } = await loadBrandConfig(userId);

//   const counts = [];
//   let totalMentions = 0;

//   // Check user brands
//   for (const brand of BRANDS) {
//     let count = 0;
//     const allKeywords = [
//       brand.name,
//       ...(Array.isArray(brand.keywords) ? brand.keywords : []),
//       ...(Array.isArray(brand.domains) ? brand.domains : []),
//     ];

//     for (const keyword of allKeywords) {
//       const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//       const regex = new RegExp(`\\b${escaped}\\b`, "gi");
//       const matches = lowerText.match(regex);
//       if (matches) count += matches.length;
//     }

//     counts.push({ brand: brand.name, count });
//     totalMentions += count;
//   }

//   // Check competitor mentions
//   const otherMentions = [];
//   for (const comp of COMPETITORS) {
//     let count = 0;
//     const allCompKeys = [
//       comp.name,
//       ...(Array.isArray(comp.keywords) ? comp.keywords : []),
//       ...(Array.isArray(comp.domains) ? comp.domains : []),
//     ];

//     for (const keyword of allCompKeys) {
//       const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//       const regex = new RegExp(`\\b${escaped}\\b`, "gi");
//       const matches = lowerText.match(regex);
//       if (matches) count += matches.length;
//     }

//     if (count > 0) otherMentions.push(comp.name);
//   }

//   const userMentionedBrands = counts.filter((b) => b.count > 0).map((b) => b.brand);
//   const mentioned = userMentionedBrands.length > 0;

//   return {
//     totalMentions,
//     userMentionedBrands,
//     otherMentionedBrands: otherMentions,
//     mentioned,
//   };
// }

// pranav changes => two word sorting 
async function analyzeMentions(text, userId) {
  const lowerText = (text || "").toLowerCase();
  const { BRANDS, COMPETITORS } = await loadBrandConfig(userId);

  const STOP_WORDS = ["the", "of", "in", "and", "for", "by", "to"];

  function buildKeywords(brand) {
    const fullName = typeof brand.name === 'string' ? brand.name.trim() : '';
    // const firstWord = fullName ? fullName.split(/\s+/)[0] : '';
  
    const nameEntries = [];
    if (fullName) nameEntries.push(fullName);
    // if (firstWord && firstWord !== fullName) nameEntries.push(firstWord);
  
    const domains = Array.isArray(brand.domains) ? brand.domains : [];
  
    const keywords = [
      ...nameEntries,
      ...domains
    ];
  
    // Remove items that are stop words (case-insensitive)
    return keywords.filter(
      item => !STOP_WORDS.includes(item.toLowerCase())
    );
  }

  function keywordMatch(text, keyword) {
    keyword = keyword.toLowerCase();

    // 🔹 For short brands (HP, LG, MI)
    if (keyword.length <= 3) {
      const pattern = new RegExp(`(?<![a-z0-9])${keyword}(?![a-z0-9])`, "i");
      return pattern.test(text);
    }

    // 🔹 Normal brands (The Body Shop, Nykaa, Himalaya)
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    return regex.test(text);
  }

  const userMentionedBrands = [];
  const otherMentionedBrands = [];

  // 6️⃣ User Brands
  for (const brand of BRANDS) {
    const keys = buildKeywords(brand);

    if (keys.some(key => keywordMatch(lowerText, key))) {
      userMentionedBrands.push(brand.name);
    }
  }

  // 7️⃣ Competitors
  for (const comp of COMPETITORS) {
    const keys = buildKeywords(comp);

    if (keys.some(key => keywordMatch(lowerText, key))) {
      otherMentionedBrands.push(comp.name);
    }
  }

  return {
    mentioned: userMentionedBrands.length > 0,
    userMentionedBrands,
    otherMentionedBrands
  };
}


module.exports = { analyzeMentions };


