// // config/agents.js
// const OpenAI = require("openai");

// const perplexityClient = new OpenAI({
//   apiKey: process.env.PERPLEXITY_API_KEY,
//   baseURL: "https://api.perplexity.ai",
// });

// const openaiClient = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// const geminiClient = new OpenAI({
//   apiKey: process.env.GEMINI_API_KEY,
//   baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
// });

// module.exports = [
//   {
//     name: "Perplexity",
//     getResponse: async ({ title, content }) => {
//       const prompt = `"${title}" use keywords as '${content}`;
//       const r = await perplexityClient.chat.completions.create({
//         model: "sonar",
//         messages: [
//           { role: "system", content: "You are a knowledgeable AI assistant." },
//           { role: "user", content: prompt },
//         ],
//         max_tokens: 2000,
//         temperature: 0.8,
//       });
//       return r.choices?.[0]?.message?.content || "";
//     },
//   },
//   {
//     name: "OpenAI",
//     getResponse: async ({ title ,content}) => {
//       const prompt = `"${title}" use keywords as '${content}`;
//       const r = await openaiClient.chat.completions.create({
//         model: "gpt-4o-mini",
//         messages: [
//           { role: "system", content: "You are a knowledgeable AI assistant." },
//           { role: "user", content: prompt },
//         ],
//         max_tokens: 2000,
//         temperature: 0.8,
//       });
//       return r.choices?.[0]?.message?.content || "";
//     },
//   },
//   {
//     name: "Gemini",
//     getResponse: async ({ title,content }) => {
//      const prompt = `"${title}" use keywords as '${content}`;
//       const r = await geminiClient.chat.completions.create({
//         model: "gemini-2.0-flash", 
//         messages: [
//           { role: "system", content: "You are a knowledgeable AI assistant." },
//           { role: "user", content: prompt },
//         ],
//         max_tokens: 2000,
//         temperature: 0.8,
//       });
//       return r.choices?.[0]?.message?.content || "";
//     },
//   },
// ];


//ADDED GROK AI MODEL
const OpenAI = require("openai");
const axios = require("axios");

const perplexityClient = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: "https://api.perplexity.ai",
});

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const geminiClient = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

const grokApiKey = process.env.GROK_API_KEY; 

const grokClient = axios.create({
  baseURL: "https://api.x.ai/v1",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${grokApiKey}`,
  },
});

module.exports = [
  {
    name: "Perplexity",
    getResponse: async ({ title, content, region, cities }) => {
      // const prompt = `"${title}" use keywords as '${content}`;
        const prompt = `"${title}" use keywords as '${content} in the region of ${region}${
          cities && cities.length ? ` and cities: ${cities.join(", ")}` : ""
        }'`;    
        const r = await perplexityClient.chat.completions.create({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a knowledgeable AI assistant." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.8,
      });
      return r.choices?.[0]?.message?.content || "";
    },
  },

  {
    name: "OpenAI",
    getResponse: async ({ title, content, region, cities }) => {
      // const prompt = `"${title}" use keywords as '${content}`;/
      const prompt = `"${title}" use keywords as '${content} in the region of ${region}${
        cities && cities.length ? ` and cities: ${cities.join(", ")}` : ""
      }'`;
      const r = await openaiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a knowledgeable AI assistant." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.8,
      });
      return r.choices?.[0]?.message?.content || "";
    },
  },

  {
    name: "Gemini",
    getResponse: async ({ title, content, region, cities }) => {
      const prompt = `"${title}" use keywords as '${content} in the region of ${region}${
        cities && cities.length ? ` and cities: ${cities.join(", ")}` : ""
      }'`;
      const r = await geminiClient.chat.completions.create({
        model: "gemini-2.0-flash",
        messages: [
          { role: "system", content: "You are a knowledgeable AI assistant." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.8,
      });
      return r.choices?.[0]?.message?.content || "";
    },
  },

  {
    name: "Grok",
    getResponse: async ({ title, content, region, cities }) => {
      try {
        const prompt = `"${title}" use keywords as '${content} in the region of ${region}${
          cities && cities.length ? ` and cities: ${cities.join(", ")}` : ""
        }'`;

        const response = await grokClient.post("/chat/completions", {
          model: "grok-3-mini",
          messages: [
            { role: "system", content: "You are a knowledgeable AI assistant." },
            { role: "user", content: prompt }
          ],
          temperature: 0.8,
          max_tokens: 2000,
          stream: false
        });

        return response.data?.choices?.[0]?.message?.content || "";
      } catch (error) {
        console.error("Grok API Error:", error.response?.data || error.message);
        return "Grok error: Unable to generate response.";
      }
    }
  }
];
