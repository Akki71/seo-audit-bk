const OpenAI = require("openai");
const axios = require("axios");

// Perplexity
const perplexityClient = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: "https://api.perplexity.ai",
});

// OpenAI
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Gemini
const geminiClient = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

// Grok (xAI)
const grokClient = axios.create({
  baseURL: "https://api.x.ai/v1",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.GROK_API_KEY}`,
  },
});

module.exports = [
  {
    name: "Perplexity",
    generate: async (prompt) => {
      const r = await perplexityClient.chat.completions.create({
        model: "sonar",
        messages: [
          { role: "system", content: "Return ONLY JSON array of competitors." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      });
      return r.choices?.[0]?.message?.content || "";
    },
  },

  {
    name: "OpenAI",
    generate: async (prompt) => {
      const r = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Return ONLY JSON array of competitors." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      });
      return r.choices?.[0]?.message?.content || "";
    },
  },

  {
    name: "Gemini",
    generate: async (prompt) => {
      const r = await geminiClient.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: "Return ONLY JSON array of competitors." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      });
      return r.choices?.[0]?.message?.content || "";
    },
  },

  {
    name: "Grok",
    generate: async (prompt) => {
      const r = await grokClient.post("/chat/completions", {
        model: "grok-4-latest",
        messages: [
          { role: "system", content: "Return ONLY JSON array of competitors." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.2,
        stream: false,
      });

      return r.data?.choices?.[0]?.message?.content || "";
    },
  },
];
