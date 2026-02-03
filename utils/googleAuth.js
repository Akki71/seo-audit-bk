const axios = require("axios");

const GA_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.edit",
  "https://www.googleapis.com/auth/analytics.manage.users",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid"
];

async function refreshGoogleAccessToken(refresh_token) {
  if (!refresh_token) throw new Error("refresh_token is required");

  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    refresh_token,
    grant_type: "refresh_token",
    include_granted_scopes: "true",
  });

  try {
    const { data } = await axios.post(
      "https://oauth2.googleapis.com/token",
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    
    return data;
  } catch (err) {
    const info = err.response?.data || err.message;
    console.error("refreshGoogleAccessToken failed:", info);
    throw new Error(
      err.response?.data?.error_description || "Failed to refresh token"
    );
  }
}

module.exports = {
  refreshGoogleAccessToken,
  GA_SCOPES,
};
