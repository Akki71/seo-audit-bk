exports.runSerp = async (
  title
)=>{

  let query = title;

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=in`;

  console.log("Bright Data Google URL:", googleUrl);
  const payload = {
    zone: process.env.BRIGHT_DATA_ZONE,
    url: googleUrl,
     format: "raw",
  };
  const triggerUrl = "https://api.brightdata.com/request";
  let results = [];
  try {
    const response = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.BRIGHT_DATA_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    console.log(
      " Bright Data Response Keys:",
      data
    );
console.log(" Bright Data Full Response:", JSON.stringify(data));
    if (!data || data.status === "error") {
      throw new Error(data?.message || "Bright Data Error");
    }

    const organic = data?.organic || [];

    results = organic.map((item, index) => ({
      title: item.title || "",
      link: item.link || "",
      position: item.position || index + 1,
      snippet: item.snippet || "",
    }));

  } catch (err) {
    console.error("Bright Data Fetch Failed:", err.message);
    return [];
  }
  return results;
};


// const axios = require("axios");


// function buildGoogleQuery({ businessType, city, state, country }) {
//   return `best ${businessType} brands in ${city}, ${state}, ${country}`;
// }

// exports.fetchGoogleUrlsBrightData = async ({
//   businessType,
//   city,
//   state,
//   country,
// })=> {
//   const query = buildGoogleQuery({
//     businessType,
//     city,
//     state,
//     country,
//   });
// console.log("query", query)
//   const response = await axios.post(
//     "https://api.brightdata.com/serp/google/search",
//     {
//       q: query,
//       gl: country === "India" ? "in" : "us",
//       hl: "en",
//       num: 10
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${process.env.BRIGHTDATA_API_KEY}`,
//         "Content-Type": "application/json"
//       }
//     }
//   );

//   const results = response.data?.organic || [];

//   return results.map(item => ({
//     title: item.title,
//     link: item.link,
//     position: item.rank,
//     source: "google"
//   }));
// }
