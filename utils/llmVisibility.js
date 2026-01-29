import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generic prompt runner
 */
async function runPrompt(prompt) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content;
}

/**
 * Location extraction (JSON)
 */
async function getLocationData(domain) {
  const prompt = `
Analyze the official website ${domain} and determine its business details.

Respond ONLY in valid JSON using this exact format:
{
  "domain": "${domain}",
  "business_type": "string",
  "city": "string or null",
  "state": "string or null",
  "country": "string or null",
  "services": ["string"]
}

Rules:
- Do not include explanations or extra text
- Use null if information is not available
- Infer location if needed
`;

  const raw = await runPrompt(prompt);

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("Invalid JSON from location prompt");
  }
}

/**
 * Best companies extraction (JSON)
 */
async function getBestCompanies({
  category,
  city,
  state,
  country,
}) {
  const prompt = `
List the best ${category} companies in ${city}, ${state}, ${country}.

Respond ONLY in valid JSON using this exact format:
{
  "city": "${city}",
  "category": "${category}",
  "companies": [
    {
      "name": "Company Name"
    }
  ]
}
`;

  const raw = await runPrompt(prompt);

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("Invalid JSON from best companies prompt");
  }
}

/**
 * Brand visibility check
 */
function isBrandVisible(companies, brandName, domain) {
  return companies.some(c =>
    c.name.toLowerCase().includes(brandName.toLowerCase()) ||
    c.name.toLowerCase().includes(domain.toLowerCase())
  );
}
