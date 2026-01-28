// config/brands.js

const BRAND = "Fiama";

const BRANDS = [
  { name: "Fiama", keywords: ["fiama", "fiama gel bar", "fiama gel bars"] },
  { name: "Dove", keywords: ["dove", "dove soap", "dove cream bar"] },
  { name: "Lux", keywords: ["lux soap", "lux body wash"] },
  { name: "Pears", keywords: ["pears soap", "pears glycerin"] },
  { name: "Liril", keywords: ["liril soap"] },
  { name: "Cinthol", keywords: ["cinthol soap"] },
  { name: "Santoor", keywords: ["santoor soap"] },
  { name: "Nivea", keywords: ["nivea soap", "nivea body wash"] },
  { name: "Lifebuoy", keywords: ["lifebuoy soap"] },
  { name: "Dettol", keywords: ["dettol soap"] },
  { name: "Palmolive", keywords: ["palmolive soap"] },
  { name: "The Body Shop", keywords: ["body shop shower gel", "the body shop gel"] },
  { name: "Patanjali", keywords: ["patanjali soap"] }
];

// map domains -> brand names (extend over time)
const DOMAIN_TO_BRAND = {
  "fiama.in": "Fiama",
  "fiama.com": "Fiama",
  "itcstore.in": "Fiama",

  "dove.com": "Dove",
  "nivea.in": "Nivea",
  "nivea.com": "Nivea",
  "thebodyshop.in": "The Body Shop",
  "thebodyshop.com": "The Body Shop",
  "theloveco.in": "The Body Shop",
  "oakwellcosmetics.com": "The Body Shop",

  "lux.com": "Lux",
  "pears.com": "Pears",
  "cinthol.com": "Cinthol",
  "santoor.com": "Santoor",
  "liril.com": "Liril",
  "dettol.com": "Dettol",
  "palmolive.com": "Palmolive",
  "patanjaliayurved.net": "Patanjali"
};

// helpful sets for domain classification
const BRAND_DOMAINS = ["fiama.in", "fiama.com", "itcstore.in"];
const COMPETITOR_DOMAINS = Object.keys(DOMAIN_TO_BRAND).filter(
  d => !BRAND_DOMAINS.includes(d)
);
const AUTHORITY_DOMAINS = [
  "healthline.com", "mayoclinic.org", "apollo247.com", "unilever.com"
];

// ✅ Add this function
function classifyDomain(domain) {
  if (!domain) return "authority";

  if (BRAND_DOMAINS.includes(domain)) return "brand";
  if (COMPETITOR_DOMAINS.includes(domain)) return "competitor";
  if (AUTHORITY_DOMAINS.includes(domain)) return "authority";

  // default unknown → treat as informational / neutral
  return "authority";
}

module.exports = {
  BRAND,
  BRANDS,
  DOMAIN_TO_BRAND,
  BRAND_DOMAINS,
  COMPETITOR_DOMAINS,
  AUTHORITY_DOMAINS,
  classifyDomain
};
