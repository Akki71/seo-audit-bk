const axios = require("axios");

const MOZ_API_KEY = "bW96c2NhcGUtOVhNSTg2ZXdqaDpNdGF2YU9zNVh4a3Jsd2hRaFpjMGRZQ1JIaGg1YVYySg==";

const getDomainAuthority = async (domain) => {
  try {
    const response = await axios.post(
      "https://lsapi.seomoz.com/v2/url_metrics",
      {
        targets: [domain],
        metrics: ["domain_authority", "page_authority", "spam_score"],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${MOZ_API_KEY}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("DA Fetch Error:", error.response?.data || error.message);
    throw error.response?.data || error;
  }
};

module.exports = getDomainAuthority;
