const { fetchPagesInBatches } = require("../middlewares/fetchPagesInBatches");
const { runPrompt, runPromptGemini } = require("../middlewares/generateResponse");
const { runSerp } = require("../routes/getSurpData");



function normalize(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractDomainKey(domain) {
  try {
    const host = new URL(domain).hostname;
    return normalize(host.replace("www.", "").split(".")[0]);
  } catch {
    return "";
  }
}

function countBrandInLLM(brands = [], brandKeys = []) {
  if (!Array.isArray(brands)) return 0;

  return brands.filter(b =>
    brandKeys.some(key =>
      normalize(b.name).includes(key)
    )
  ).length;
}


function countBrandInSerp(surpData = [], brandKeys = []) {
  if (!Array.isArray(surpData)) return 0;

  return surpData.filter(item =>
    brandKeys.some(key =>
      normalize(item.link).includes(key) ||
      normalize(item.title).includes(key)
    )
  ).length;
}


function getBrandPresenceCounts(data) {
  const brandNameKey = normalize(data.location?.name || "");
  const domainKey = extractDomainKey(data.location?.domain || "");

  const brandKeys = [brandNameKey, domainKey].filter(Boolean);

  return {
    openAiCount: countBrandInLLM(
      data.openAi?.brands,
      brandKeys
    ),

    geminiCount: countBrandInLLM(
      data.gemini?.brands,
      brandKeys
    ),

    serpCount: countBrandInSerp(
      data.surpData,
      brandKeys
    )
  };
}

function extractPureJSON(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Invalid LLM response");
  }

  let cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON object found in LLM response");
  }

  cleaned = cleaned.substring(firstBrace, lastBrace + 1);

  return cleaned;
}

function countCitedPages(brands = [], domain) {
  const domainKey = extractDomainKey(domain);

  const pages = new Set();

  brands.forEach(brand => {
    (brand.source_pages || []).forEach(url => {
      if (normalize(url).includes(domainKey)) {
        pages.add(url);
      }
    });
  });

  return pages.size;
}


function countCitedPagesFromSerp(surpData = [], domain) {
  const domainKey = extractDomainKey(domain);
  const pages = new Set();

  surpData.forEach(item => {
    if (normalize(item.link).includes(domainKey)) {
      pages.add(item.link);
    }
  });

  return pages.size;
}

function countLLMCitedPages(brands = [], domain) {
  if (!Array.isArray(brands)) return 0;

  const domainKey = extractDomainKey(domain);
  const pages = new Set();

  brands.forEach(brand => {
    (brand.source_pages || []).forEach(url => {
      if (normalize(url).includes(domainKey)) {
        pages.add(url);
      }
    });
  });

  return pages.size;
}


function countSerpCitedPages(surpData = [], domain) {
  if (!Array.isArray(surpData)) return 0;

  const domainKey = extractDomainKey(domain);
  const pages = new Set();

  surpData.forEach(item => {
    if (item?.link && normalize(item.link).includes(domainKey)) {
      pages.add(item.link);
    }
  });

  return pages.size;
}

exports.getLLMResponse = async (domain) => {
  try {

    const pagesData = await fetchPagesInBatches([domain], 1);

    const promptForInformation = `
Analyze the official website ${domain} and determine its business details.
I have attached webpage data for reference:
${JSON.stringify(pagesData)}

Respond ONLY in valid JSON using this exact format:
{
  "domain": "${domain}",
  "name": "string",
  "business_type": "string",
  "city": "string or null",
  "state": "string or null",
  "country": "string or null",
  "services": ["string"]
}

Rules:
- Use null ONLY if information is truly missing
- Prefer explicit mentions over guesses
- Infer location if address, phone code, or city name appears
- No explanations
`;

    const llmResponse = await runPrompt(promptForInformation);
    const cleanLocationJSON = extractPureJSON(llmResponse);
    const results = JSON.parse(cleanLocationJSON);

    // console.log("LOCATION RESULT:", results);

    // ---- BEST COMPANIES PROMPT ----
    const promptForData = `
List the best ${results.business_type} brands in ${results.city}, ${results.state}, ${results.country}.

Respond ONLY in valid JSON using this exact format:
{
  "city": "${results.city}",
  "category": "${results.business_type}",
  "brands": [
   {
      "name": "Brand Name",
      "source_pages": ["https://example.com/page"]
    }
  ]
}
`;


    const surpData =await runSerp(`List the best ${results.business_type} brands in ${results.city}, ${results.country}`,
    );

    // console.log("surpData", surpData)
    const rawCompanies = await runPrompt(promptForData);
    const cleanCompaniesJSON = extractPureJSON(rawCompanies);
    const companiesResult = JSON.parse(cleanCompaniesJSON);

    // //gemini
    const geminiResponse = await runPromptGemini(promptForData);
    const cleanGeminiJSON = extractPureJSON(geminiResponse);
    const geminiResult = JSON.parse(cleanGeminiJSON);

    const finalData = {
      location: results,
      openAi: companiesResult,
      gemini:geminiResult,
      surpData,
    };

    const openAiCitedPages = countLLMCitedPages(
  companiesResult.brands,
  domain
);

const geminiCitedPages = countLLMCitedPages(
  geminiResult.brands,
  domain
);

const serpCitedPages = countSerpCitedPages(
  surpData,
  domain
);
const counts = getBrandPresenceCounts(finalData);
const result = [
  {
    source: "chatgpt",
    mentions: counts.openAiCount,
    citedPages: openAiCitedPages
  },
  {
    source: "gemini",
    mentions: counts.geminiCount,
    citedPages: geminiCitedPages
  },
  {
    source: "serp",
    mentions: counts.serpCount,
    citedPages: serpCitedPages
  }
];

return result;

  } catch (err) {
    console.error("LLM ERROR", err);
   return [];
  }
};