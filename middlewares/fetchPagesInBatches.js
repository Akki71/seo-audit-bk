const { JSDOM } = require("jsdom");

// function parseHtmlToJson(html, pageUrl) {
//   const dom = new JSDOM(html, { url: pageUrl });
//   const doc = dom.window.document;

//   doc
//     .querySelectorAll("header, footer, nav, script, style, noscript, iframe")
//     .forEach(el => el.remove());

//   const images = [...doc.querySelectorAll("img")].map(img => ({
//     src: img.src || "",
//     alt: img.getAttribute("alt") || ""
//   }));

//   const links = [...doc.querySelectorAll("a[href]")]
//     .map(a => a.href)
//     .filter(href => href.startsWith("http"));

//   return {
//     title: doc.querySelector("title")?.textContent.trim() || "",
//     meta_description:
//       doc.querySelector('meta[name="description"]')?.getAttribute("content") || "",
//     canonical:
//       doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "",
//     h1: [...doc.querySelectorAll("h1")].map(h => h.textContent.trim()),
//     h2: [...doc.querySelectorAll("h2")].map(h => h.textContent.trim()),
//     body_text:
//       doc.body?.textContent.replace(/\s+/g, " ").trim() || "",

//     images,
//     internalLinks: links
//   };
// }

function parseHtmlToJson(html, pageUrl) {
  const dom = new JSDOM(html, { url: pageUrl });
  const doc = dom.window.document;


  const schemaScripts = [
  ...doc.querySelectorAll('script[type="application/ld+json"]'),
];

const h1List = [...doc.querySelectorAll("h1")]
  .map(h => h.textContent.trim())
  .filter(Boolean);

const h2List = [...doc.querySelectorAll("h2")]
  .map(h => h.textContent.trim())
  .filter(Boolean);
  // Remove noisy tags
  doc
    .querySelectorAll("header, nav, style, noscript, iframe")
    .forEach((el) => el.remove());



  const titleText = doc.querySelector("title")?.textContent?.trim() || "";

  const normalizedTitle = titleText.toLowerCase().replace(/\s+/g, " ").trim();

  /* -----------------------------
     H1 & H2 EXTRACTION
  ----------------------------- */
  // const h1List = [...doc.querySelectorAll("h1")]
  //   .map((h) => h.textContent.trim())
  //   .filter(Boolean);

  // const h2List = [...doc.querySelectorAll("h2")]
  //   .map((h) => h.textContent.trim())
  //   .filter(Boolean);

  const h2Normalized = h2List.map((h) =>
    h.toLowerCase().replace(/\s+/g, " ").trim(),
  );

  /* -----------------------------
     SOCIAL LINKS EXTRACTION ✅
  ----------------------------- */
  const socialLinks = {
    facebook: [],
    instagram: [],
    twitter: [],
    linkedin: [],
    youtube: [],
  };

  [...doc.querySelectorAll("a[href]")]
    .map((a) => a.href)
    .forEach((href) => {
      const url = href.toLowerCase();

      if (url.includes("facebook.com")) socialLinks.facebook.push(href);
      if (url.includes("instagram.com")) socialLinks.instagram.push(href);
      if (url.includes("twitter.com") || url.includes("x.com"))
        socialLinks.twitter.push(href);
      if (url.includes("linkedin.com")) socialLinks.linkedin.push(href);
      if (url.includes("youtube.com") || url.includes("youtu.be"))
        socialLinks.youtube.push(href);
    });

  /* -----------------------------
     IMAGE DATA
  ----------------------------- */
  const images = [...doc.querySelectorAll("img")].map((img) => ({
    src: img.src || "",
    alt: img.getAttribute("alt") || "",
    width: img.getAttribute("width"),
    height: img.getAttribute("height"),
  }));

  /* -----------------------------
     INTERNAL LINKS
  ----------------------------- */
  const internalLinks = [...doc.querySelectorAll("a[href]")]
    .map((a) => a.href)
    .filter((href) => typeof href === "string" && href.startsWith("http"));


    /* GOOGLE SERVICES DETECTION (NEW) */  //27-01-2027

  const scripts = [...doc.querySelectorAll("script")];

  const scriptSrcs = scripts
    .map(s => s.src || "")
    .join(" ")
    .toLowerCase();

  const scriptInline = scripts
    .map(s => s.textContent || "")
    .join(" ")
    .toLowerCase();

  /* ---------- Google Analytics ---------- */
  const googleAnalyticsPresent =
    scriptSrcs.includes("google-analytics.com") ||
    scriptSrcs.includes("gtag/js") ||
    scriptInline.includes("gtag(") ||
    scriptInline.includes("ga(");

  /* ---------- Google Search Console ---------- */
  const googleSearchConsoleVerified = !!doc.querySelector(
    'meta[name="google-site-verification"]'
  );

  /* ---------- Google My Business (NOT directly detectable) ---------- */
  const hasLocalBusinessSchema = schemaScripts.some(script =>
    /localbusiness/i.test(script.textContent || "")
  );

  const hasGoogleMapsLink = [...doc.querySelectorAll("a[href], iframe[src]")]
    .some(el =>
      (el.href || el.src || "").toLowerCase().includes("google.com/maps")
    );

  const googleMyBusinessStatus = hasLocalBusinessSchema || hasGoogleMapsLink
    ?  true : false; 


  return {
    title: titleText,

    // ✅ Title optimization helpers
    title_length: titleText.length,
    title_normalized: normalizedTitle,
    title_hash: normalizedTitle, // used for duplicate detection

    meta_description:
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ||
      "",

    canonical:
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || "",

    /* -----------------------------
       HEADER DATA
    ----------------------------- */
    h1: h1List,
    h1_count: h1List.length,

    h2: h2List,
    h2_count: h2List.length,
    h2_normalized: h2Normalized,

    body_text: doc.body?.textContent?.replace(/\s+/g, " ").trim() || "",

    images,

    internalLinks,

    schemaCount: schemaScripts.length,
    social_links: socialLinks,

        google_services: {
      google_analytics: googleAnalyticsPresent,
      google_search_console: googleSearchConsoleVerified ? true : false,
      google_my_business: googleMyBusinessStatus,
    },
  };
}

exports.fetchPagesInBatches = async (urls, limit = 5) => {
  const results = [];
  let cursor = 0;

  const fetchWithTimeout = async (url, ms = 35000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      // console.log("fetched url:", url);
       const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
      },
    });

    clearTimeout(timer);
    return res;
    } catch (err) {
      console.log("error fetchWithTimeout", err);
      clearTimeout(timer);
      throw err;
    }
  };

  async function worker() {
    while (true) {
      let currentIndex;

      // 🔒 Atomic index access
      if (cursor >= urls.length) break;
      currentIndex = cursor++;
      const url = urls[currentIndex];

      try {
        // const res = await fetchWithTimeout(url);
        const res = await fetchWithTimeout(url, 35000);

      // await sleep(300);1

        const statusCode = res.status;
        const finalUrl = res.url;
        console.log(`Fetched [${currentIndex + 1}/${urls.length}]: ${url} - ${statusCode}`);
        const isRedirect = statusCode >= 300 && statusCode < 400;

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          results[currentIndex] = {
            url,
            statusCode: null,
            finalUrl: null,
            isRedirect: false,
            error: "Not HTML content",
          };
          continue;
        }
        const headers = {
          hsts: res.headers.get("strict-transport-security"),
          csp: res.headers.get("content-security-policy"),
          xcto: res.headers.get("x-content-type-options"),
          xfo: res.headers.get("x-frame-options"),
          referrerPolicy: res.headers.get("referrer-policy"),
        };
        const html = await res.text();
        results[currentIndex] = {
          url,
          statusCode,
          finalUrl,
          isRedirect,
          headers,
          data: parseHtmlToJson(html, finalUrl || url),
        };
      } catch (err) {
        results[currentIndex] = {
          url,
          statusCode: null,
          finalUrl: null,
          isRedirect: false,
          error: err.name === "AbortError" ? "Request timeout" : err.message,
        };
      }
    }
  }

  // Create workers
  const workers = Array.from({ length: Math.min(limit, urls.length) }, () =>
    worker(),
  );

  await Promise.all(workers);
  return results;
};
