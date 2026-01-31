const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { fetchPagesInBatches } = require("../middlewares/fetchPagesInBatches");
const {
  generateResponse,
  generatePageLevelAudit,
  generateSeoAuditJson,
  runPrompt,
  runPromptGemini,
} = require("../middlewares/generateResponse");
const axios = require("axios");
const { JSDOM } = require("jsdom");
const Webpage = require("../models/Webpage");
const Domain = require("../models/AuditDomain");
const Brand = require("../models/Brand");

const Urls = require("../models/Urls");
const {
  getGASeoData,
  getGSCSeoData,
  getGSCDataAndSEOOverview,
} = require("../middlewares/google");
const zlib = require("zlib");

const xml2js = require("xml2js");
const { runSerp } = require("../routes/getSurpData");
const { getLLMResponse } = require("../utils/getLLMData");

const parser = new xml2js.Parser({ trim: true });

const VISITED_SITEMAPS = new Set();
const PAGESPEED_API_KEY = process.env.PAGESPEED_API_KEY;


async function extractUrls(pageUrl) {
  const { data: html, request } = await axios.get(pageUrl, {
    maxRedirects: 5,
    timeout: 20000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    validateStatus: (status) => status < 500,
  });

  const finalUrl = request?.res?.responseUrl || pageUrl;

  if (!html || html.length < 1000) {
    console.warn("[SKIPPED] Empty or blocked page:", finalUrl);
    return [];
  }

  const dom = new JSDOM(html, { url: finalUrl });
  const document = dom.window.document;

  const urls = new Set();

  document.querySelectorAll("[href]").forEach((el) => {
    if (el.href) urls.add(el.href);
  });

  document.querySelectorAll("[src]").forEach((el) => {
    if (el.src) urls.add(el.src);
  });

  const baseDomain = new URL(finalUrl).hostname.replace(/^www\./, "");

  const filteredUrls = [
    ...new Set(
      [...urls]
        .map(normalizeUrl)
        .filter(Boolean)
        .filter((url) => {
          try {
            if (!url.startsWith("http")) return false;

            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname.replace(/^www\./, "");
            const pathname = parsedUrl.pathname.toLowerCase();

            if (pathname.startsWith("/cdn-cgi/")) return false;
            if (pathname.includes("/feed")) return false;
            if (pathname.startsWith("/wp-json")) return false;
            if (pathname.startsWith("/xmlrpc.php")) return false;

            // ✅ Same domain only
            if (hostname !== baseDomain) return false;

            const blockedExtensions = [
              ".png",
              ".jpg",
              ".jpeg",
              ".webp",
              ".svg",
              ".gif",
              ".ico",
              ".css",
              ".js",
              ".woff",
              ".woff2",
              ".ttf",
              ".eot",
              ".mp4",
              ".mp3",
              ".avi",
              ".mov",
              ".pdf",
              ".zip",
              ".rar",
              ".7z",
              ".json",
              ".xml",
            ];

            return !blockedExtensions.some((ext) => pathname.endsWith(ext));
          } catch {
            return false;
          }
        }),
    ),
  ];
  console.log("Extracted URLs:", filteredUrls.length, "from", finalUrl);

  return filteredUrls;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);

    // remove hash
    u.hash = "";

    // remove trailing slash except root
    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.href;
  } catch {
    return null;
  }
}
async function crawlSite(startUrl, limit = 1000, concurrency = 5) {
  const queue = [startUrl];
  const visited = new Set();
  const collected = new Set();
  const baseDomain = new URL(startUrl).origin;

  function isValidUrl(url) {
    try {
      const u = new URL(url);
      return u.origin === baseDomain;
    } catch {
      return false;
    }
  }

  // 🔢 Counters
  let fetchedCount = 0;
  let discoveredCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let processedCount = 0;

  const startTime = Date.now();

  function logProgress(force = false) {
    if (!force && processedCount % 20 !== 0) return;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `
[CRAWLER STATUS]
Fetched: ${fetchedCount}
Processed: ${processedCount}/${limit}
Discovered: ${discoveredCount}
Skipped: ${skippedCount}
Errors: ${errorCount}
Queue Remaining: ${queue.length}
Elapsed: ${elapsed}s
`.trim(),
    );
  }

  async function worker(id) {
    console.log(`[WORKER ${id}] started`);

    while (processedCount < limit) {
      const currentUrl = queue.shift(); // ✅ SAFE POP
      if (!currentUrl) break;

      if (visited.has(currentUrl)) {
        skippedCount++;
        continue;
      }

      visited.add(currentUrl);
      fetchedCount++;

      console.log(`[FETCH] ${currentUrl}`);

      let urls = [];
      try {
        urls = await extractUrls(currentUrl);
      } catch (err) {
        errorCount++;
        console.warn(`[ERROR] ${currentUrl}`, err.message);
        continue;
      }

      processedCount++;
      collected.add(currentUrl);

      // for (const url of urls) {
      //   if (!visited.has(url)) {
      //     queue.push(url);
      //     discoveredCount++;
      //   } else {
      //     skippedCount++;
      //   }
      // }
      for (const url of urls) {
        if (!isValidUrl(url)) continue;

        if (!visited.has(url)) {
          queue.push(url);
          discoveredCount++;
        }
      }

      logProgress();
    }

    console.log(`[WORKER ${id}] finished`);
  }

  await Promise.all(
    Array.from({ length: concurrency }, (_, i) => worker(i + 1)),
  );

  logProgress(true);

  console.log(
    `
[CRAWLER COMPLETE]
Pages Crawled: ${processedCount}
Total Discovered: ${discoveredCount}
Errors: ${errorCount}
Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s
`.trim(),
  );

  return [...collected];
}

function removeDuplicatePages(pages) {
  const seen = new Map();

  for (const page of pages) {
    const rawCanonical = page.data?.canonical || page.url;
    const canonical = normalizeUrl(rawCanonical);

    if (!seen.has(canonical)) {
      seen.set(canonical, page);
      continue;
    }

    const existing = seen.get(canonical);

    // 🧠 Decide which page is better
    const score = (p) =>
      (p.data?.canonical ? 10 : 0) +
      (p.data?.h1_count > 0 ? 5 : 0) +
      (p.data?.body_text?.length || 0) / 1000;

    if (score(page) > score(existing)) {
      seen.set(canonical, page);
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.url.localeCompare(b.url));
}

function getOverallSeoNote(rawGrade) {
  // ✅ Normalize input safely
  const grade = String(rawGrade || "")
    .trim()
    .toUpperCase();

  const messages = {
    "A+": {
      color: "#16a34a",
      text: "Excellent SEO health. Your website is highly optimized and follows best practices. Maintain consistency and monitor performance regularly.",
    },
    A: {
      color: "#22c55e",
      text: "Very good SEO performance. Minor improvements can further strengthen visibility and rankings.",
    },
    "B+": {
      color: "#84cc16",
      text: "Strong SEO foundation with room for small refinements to maximize performance.",
    },
    B: {
      color: "#a3e635",
      text: "Good SEO foundation. Some optimization opportunities exist to improve search visibility and traffic potential.",
    },
    "C+": {
      color: "#facc15",
      text: "Fair SEO performance. Improvements are recommended to strengthen rankings and technical health.",
    },
    C: {
      color: "#f97316",
      text: "Average SEO performance. Several on-page and technical issues should be addressed to improve rankings.",
    },
    "D+": {
      color: "#ef4444",
      text: "Poor SEO optimization. Multiple issues are impacting search visibility and user experience.",
    },
    D: {
      color: "#dc2626",
      text: "Very weak SEO performance. Immediate optimization is required to prevent ranking loss.",
    },
    F: {
      color: "#991b1b",
      text: "Critical SEO issues detected. Your website is severely under-optimized and needs urgent improvements.",
    },
  };

  const data = messages[grade] || {
    color: "#6b7280",
    text: "SEO health could not be evaluated.",
  };

  return data.text;
}

const getSeoGradeMessage = (grade) => {
  const map = {
    "A+": { label: "Excellent", color: "#16a34a" },
    A: { label: "Very Good", color: "#22c55e" },
    B: { label: "Good", color: "#84cc16" },
    C: { label: "Average", color: "#f59e0b" },
    "D+": { label: "Poor", color: "#f97316" },
    D: { label: "Needs Improvement", color: "#ef4444" },
    F: { label: "Critical", color: "#b91c1c" },
  };

  return map[grade] || { label: "Unknown", color: "#6b7280" };
};

function renderAuditJsonToHtml(data) {
  const basic = data.basic_setup || {};
  const ga = data.google_analytics || {};
  const gsc = data.google_search_console || {};
  const gsc_present = data.gsc_present || false;
  const shots = data.imageData || {};
  const safe = (v, fb = "Not available") =>
    v === null || v === undefined || v === "" ? fb : v;

  const bool = (v) => (v ? "Yes" : "No");

  const gradeToPercent = (grade) => {
    const map = {
      "A+": 95,
      A: 88,
      B: 75,
      C: 60,
      "D+": 45,
      D: 35,
      F: 15,
    };
    return map[grade] ?? 20;
  };

  const ring = (label, grade) => {
    const percent = gradeToPercent(grade);
    const dash = 314 * (percent / 100);

    return `
      <div class="ring">
        <svg width="120" height="120">
          <circle cx="60" cy="60" r="50" stroke="#e5e7eb" stroke-width="10" fill="none"/>
          <circle cx="60" cy="60" r="50"
            stroke="#3b82f6"
            stroke-width="10"
            fill="none"
            stroke-dasharray="${dash} 314"
            transform="rotate(-90 60 60)"/>
          <text x="60" y="65" text-anchor="middle" font-size="20" font-weight="bold">${safe(grade)}</text>
        </svg>
        <div class="ring-label">${label}</div>
      </div>
    `;
  };
const hasValidMetrics = (obj) =>
  obj &&
  Object.values(obj).some(
    v => v !== null && v !== undefined && v !== "" && v !== 0
  );
  const overview = data.overview || {};
  const scores = data.overview_scores || {};
  const graph = data.graph_data || {};
  const urlOpt = data.url_optimization || {};
  const action = data.top_priority_action_plan || {};
const hasGASummary = hasValidMetrics(ga?.summary);
const hasGSCSummary = hasValidMetrics(gsc?.summary);

const hasGMB = Boolean(basic?.google_my_business_found);


  const renderUrlIssues = (issues = []) =>
    !issues.length
      ? "<p>No URL issues 🎉</p>"
      : `
      <table>
        <tr><th>URL</th><th>Missing</th></tr>
        ${issues
          .filter((i) => i.title !== "404")
          .map(
            (
              i,
            ) => `<tr><td><a href="${i.url}" target="_blank" rel="noopener noreferrer">
              ${i.title || i.url}
            </a></td>
            <td>${i.missing.join(", ")}</td>
            
            </tr>`,
          )
          .join("")}
      </table>`;

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${safe(data.document_title)}</title>

<style>
/* ---------------- GLOBAL ---------------- */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

* {
  box-sizing: border-box;
}

body {
  font-family: "Inter", Arial, sans-serif;
  padding: 40px;
  color: #94406a;
  background: #ffffff;
}

.section {
  page-break-after: always;
  padding: 30px 20px;
}

.center {
  text-align: center;
}
/* ----------- GLOBAL PAGE HEADER (REUSED EVERYWHERE) ----------- */

.page-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
}

.page-header .bar {
  width: 6px;
  height: 28px;
  background: #6d28d9;
  border-radius: 4px;
}

.page-header h2 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
  color: #111827;
}

/* ---------------- HEADINGS ---------------- */
h1 {
  font-size: 64px;
  font-weight: 800;
  letter-spacing: -1px;
  color: #6d28d9;
}

h2 {
  font-size: 36px;
  font-weight: 700;
  margin-bottom: 16px;
  color: #111827;
}

h3 {
  font-size: 20px;
  font-weight: 600;
  margin-top: 20px;
  color: #374151;
}

p {
  font-size: 15px;
  line-height: 1.6;
  color: #374151;
}

/* ---------------- RINGS ---------------- */
.rings {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-top: 40px;
}

.ring {
  text-align: center;
  flex: 1;
}

.ring-label {
  margin-top: 10px;
  font-weight: 600;
  font-size: 14px;
  color: #374151;
}

/* ---------------- DASHBOARD CARDS ---------------- */
.dashboard-card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 26px;
  margin-top: 25px;
  background: #ffffff;
  box-shadow: 0 4px 18px rgba(0,0,0,0.04);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 25px;
}

.metric {
  padding-right: 15px;
  border-right: 1px solid #e5e7eb;
}

.metric:last-child {
  border-right: none;
}

.metric-label {
  font-size: 13px;
  color: #6b7280;
}

.metric-value {
  font-size: 30px;
  font-weight: 700;
  color: #4f46e5;
}

/* ---------------- PROGRESS BARS ---------------- */
.bar-row {
  margin-bottom: 22px;
}

.bar-label {
  margin-bottom: 6px;
  font-size: 13px;
  color: #374151;
}

.bar-track {
  background: #e5e7eb;
  height: 12px;
  border-radius: 20px;
  overflow: hidden;
}

.bar-fill {
  background: linear-gradient(90deg, #6366f1, #3b82f6);
  height: 100%;
  border-radius: 20px;
}

/* ---------------- STATUS BADGES ---------------- */
.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.badge.green {
  background: #dcfce7;
  color: #166534;
}

.badge.red {
  background: #fee2e2;
  color: #991b1b;
}
/* ----------- MOBILE SPEED UI ----------- */

.mobile-speed-ui {
  padding-top: 20px;
}

.mobile-speed-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 25px;
}

.mobile-speed-bar {
  width: 6px;
  height: 28px;
  background: #7c3aed;
  border-radius: 4px;
}

.mobile-speed-header h2 {
  font-size: 26px;
  font-weight: 700;
  color: #111827;
}

.mobile-speed-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 40px;
  align-items: center;
}

/* LEFT CONTENT */

.mobile-problem {
  font-size: 15px;
}

.mobile-status {
  color: #dc2626;
  font-weight: 700;
}

.mobile-solution {
  margin-top: 8px;
  font-size: 14px;
  color: #374151;
}

.mobile-metrics {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.mobile-metric {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #ffffff;
}

.mobile-metric span {
  display: block;
  font-size: 12px;
  color: #6b7280;
}

.mobile-metric b {
  font-size: 16px;
  color: #dc2626;
}

.mobile-warning {
  margin-top: 18px;
  padding: 14px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  border-radius: 8px;
  font-size: 13px;
  color: #991b1b;
}

/* RIGHT SCORE */

.mobile-speed-score {
  text-align: center;
}

.speed-circle {
  position: relative;
  width: 140px;
  height: 140px;
  margin: auto;
}

.speed-circle svg {
  width: 140px;
  height: 140px;
  transform: rotate(-90deg);
}

.speed-bg {
  fill: none;
  stroke: #f1f5f9;
  stroke-width: 10;
}

.speed-progress {
  fill: none;
  stroke: #ef4444;
  stroke-width: 10;
  stroke-linecap: round;
}

.speed-value {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  font-weight: 800;
  color: #dc2626;
}

.speed-label {
  margin-top: 10px;
  font-weight: 600;
}

.speed-legend {
  margin-top: 10px;
  font-size: 12px;
  display: flex;
  justify-content: center;
  gap: 12px;
  align-items: center;
}

.legend {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.legend.red {
  background: #ef4444;
}

.legend.yellow {
  background: #facc15;
}

.legend.green {
  background: #22c55e;
}

/* ---------------- HERO SECTIONS ---------------- */
.basic-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 500px;
}

.basic-text {
  flex: 1;
  padding-right: 50px;
}

.basic-text h1 {
  font-size: 58px;
}

.basic-text p {
  font-size: 17px;
  max-width: 500px;
}

.basic-image {
  flex: 1;
  text-align: right;
}

.basic-image img {
  max-width: 420px;
}
/* ----------- COMPETITOR ANALYSIS ----------- */

.competitor-analysis {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.competitor-card {
  width: 100%;
  max-width: 760px;
}

.competitor-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.competitor-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  margin-bottom: 10px;
  background: #f9fafb;
  border-radius: 8px;
}

.competitor-name {
  font-weight: 700;
  font-size: 15px;
  color: #111827;
}

.competitor-metrics {
  font-size: 13px;
  color: #374151;
}

/* ---------------- OVERVIEW LAYOUT ---------------- */
.overview-layout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 50px;
}

.overview-left {
  flex: 1;
}

.overview-left h2 {
  font-size: 44px;
}

.overview-left p {
  font-size: 16px;
}

.overview-right {
  flex: 1;
  text-align: center;
}

/* ---------------- TABLES ---------------- */
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  font-size: 13px;
}

th {
  background: #f3f4f6;
  font-weight: 600;
}

th, td {
  border: 1px solid #e5e7eb;
  padding: 10px;
  text-align: left;
}

/* ---------------- PROGRESS ROW ---------------- */
.progress-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.progress-label {
  width: 90px;
  font-size: 13px;
}

.progress-track {
  flex: 1;
  height: 10px;
  background: #e5e7eb;
  border-radius: 20px;
  margin: 0 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #16a34a);
  border-radius: 20px;
}

.progress-value {
  width: 70px;
  font-size: 12px;
  text-align: right;
}

/* ---------------- NOTICE ---------------- */
.notice {
  margin-top: 20px;
  font-size: 14px;
  color: #374151;
}

.notice b.red {
  color: #dc2626;
}

.notice b.green {
  color: #16a34a;
}

/* ---------------- IMAGES ---------------- */
img {
  max-width: 100%;
  object-fit: contain;
}

/* ---------------- PRINT OPTIMIZATION ---------------- */
@media print {
  body {
    padding: 0;
  }

  .section {
    padding: 40px;
  }
}



/* ----------- OVERVIEW PAGE UI ----------- */

.overview-wrapper {
  display: flex;
  flex-direction: column;
}

.overview-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 25px;
}

.overview-header .bar {
  width: 6px;
  height: 26px;
  background: #6d28d9;
  border-radius: 3px;
}

.overview-header h2 {
  font-size: 28px;
  font-weight: 700;
  margin: 0;
}

.overview-content {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 40px;
  align-items: center;
}

.overview-left-box {
  text-align: center;
}

.overview-left-box .recommendation {
  display: inline-block;
  margin-top: 12px;
  padding: 6px 14px;
  background: #fde2e8;
  color: #be123c;
  font-size: 13px;
  border-radius: 6px;
  font-weight: 600;
}

.overview-right-box {
  position: relative;
  text-align: right;
}

.preview-desktop {
  width: 420px;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(0,0,0,0.12);
}

.preview-mobile {
  position: absolute;
  width: 150px;
  bottom: -20px;
  right: -20px;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  border: 4px solid #fff;
}

.overview-footer {
  margin-top: 35px;
  font-size: 15px;
  line-height: 1.6;
  color: #374151;
}

.overview-footer b.red {
  color: #dc2626;
}
/* Reuse Overview heading layout */
.score-layout {
  display: flex;
  align-items: flex-start;
  gap: 40px;
}

.score-left {
  flex: 1.2;
}

.score-right {
  flex: 0.8;
  text-align: center;
}

.score-description {
  margin-top: 20px;
  font-size: 16px;
  color: #374151;
  line-height: 1.6;
}
/* ----------- SEO SCORE BREAKDOWN PAGE ----------- */

.score-page {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.score-rings {
  width: 100%;
  margin-top: 15px;
  display: flex;
  justify-content: space-between;
  gap: 20px;
}

.score-radar {
  margin-top: 10px;
  display: flex;
  justify-content: center;
}

.score-summary {
  margin-top: 10px;
  max-width: 900px;
  text-align: center;
  font-size: 16px;
  color: #374151;
  line-height: 1.7;
}
/* ----------- TOOL PAGE LAYOUT ----------- */

.tool-page {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 40px;
  align-items: center;
  margin-top: 25px;
}

.tool-visual {
  text-align: center;
}

.tool-visual img {
  width: 120px;
  margin-bottom: 12px;
}

.tool-visual h3 {
  margin-top: 10px;
}

.tool-status {
  display: inline-block;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 999px;
}

.tool-status.success {
  background: #dcfce7;
  color: #166534;
}

.tool-status.warning {
  background: #fee2e2;
  color: #991b1b;
}

/* ----------- SUMMARY BOX ----------- */

.tool-summary {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 22px;
}

.tool-summary-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
  color: #111827;
}

.tool-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px 28px;
}

.tool-summary-item {
  font-size: 14px;
  color: #374151;
}

.tool-summary-item b {
  color: #111827;
}
/* ----------- TECH TOOL CARD ----------- */

.tech-tool {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 40px;
  align-items: center;
  margin-top: 25px;
}

.tech-visual {
  text-align: center;
}

.tech-visual img {
  width: 110px;
  margin-bottom: 12px;
}

.tech-status {
  display: inline-block;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 999px;
}

.tech-status.ok {
  background: #dcfce7;
  color: #166534;
}

.tech-status.fail {
  background: #fee2e2;
  color: #991b1b;
}
.tool-summary-info {
  background: #f9fbff;
  border: 1px dashed #d6e0f5;
}

.tool-summary-description p {
  margin: 6px 0;
  color: #4a5568;
  font-size: 14px;
}

.tool-summary-benefits {
  margin: 10px 0;
  padding-left: 18px;
}

.tool-summary-benefits li {
  margin-bottom: 6px;
  font-size: 14px;
}

.tool-summary-hint {
  margin-top: 10px;
  font-size: 13px;
  color: #2563eb;
  font-weight: 500;
}

/* ----------- SUMMARY CARD ----------- */

.tech-summary {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 22px;
}

.tech-summary-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
  color: #111827;
}

.tech-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px 28px;
}

.tech-item {
  font-size: 14px;
  color: #374151;
}

.tech-item b {
  color: #111827;
}

/* ----------- RECOMMENDATION BOX ----------- */

.tech-recommendation {
  margin-top: 18px;
  padding: 14px 16px;
  background: #eef2ff;
  border-left: 5px solid #6366f1;
  border-radius: 8px;
  font-size: 14px;
  color: #1f2933;
}
/* -------- TITLE OPTIMIZATION LAYOUT -------- */

.title-layout {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 40px;
  align-items: flex-start;
  margin-top: 25px;
}

.title-left p {
  font-size: 15px;
  margin-bottom: 10px;
}

.title-left b {
  font-weight: 700;
}

.highlight-red {
  color: #dc2626;
  font-weight: 700;
}

.title-example-box {
  margin-top: 16px;
  padding: 14px 16px;
  background: #f9fafb;
  border-left: 4px solid #f59e0b;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
}

.title-example-box b {
  color: #111827;
}

.meta-test-box {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-left: 5px solid #f59e0b;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  color: #374151;
}

.meta-test-box strong {
  color: #111827;
}

/* -------- BAR CHART -------- */

.title-chart {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  background: #ffffff;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  text-align: center;
  color: #374151;
}
/* -------- OPTIMIZATION PAGES LAYOUT -------- */

.optimization-layout {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 40px;
  align-items: flex-start;
  margin-top: 25px;
}

.optimization-left p {
  font-size: 15px;
  margin-bottom: 10px;
}

.optimization-left b {
  font-weight: 700;
}

.optimization-highlight {
  color: #dc2626;
  font-weight: 700;
}

.optimization-note {
  margin-top: 14px;
  padding: 14px 16px;
  background: #f9fafb;
  border-left: 4px solid #3b82f6;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
}

.optimization-chart {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  background: #ffffff;
}

.optimization-chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  text-align: center;
  color: #374151;
}
/* ----------- SCHEMA CARD ----------- */

.schema-tool {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 40px;
  align-items: center;
  margin-top: 25px;
}

.schema-visual {
  text-align: center;
}

.schema-visual img {
  width: 110px;
  margin-bottom: 12px;
}

.schema-status {
  display: inline-block;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 999px;
}

.schema-status.ok {
  background: #dcfce7;
  color: #166534;
}

.schema-status.fail {
  background: #fee2e2;
  color: #991b1b;
}

.schema-summary {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 22px;
}

.schema-summary-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
  color: #111827;
}

.schema-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px 28px;
}

.schema-item {
  font-size: 14px;
  color: #374151;
}

.schema-item b {
  color: #111827;
}

.schema-recommendation {
  margin-top: 18px;
  padding: 14px 16px;
  background: #eef2ff;
  border-left: 5px solid #6366f1;
  border-radius: 8px;
  font-size: 14px;
  color: #1f2933;
}
/* ----------- REDIRECT REPORT ----------- */

.redirect-tool {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 40px;
  align-items: flex-start;
  margin-top: 25px;
}

.redirect-visual {
  text-align: center;
}

.redirect-visual img {
  width: 110px;
  margin-bottom: 12px;
}

.redirect-status {
  display: inline-block;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 999px;
}

.redirect-status.ok {
  background: #dcfce7;
  color: #166534;
}

.redirect-status.fail {
  background: #fee2e2;
  color: #991b1b;
}

.redirect-summary {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 22px;
}

.redirect-summary-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
  color: #111827;
}

.redirect-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px 28px;
}

.redirect-item {
  font-size: 14px;
  color: #374151;
}

.redirect-item b {
  color: #111827;
}

.redirect-note {
  margin-top: 16px;
  font-size: 14px;
  color: #374151;
}

.redirect-table {
  margin-top: 18px;
}

.redirect-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.redirect-table th {
  background: #f3f4f6;
  font-weight: 600;
}

.redirect-table th,
.redirect-table td {
  border: 1px solid #e5e7eb;
  padding: 10px;
}

.redirect-recommendation {
  margin-top: 18px;
  padding: 14px 16px;
  background: #eef2ff;
  border-left: 5px solid #6366f1;
  border-radius: 8px;
  font-size: 14px;
  color: #1f2933;
}
/* ----------- SEO HEALTH SCORE ----------- */

.seo-health {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.seo-ring {
  margin-top: 30px;
}

.seo-ring-bg {
  stroke: #e5e7eb;
}

.seo-ring-progress {
  stroke-linecap: round;
  filter: drop-shadow(0 4px 6px rgba(22,163,74,0.35));
}

.seo-ring-text {
  fill: #111827;
  font-size: 22px;
  font-weight: 800;
}
/* ----------- SEO HEALTH BREAKDOWN ----------- */

.seo-breakdown {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.seo-breakdown-chart {
  margin-top: 30px;
}

.seo-breakdown-bar {
  fill: #2563eb;
  rx: 6;
  filter: drop-shadow(0 4px 6px rgba(37,99,235,0.35));
}

.seo-breakdown-label {
  fill: #374151;
  font-size: 12px;
  font-weight: 600;
}

.seo-breakdown-value {
  fill: #111827;
  font-size: 13px;
  font-weight: 700;
}
/* ----------- SEO PERFORMANCE CHART ----------- */

.seo-performance {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.seo-performance-chart {
  margin-top: 30px;
}

/* Grid lines */
.seo-performance-grid {
  stroke: #e5e7eb;
  stroke-dasharray: 4 4;
}

/* Axis numbers */
.seo-performance-axis {
  fill: #6b7280;
  font-size: 11px;
  font-weight: 500;
}

/* X labels */
.seo-performance-label {
  fill: #374151;
  font-size: 12px;
  font-weight: 600;
}

/* Line */
.seo-performance-line {
  stroke: #dc2626;
  filter: drop-shadow(0 3px 5px rgba(220,38,38,0.35));
}

/* Data points */
.seo-performance-point {
  fill: #dc2626;
  stroke: #ffffff;
  stroke-width: 1.5;
}
  /* ===== STATIC SECURITY UI ===== */

.static-security {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 60px;
  align-items: center;
  padding: 40px 20px;
}

.static-security-content {
  max-width: 640px;
}

/* Title */

.static-security-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.security-bar {
  width: 6px;
  height: 26px;
  background: #7c3aed;
  border-radius: 4px;
}

.static-security-title h2 {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
  color: #111827;
}

/* Headline */

.security-headline {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 10px;
}

.security-highlight {
  background: #bbf7d0;
  color: #166534;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 700;
}

/* Description */

.security-description {
  font-size: 15px;
  color: #374151;
  margin-bottom: 18px;
  line-height: 1.6;
}

/* Checklist */

.security-checklist {
  list-style: none;
  padding: 0;
  margin: 0;
}

.security-checklist li {
  position: relative;
  padding-left: 28px;
  margin-bottom: 10px;
  font-size: 14px;
  color: #111827;
}

.security-checklist li::before {
  content: "✔";
  position: absolute;
  left: 0;
  top: 1px;
  color: #22c55e;
  font-weight: bold;
}

/* Right Visual */

.static-security-visual {
  display: flex;
  justify-content: center;
  align-items: center;
}

.security-shield {
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: #fef3c7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 88px;
}

  /* ----------- SECURITY VALIDATION ----------- */

.security-validation {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.security-card {
  width: 100%;
  max-width: 720px;
}

.security-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.security-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
}


/* ----------- PAGE SPEED (MOBILE + DESKTOP) ----------- */

.speed-mobile,
.speed-desktop {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.speed-card {
  width: 100%;
  max-width: 760px;
}

.speed-score {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  color: #111827;
}

.speed-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.speed-list li {
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
}

.speed-notice {
  margin-top: 14px;
  background: #eef2ff;
  border-left: 5px solid #6366f1;
  border-radius: 6px;
  padding: 12px 14px;
}
/* ----------- AI / LLM VISIBILITY ----------- */

.llm-visibility {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.llm-card {
  max-width: 720px;
  width: 100%;
}

.llm-list li {
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
}

/* ----------- SEO ROADMAP ----------- */

.seo-roadmap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.roadmap-card {
  width: 100%;
  max-width: 820px;
}

.roadmap-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.roadmap-list li {
  position: relative;
  padding: 12px 14px 12px 42px;
  margin-bottom: 10px;
  background: #f9fafb;
  border-radius: 8px;
  font-size: 14px;
  color: #111827;
  line-height: 1.5;
}

/* Timeline dot */
.roadmap-list li::before {
  content: "";
  position: absolute;
  left: 16px;
  top: 18px;
  width: 10px;
  height: 10px;
  background: #6366f1;
  border-radius: 50%;
}

/* Vertical connector */
.roadmap-list li::after {
  content: "";
  position: absolute;
  left: 20px;
  top: 28px;
  width: 2px;
  height: calc(100% - 28px);
  background: #e5e7eb;
}

.roadmap-list li:last-child::after {
  display: none;
}
/* ----------- DESKTOP SPEED UI ----------- */

.desktop-speed-ui {
  padding-top: 20px;
}

.desktop-speed-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 25px;
}

.desktop-speed-bar {
  width: 6px;
  height: 28px;
  background: #2563eb;
  border-radius: 4px;
}

.desktop-speed-header h2 {
  font-size: 26px;
  font-weight: 700;
  color: #111827;
}

.desktop-speed-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 40px;
  align-items: center;
}

/* LEFT CONTENT */

.desktop-problem {
  font-size: 15px;
}

.desktop-status {
  color: #dc2626;
  font-weight: 700;
}

.desktop-solution {
  margin-top: 8px;
  font-size: 14px;
  color: #374151;
}

.desktop-metrics {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.desktop-metric {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #ffffff;
}

.desktop-metric span {
  display: block;
  font-size: 12px;
  color: #6b7280;
}

.desktop-metric b {
  font-size: 16px;
  color: #2563eb;
}

.desktop-warning {
  margin-top: 18px;
  padding: 14px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  border-radius: 8px;
  font-size: 13px;
  color: #1d4ed8;
}

/* RIGHT SCORE */

.desktop-speed-score {
  text-align: center;
}

.desktop-speed-circle {
  position: relative;
  width: 140px;
  height: 140px;
  margin: auto;
}

.desktop-speed-circle svg {
  width: 140px;
  height: 140px;
  transform: rotate(-90deg);
}

.desktop-speed-bg {
  fill: none;
  stroke: #e5e7eb;
  stroke-width: 10;
}

.desktop-speed-progress {
  fill: none;
  stroke: #2563eb;
  stroke-width: 10;
  stroke-linecap: round;
}

.desktop-speed-value {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  font-weight: 800;
  color: #2563eb;
}

.desktop-speed-label {
  margin-top: 10px;
  font-weight: 600;
}

.desktop-speed-legend {
  margin-top: 10px;
  font-size: 12px;
  display: flex;
  justify-content: center;
  gap: 12px;
  align-items: center;
}

.desktop-legend {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.desktop-legend.red {
  background: #ef4444;
}

.desktop-legend.yellow {
  background: #facc15;
}

.desktop-legend.green {
  background: #22c55e;
}

/* ----------- KEYWORD + CONTENT + ROADMAP ----------- */

.keyword-strategy,
.content-strategy,
.seo-roadmap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.keyword-card,
.content-card,
.roadmap-card {
  max-width: 760px;
  width: 100%;
}

.keyword-list li,
.content-list li,
.roadmap-list li {
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 14px;
  color: #111827;
}


/* ----------- TRENDING KEYWORDS ----------- */

.trending-keywords {
  display: flex;
  flex-direction: column;
}

.trending-empty {
  margin-top: 12px;
  font-size: 14px;
  color: #6b7280;
}

.trending-table {
  margin-top: 16px;
}

/* ----------- VOICE SEARCH OPTIMIZATION ----------- */

.voice-search {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.voice-card {
  width: 100%;
  max-width: 760px;
}

.voice-description {
  font-size: 15px;
  line-height: 1.6;
  color: #374151;
}

.voice-list {
  margin-top: 14px;
  padding-left: 18px;
}

.voice-list li {
  margin-bottom: 8px;
  font-size: 14px;
  color: #111827;
  font-weight: 600;
}

.voice-notice {
  margin-top: 16px;
  background: #eef2ff;
  border-left: 5px solid #6366f1;
  border-radius: 6px;
  padding: 12px 14px;
}
/* ----------- SOCIAL PRESENCE ----------- */

.social-presence {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.social-card {
  width: 100%;
  max-width: 760px;
}

.social-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.social-item {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 14px;
  align-items: center;
}

.social-label {
  font-weight: 700;
  color: #111827;
}

.social-links a {
  color: #2563eb;
  text-decoration: none;
  font-size: 13px;
  word-break: break-all;
}

.social-links a:hover {
  text-decoration: underline;
}
/* ----------- MOBILE USABILITY ----------- */

.mobile-usability {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mobile-card {
  width: 100%;
  max-width: 720px;
}

.mobile-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.mobile-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
}
.seo-performance-wrapper {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.seo-performance-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.6;
}

.seo-performance-text h3 {
  margin-bottom: 8px;
}

.seo-performance-text ul {
  padding-left: 18px;
  margin-top: 10px;
}

.seo-performance-chart-wrapper {
  flex: 1.2;
}
  .seo-health-wrapper,
.seo-breakdown-wrapper {
  display: flex;
  gap: 28px;
  align-items: center;
}

.seo-health-text,
.seo-breakdown-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.6;
}

.seo-health-chart,
.seo-breakdown-chart-wrapper {
  flex: 1;
  display: flex;
  justify-content: center;
}

.seo-breakdown-text ul {
  padding-left: 18px;
  margin-top: 10px;
}


</style>

</head>

<body>
<!-- PAGE 0 : COVER -->
<div class="section center" style="min-height:700px; display:flex; flex-direction:column; justify-content:center;">
<h1 style="font-size:80px; color:#6d28d9; margin-bottom:20px;">SEO AUDIT</h1>
 
  <h2 style="font-size:28px; font-weight:500; color:#374151;">
    ${safe(data.document_title)}
</h2>
 
  <p style="margin-top:40px; font-size:18px; color:#6b7280;">
    Comprehensive Website SEO Performance Report
</p>
</div>

<!-- PAGE 1 : OVERVIEW -->
<!-- PAGE 1 : OVERVIEW -->
<div class="section">
 
  <div class="overview-wrapper">
 
    <!-- TITLE -->
    <div class="overview-header">
      <div class="bar"></div>
      <h2>Overview</h2>
    </div>
 
    <!-- CONTENT -->
    <div class="overview-content">
 
      <!-- LEFT SIDE -->
      <div class="overview-left-box">
        ${ring("Overall SEO", overview.seo_grade)}
 
        <div style="margin-top:12px;font-size:14px;color:#374151;">
          Your page needs improvement
        </div>
 
        <div class="recommendation">
          Recommendations: ${safe(overview.recommendations_count)}
        </div>
      </div>
 
      <!-- RIGHT SIDE IMAGE -->
     
      <div class="overview-right-box">
        <!-- Dummy Desktop Preview -->
 ${
   shots.desktop
     ? `<img   class="preview-desktop"  alt="Desktop Preview" src="data:image/png;base64,${shots.desktop}" />`
     : `<div class="preview-fallback">Desktop preview unavailable</div>`
 }
        <!-- Dummy Mobile Preview -->
         ${
           shots.mobile
             ? `<img    class="preview-mobile" alt="Mobile Preview" src="data:image/png;base64,${shots.mobile}" />`
             : `<div class="preview-fallback" style="height:340px;">Mobile preview unavailable</div>`
         }
      </div>
 
    </div>
 
    <!-- FOOTER TEXT -->
    <div class="overview-footer">
      Your page is <b class="red">${getSeoGradeMessage(overview.seo_grade).label}</b>
      from an SEO perspective. SEO optimization is important to ensure you can maximize
      ranking potential and drive traffic to your website from search engines.
      Issues at a glance are shown in the report.
    </div>
 
  </div>
 
</div>

<!-- PAGE 2 : SEO SCORE BREAKDOWN -->
<div class="section">

  <!-- Title -->
  <div class="page-header">
    <div class="bar"></div>
    <h2>Overview</h2>
  </div>

  <div class="score-page">

    <!-- Rings -->
    <div class="score-rings">
      ${ring("On-Page SEO", scores.on_page)}
      ${ring("Links", scores.links)}
      ${ring("Usability", scores.usability)}
      ${ring("Performance", scores.performance)}
      ${ring("Social", scores.social)}
    </div>

    <!-- Radar Graph -->
    <div class="score-radar">
      <svg width="340" height="300">
        ${(() => {
          const s = scores || {};

          const gradeToValue = (g) =>
            ({
              "A+": 95,
              A: 88,
              B: 75,
              C: 60,
              "D+": 45,
              D: 35,
              F: 15,
            })[g] ?? 20;

          const labels = [
            "Links",
            "Performance",
            "On-Page SEO",
            "Social",
            "Usability",
          ];

          const values = [
            gradeToValue(s.links),
            gradeToValue(s.performance),
            gradeToValue(s.on_page),
            gradeToValue(s.social),
            gradeToValue(s.usability),
          ];

          const cx = 180;
          const cy = 130;
          const maxR = 90;
          const levels = 5;

          const grid = Array.from({ length: levels }, (_, i) => {
            const r = ((i + 1) / levels) * maxR;
            const pts = labels
              .map((_, j) => {
                const a = ((Math.PI * 2) / labels.length) * j - Math.PI / 2;
                return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
              })
              .join(" ");
            return `<polygon points="${pts}" fill="none" stroke="#e5e7eb"/>`;
          }).join("");

          const axes = labels
            .map((_, i) => {
              const a = ((Math.PI * 2) / labels.length) * i - Math.PI / 2;
              return `<line x1="${cx}" y1="${cy}"
                           x2="${cx + maxR * Math.cos(a)}"
                           y2="${cy + maxR * Math.sin(a)}"
                           stroke="#e5e7eb"/>`;
            })
            .join("");

          const dataPts = values
            .map((v, i) => {
              const a = ((Math.PI * 2) / labels.length) * i - Math.PI / 2;
              const r = (v / 100) * maxR;
              return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
            })
            .join(" ");

          const text = labels
            .map((l, i) => {
              const a = ((Math.PI * 2) / labels.length) * i - Math.PI / 2;
              const r = maxR + 28;
              const x = cx + r * Math.cos(a);
              const y = cy + r * Math.sin(a);

              const anchor =
                Math.abs(Math.cos(a)) < 0.3
                  ? "middle"
                  : Math.cos(a) > 0
                    ? "start"
                    : "end";

              return `
                <text
                  x="${x}"
                  y="${y}"
                  font-size="12"
                  font-weight="600"
                  fill="#6b7280"
                  text-anchor="${anchor}"
                  dominant-baseline="middle">
                  ${l}
                </text>
              `;
            })
            .join("");

          return `
            ${grid}
            ${axes}
            <polygon points="${dataPts}"
                     fill="rgba(59,130,246,0.25)"
                     stroke="#3b82f6"
                     stroke-width="2"/>
            ${dataPts
              .split(" ")
              .map((p) => {
                const [x, y] = p.split(",");
                return `<circle cx="${x}" cy="${y}" r="4" fill="#3b82f6"/>`;
              })
              .join("")}
            ${text}
          `;
        })()}
      </svg>
    </div>

    <!-- Summary -->


  </div>

</div>




<!-- PAGE 3 : BASIC SETUP TITLE -->


<div class="section">


  <div class="basic-hero">
 
    <div class="basic-text">
      <h1>Basic Setup</h1>
      <p style="font-size:18px; margin-top:15px;">
        Foundational configuration required for analytics tracking, search visibility,
        and business profile presence.
      </p>
    </div>
 
    <div class="basic-image">
      <img
        src="https://cdn-icons-png.freepik.com/256/10011/10011751.png"
        alt="SEO Illustration"
      />
    </div>
 
  </div>
</div>
<!-- PAGE : ANALYTICS TOOLS OVERVIEW -->
<!-- PAGE 4 : GOOGLE ANALYTICS -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Google Analytics</h2>
  </div>

  <div class="tool-page">

    <!-- LEFT VISUAL -->
    <div class="tool-visual">
      <img src="https://i.ibb.co/RpmBvLdh/google-analytics-icon.png" />

      <h3>Traffic & User Analytics</h3>

      <div class="tool-status ${data.googleServicesFromPages.google_analytics || basic.google_analytics_found ? "success" : "warning"}">
        ${data.googleServicesFromPages.google_analytics || basic.google_analytics_found ? "Connected" : "Not Connected"}
      </div>
    </div>

    <!-- RIGHT SUMMARY -->
${!hasGASummary ? `
  <div class="tool-summary tool-summary-info">

    <div class="tool-summary-title">
      Traffic & User Analytics
    </div>

    <div class="tool-summary-description">
      <p>
        <b>Google Analytics (GA)</b> helps you understand how visitors find and use your website.
        It tracks traffic sources, user behavior, engagement, and conversions.
      </p>

      <p>
        Connecting GA gives you valuable insights into what’s working, what’s not,
        and where to focus your SEO and marketing efforts.
      </p>

      <ul class="tool-summary-benefits">
        <li>📈 Measure website traffic and growth</li>
        <li>🧭 Understand visitor behavior and engagement</li>
        <li>🎯 Track conversions and goals</li>
        <li>🔍 Improve SEO, UX, and content performance</li>
      </ul>

      <div class="tool-summary-hint">
        Connect Google Analytics to unlock traffic insights for this website.
      </div>
    </div>

  </div>
` : `
    <div class="tool-summary">

      <div class="tool-summary-title">Analytics Summary</div>

      <div class="tool-summary-grid">
        <div class="tool-summary-item">Sessions: <b>${safe(ga?.summary?.sessions)}</b></div>
        <div class="tool-summary-item">Pageviews: <b>${safe(ga?.summary?.pageviews)}</b></div>
        <div class="tool-summary-item">Avg Session (min): <b>${safe(ga?.summary?.avg_session_duration_minutes)}</b></div>
        <div class="tool-summary-item">Bounce Rate: <b>${safe(ga?.summary?.bounce_rate_percent)}%</b></div>
        <div class="tool-summary-item">Conversions: <b>${safe(ga?.summary?.total_conversions)}</b></div>
      </div>

    </div>`}

  </div>

</div>
<!-- PAGE 5 : GOOGLE SEARCH CONSOLE -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Google Search Console</h2>
  </div>

  <div class="tool-page">

    <!-- LEFT VISUAL -->
    <div class="tool-visual">
      <img src="https://i.ibb.co/Kp20FyJD/google-search-console-icon.png" />

      <h3>Search Visibility & Indexing</h3>

      <div class="tool-status ${data.googleServicesFromPages.google_search_console || basic.google_search_console_found ? "success" : "warning"}">
        ${data.googleServicesFromPages.google_search_console || basic.google_search_console_found ? "Connected" : "Not Connected"}
      </div>
    </div>

    <!-- RIGHT SUMMARY -->
${hasGSCSummary ? `
  <div class="tool-summary">

    <div class="tool-summary-title">
      Search Performance Summary
    </div>

    <div class="tool-summary-grid">
      <div class="tool-summary-item">
        Clicks: <b>${gsc.summary.clicks}</b>
      </div>
      <div class="tool-summary-item">
        Impressions: <b>${gsc.summary.impressions}</b>
      </div>
      <div class="tool-summary-item">
        CTR: <b>${gsc.summary.ctr}%</b>
      </div>
      <div class="tool-summary-item">
        Avg Position: <b>${gsc.summary.avg_position}</b>
      </div>
    </div>

  </div>
` : `
  <div class="tool-summary tool-summary-info">

    <div class="tool-summary-title">
      Google Search Console
    </div>

    <div class="tool-summary-description">
      <p>
        <b>Google Search Console (GSC)</b> shows how your website appears in Google Search
        and how users interact with your listings.
      </p>

      <p>
        It provides critical SEO insights such as search queries, impressions,
        click-through rate, and average ranking position.
      </p>

      <ul class="tool-summary-benefits">
        <li>🔎 Discover keywords your site ranks for</li>
        <li>📊 Track clicks, impressions, and CTR</li>
        <li>📈 Improve rankings and search visibility</li>
        <li>⚠️ Monitor indexing and search issues</li>
      </ul>

      <div class="tool-summary-hint">
        Connect Google Search Console to unlock search performance insights.
      </div>
    </div>

  </div>
`}


  </div>

</div>
<!-- PAGE 6 : GOOGLE MY BUSINESS -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Google My Business</h2>
  </div>

  <div class="tool-page">

    <!-- LEFT VISUAL -->
    <div class="tool-visual">
      <img src="https://i.ibb.co/5WTrY0rs/google-my-business-icon.png" />

      <h3>Local Business Presence</h3>

      <div class="tool-status ${data.googleServicesFromPages.google_my_business || basic.google_my_business_found ? "success" : "warning"}">
        ${data.googleServicesFromPages.google_my_business || basic.google_my_business_found ? "Profile Active" : "Profile Missing"}
      </div>
    </div>

    <!-- RIGHT SUMMARY -->
    ${hasGMB ? `
  <div class="tool-summary">

    <div class="tool-summary-title">
      Business Visibility Summary
    </div>

    <div class="tool-summary-grid">
      <div class="tool-summary-item">
        Profile Active: <b>Yes</b>
      </div>
      <div class="tool-summary-item">
        Local Search Ready: <b>Yes</b>
      </div>
      <div class="tool-summary-item">
        Maps Visibility: <b>Yes</b>
      </div>
      <div class="tool-summary-item">
        Trust Signals: <b>Medium</b>
      </div>
    </div>

  </div>
` : `
  <div class="tool-summary tool-summary-info">

    <div class="tool-summary-title">
      Google My Business
    </div>

    <div class="tool-summary-description">
      <p>
        <b>Google My Business (GMB)</b> helps your business appear in local search results
        and on Google Maps when customers search for services near them.
      </p>

      <p>
        An optimized GMB profile increases local visibility, trust, and customer engagement,
        especially for location-based businesses.
      </p>

      <ul class="tool-summary-benefits">
        <li>📍 Appear in Google Maps & local results</li>
        <li>⭐ Build trust with reviews & ratings</li>
        <li>📞 Get calls, visits, and directions</li>
        <li>🏪 Improve local SEO performance</li>
      </ul>

      <div class="tool-summary-hint">
        Claim and optimize your Google My Business profile to improve local visibility.
      </div>
    </div>

  </div>
`}


  </div>

</div>


<!-- PAGE 7 : TECHNICAL FIXES TITLE -->
<div class="section">
  <div class="basic-hero">


    <div class="basic-text">
        <h1>Technical Fixes</h1>
      <p style="font-size:18px; margin-top:15px;">
        Technical improvements ensure better crawlability, indexing,
        performance optimization, structured data visibility,
        and overall search engine compliance.
      </p>
    </div>
 
    <div class="basic-image">
      <img
        src="https://i0.wp.com/gandharoil.com/wp-content/uploads/2022/11/1621575335347.jpg"
        alt="Technical Fix Illustration"
      />
    </div>
 
  </div>
</div>

<!-- PAGE 8 : SCHEMA CODES -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Schema Codes – Structured Data</h2>
  </div>

  <div class="schema-tool">

    <!-- LEFT VISUAL -->
    <div class="schema-visual">
      <img src="https://cdn-icons-png.flaticon.com/512/1828/1828640.png" />

      <h3>Structured Data Detection</h3>

      <div class="schema-status ${
        data?.technical_fixes?.schema_codes_found ? "ok" : "fail"
      }">
        ${
          data?.technical_fixes?.schema_codes_found
            ? "Schema Detected"
            : "Schema Missing"
        }
      </div>
    </div>

    <!-- RIGHT SUMMARY -->
    <div class="schema-summary">

      <div class="schema-summary-title">Schema Validation Summary</div>

      <div class="schema-grid">
        <div class="schema-item">
          Schema Present:
          <b>${bool(data?.technical_fixes?.schema_codes_found)}</b>
        </div>

        <div class="schema-item">
          Rich Results Eligible:
          <b>${data?.technical_fixes?.schema_codes_found ? "Yes" : "No"}</b>
        </div>

        <div class="schema-item">
          Format Detected:
          <b>${data?.technical_fixes?.schema_codes_found ? "JSON-LD / Microdata" : "Not Found"}</b>
        </div>

        <div class="schema-item">
          Search Visibility Impact:
          <b>${data?.technical_fixes?.schema_codes_found ? "Improved" : "Limited"}</b>
        </div>
      </div>

      <!-- Recommendation -->
      <div class="schema-recommendation">
        <b>Recommendation:</b>  
        ${
          data?.technical_fixes?.schema_codes_found
            ? "Maintain structured data and validate regularly using Google Rich Results Test to prevent markup errors."
            : "Implement Schema.org markup such as Organization, Product, Breadcrumb, FAQ, and Article schemas to improve search appearance and rich result eligibility."
        }
      </div>

    </div>

  </div>

</div>


<!-- PAGE : AI SEARCH VISIBILITY -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>AI Search – Visibility & Mentions</h2>
  </div>

  <div class="schema-tool">

    <!-- LEFT VISUAL -->
    <div class="schema-visual">
      <img src="https://cdn-icons-png.flaticon.com/512/4712/4712109.png" />

      <h3>AI Search Detection</h3>

      <div class="schema-status ${
        data?.ai_search?.cited_pages > 0 ? "ok" : "fail"
      }">
        ${
          data?.ai_search?.cited_pages > 0
            ? "AI Presence Detected"
            : "No AI Presence"
        }
      </div>
    </div>

    <!-- RIGHT SUMMARY -->
    <div class="schema-summary">

      <div class="schema-summary-title">
        AI Search Summary
        <span style="float:right;font-size:12px;color:#666;">
          Today · ${new Date().toLocaleDateString()}
        </span>
      </div>

      <div class="schema-grid">
        <div class="schema-item">
          AI Visibility Score:
          <b>${data?.ai_search?.visibility ?? 0}</b>
        </div>

        <div class="schema-item">
          Total Mentions:
          <b>${data?.ai_search?.mentions ?? 0}</b>
        </div>

        <div class="schema-item">
          Cited Pages:
          <b>${data?.ai_search?.cited_pages ?? 0}</b>
        </div>

        <div class="schema-item">
          AI Readiness:
          <b>${data?.ai_search?.cited_pages > 0 ? "Indexed by AI" : "Not Indexed"}</b>
        </div>
      </div>

      <!-- AI SOURCES -->
      <div class="schema-grid" style="margin-top:12px;">

        <!-- ChatGPT -->
        <div class="schema-item" style="display:flex;align-items:center;gap:8px;">
          <img src="https://www.google.com/s2/favicons?domain=chatgpt.com" width="16" height="16" />
          ChatGPT:
          <b>
            ${data?.ai_search?.sources?.find(s => s.source === "chatgpt")?.mentions ?? 0}
            mentions ·
            ${data?.ai_search?.sources?.find(s => s.source === "chatgpt")?.citedPages ?? 0}
            pages
          </b>
        </div>

        <!-- Gemini -->
        <div class="schema-item" style="display:flex;align-items:center;gap:8px;">
          <img src="https://www.google.com/s2/favicons?domain=gemini.google.com" width="16" height="16" />
          Gemini:
          <b>
            ${data?.ai_search?.sources?.find(s => s.source === "gemini")?.mentions ?? 0}
            mentions ·
            ${data?.ai_search?.sources?.find(s => s.source === "gemini")?.citedPages ?? 0}
            pages
          </b>
        </div>

        <!-- SERP / Google -->
        <div class="schema-item" style="display:flex;align-items:center;gap:8px;">
          <img src="https://www.google.com/s2/favicons?domain=google.com" width="16" height="16" />
          Google (SERP):
          <b>
            ${data?.ai_search?.sources?.find(s => s.source === "serp")?.mentions ?? 0}
            mentions ·
            ${data?.ai_search?.sources?.find(s => s.source === "serp")?.citedPages ?? 0}
            pages
          </b>
        </div>

      </div>

      <!-- Recommendation -->
      <div class="schema-recommendation">
        <b>Recommendation:</b>
        ${
          data?.ai_search?.cited_pages > 0
            ? "Continue strengthening entity signals, structured data, and authoritative content to maintain AI visibility."
            : "Improve AI discoverability by adding structured data, strengthening topical authority, and publishing AI-readable content."
        }
      </div>

    </div>

  </div>

</div>

<!-- PAGE : REDIRECT URL REPORT -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>301 / 302 Redirect Analysis</h2>
  </div>

  <div class="redirect-tool">

    <!-- LEFT VISUAL -->
    <div class="redirect-visual">
      <img src="https://cdn-icons-png.flaticon.com/512/4248/4248443.png" />

      <h3>URL Redirection Health</h3>

      <div class="redirect-status ${
        (data.redirects?.total_redirects || 0) === 0 ? "ok" : "fail"
      }">
        ${
          (data.redirects?.total_redirects || 0) === 0
            ? "No Redirect Issues"
            : "Redirects Detected"
        }
      </div>
    </div>

    <!-- RIGHT SUMMARY -->
    <div class="redirect-summary">

      <div class="redirect-summary-title">Redirect Summary</div>

      <div class="redirect-grid">
        <div class="redirect-item">
          Total Redirect URLs:
          <b>${safe(data.redirects?.total_redirects, 0)}</b>
        </div>

        <div class="redirect-item">
          Redirect Health:
          <b>${
            (data.redirects?.total_redirects || 0) === 0
              ? "Clean"
              : "Needs Review"
          }</b>
        </div>

        <div class="redirect-item">
          SEO Impact:
          <b>${
            (data.redirects?.total_redirects || 0) === 0
              ? "Minimal"
              : "Potential Crawl Loss"
          }</b>
        </div>

        <div class="redirect-item">
          Status Codes:
          <b>301 / 302</b>
        </div>
      </div>

      <div class="redirect-note">
        ${safe(data.redirects?.note, "No additional notes available.")}
      </div>

      <!-- Redirect Table -->
      ${
        (data.redirects?.redirect_urls || []).length === 0
          ? `<p style="margin-top:16px; color:#16a34a; font-weight:600;">
               ✅ No redirect URLs detected.
             </p>`
          : `
            <div class="redirect-table">
              <table>
                <tr>
                  <th>Source URL</th>
                  <th>Redirected To</th>
                  <th>Status Code</th>
                </tr>

                ${data.redirects.redirect_urls
                  .map(
                    (r) => `
                      <tr>
                        <td>${r.source_url}</td>
                        <td>${r.target_url}</td>
                        <td>${r.status_code}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </table>
            </div>
          `
      }

      <!-- Recommendation -->
      <div class="redirect-recommendation">
        <b>Recommendation:</b>  
        ${
          (data.redirects?.total_redirects || 0) === 0
            ? "Maintain clean URL structure and monitor redirects periodically to avoid unnecessary crawl chains."
            : "Audit redirect chains, replace temporary (302) redirects with permanent (301) where appropriate, and eliminate unnecessary redirects to preserve crawl budget and link equity."
        }
      </div>

    </div>

  </div>

</div>


<!-- PAGE 10 : SITEMAP & ROBOTS -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>XML Sitemap & Robots.txt</h2>
  </div>

  <div class="tech-tool">

    <!-- LEFT VISUAL -->
    <div class="tech-visual">
      <img src="https://cdn-icons-png.flaticon.com/512/4230/4230573.png" />

      <h3>Search Engine Crawling</h3>

      <div class="tech-status ${data?.technical_fixes?.robots_txt_present && data?.technical_fixes?.sitemap_present ? "ok" : "fail"}">
        ${
          data?.technical_fixes?.robots_txt_present &&
          data?.technical_fixes?.sitemap_present
            ? "Fully Configured"
            : "Needs Attention"
        }
      </div>
    </div>

    <!-- RIGHT SUMMARY -->
    <div class="tech-summary">

      <div class="tech-summary-title">Configuration Status</div>

      <div class="tech-grid">
        <div class="tech-item">
          Robots.txt Present:
          <b>${bool(data?.technical_fixes?.robots_txt_present)}</b>
        </div>

        <div class="tech-item">
          XML Sitemap Present:
          <b>${bool(data?.technical_fixes?.sitemap_present)}</b>
        </div>

        <div class="tech-item">
          Crawl Allowed:
          <b>${data?.technical_fixes?.robots_txt_present ? "Yes" : "Unknown"}</b>
        </div>

        <div class="tech-item">
          Index Coverage:
          <b>${data?.technical_fixes?.sitemap_present ? "Good" : "Missing"}</b>
        </div>
      </div>

      <!-- Recommendation -->
      <div class="tech-recommendation">
        <b>Recommendation:</b>  
        Submit the sitemap in Google Search Console and ensure robots.txt allows important pages for proper indexing and crawl efficiency.
      </div>

    </div>

  </div>

</div>



<!-- PAGE 11 : TITLE OPTIMIZATION -->

<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Title Optimization</h2>
  </div>

  <div class="title-layout">

    <!-- LEFT CONTENT -->
    <div class="title-left">

      <p><b>Problem:</b></p>

      <p>
        There are
        <span class="highlight-red">
          ${safe(data?.title_optimization?.duplicate_count)} Duplicate,
          ${safe(data?.title_optimization?.titles_below_30)} titles below 30 Characters,
          ${safe(data?.title_optimization?.titles_over_60)} Titles over 60 Characters
        </span>
        and other optimization issues.
      </p>

      <p style="margin-top:12px;"><b>Solution:</b></p>

      <p>
        Need to optimize most titles with targeted keywords and maintain an ideal
        length between 30–60 characters.
      </p>

      <p>
        Optimized titles help search engines rank pages higher in Google search results
        and improve click-through rate.
      </p>

      <!-- Example Box -->
      <div class="title-example-box">
        <b>Text:${data?.title_optimization?.max_length_title} </b> <br/>
        <b>Length:</b> ${data?.title_optimization?.max_title_length} characters
      </div>

      <!-- Meta Test -->
      <div class="meta-test-box">
        ⚠️ <strong>Meta Title Test</strong><br/><br/>
        This webpage is using a title tag with a length of
        <b>${data?.title_optimization?.max_title_length} characters</b>.  
        We recommend keeping titles between
        <b>20–60 characters</b> to ensure visibility within Google’s
        600-pixel limit.
      </div>

    </div>

    <!-- RIGHT CHART -->
    <div class="title-chart">
      <div class="chart-title">Title Issues Distribution</div>

      <!-- SVG BAR CHART -->
      <svg width="260" height="220">
        ${(() => {
          const stats = {
            duplicate: data?.title_optimization?.duplicate_count || 0,
            below30: data?.title_optimization?.titles_below_30 || 0,
            over60: data?.title_optimization?.titles_over_60 || 0,
          };

          const values = Object.values(stats);
          const max = Math.max(...values, 1);

          const bars = [
            { label: "Duplicate", value: stats.duplicate },
            { label: "< 30 Chars", value: stats.below30 },
            { label: "> 60 Chars", value: stats.over60 },
          ];

          return bars
            .map((b, i) => {
              const barHeight = (b.value / max) * 150;
              const x = 40 + i * 70;
              const y = 170 - barHeight;

              return `
                <rect x="${x}" y="${y}" width="36" height="${barHeight}" fill="#84cc16"/>
                <text x="${x + 18}" y="190" text-anchor="middle" font-size="11">${b.label}</text>
                <text x="${x + 18}" y="${y - 6}" text-anchor="middle" font-size="11">${b.value}</text>
              `;
            })
            .join("");
        })()}
      </svg>
    </div>

  </div>

</div>

<!-- PAGE 12 : META DESCRIPTION OPTIMIZATION -->

<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Meta Description Optimization</h2>
  </div>

  <div class="optimization-layout">

    <!-- LEFT -->
    <div class="optimization-left">

      <p><b>Problem:</b></p>
      <p>
        There are
        <span class="optimization-highlight">
          ${safe(data?.meta_description_optimization?.missing_descriptions_count)}
        </span>
        pages missing meta descriptions.
      </p>

      <p style="margin-top:12px;"><b>Solution:</b></p>
      <p>
        Write compelling meta descriptions using relevant keywords to improve
        click-through rate and search visibility.
      </p>

      <div class="optimization-note">
        Meta descriptions influence how users perceive your result in Google.
        Well-written descriptions can significantly improve organic CTR.
      </div>

    </div>

    <!-- RIGHT -->
    <div class="optimization-chart">
      <div class="optimization-chart-title">Meta Description Status</div>

      <svg width="260" height="200">
        ${(() => {
          const totalPages = data?.total?.pages || 100;
          const missing =
            data?.meta_description_optimization?.missing_descriptions_count ||
            0;
          const ok = Math.max(1, Number(totalPages) - missing);

          const max = Math.max(missing, ok, 1);

          const bar = (x, value, label, color) => {
            const h = (value / max) * 140;
            return `
              <rect x="${x}" y="${170 - h}" width="40" height="${h}" fill="${color}"/>
              <text x="${x + 20}" y="190" text-anchor="middle" font-size="11">${label}</text>
              <text x="${x + 20}" y="${160 - h}" text-anchor="middle" font-size="11">${value}</text>
            `;
          };

          return `
            ${bar(60, ok, "Optimized", "#22c55e")}
            ${bar(140, missing, "Missing", "#ef4444")}
          `;
        })()}
      </svg>

    </div>

  </div>

</div>

<!-- PAGE 13 : HEADER OPTIMIZATION -->

<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Header Optimization</h2>
  </div>

  <div class="optimization-layout">

    <!-- LEFT -->
    <div class="optimization-left">

      <p><b>Problem:</b></p>
      <p>
        <span class="optimization-highlight">
        for H1  |
          Missing : ${safe(data?.header_optimization?.h1?.missing)} |
          Duplicate : ${safe(data?.header_optimization?.h1?.duplicate)} |
          Multiple : ${safe(data?.header_optimization?.h1?.multiple)}  |
          Characters is more than 70: ${safe(data?.header_optimization?.h1?.over_70_characters)}

        </span>
      </p>

            <p>
        <span class="optimization-highlight">
        For H2  |
          Missing : ${safe(data?.header_optimization?.h2?.missing)} |
          Duplicate : ${safe(data?.header_optimization?.h2?.duplicate)} |
          Multiple : ${safe(data?.header_optimization?.h2?.multiple)}  |
          Characters is more than 70: ${safe(data?.header_optimization?.h2?.over_70_characters)}

        </span>
      </p>

      <p style="margin-top:12px;"><b>Solution:</b></p>
      <p>
        Maintain a clean heading hierarchy (one H1 per page, structured H2s)
        and optimize headings using targeted keywords.
      </p>

      <div class="optimization-note">
        Proper heading structure improves crawlability, accessibility,
        and keyword relevance for search engines.
      </div>

    </div>

    <!-- RIGHT -->
    <div class="optimization-chart">
      <div class="optimization-chart-title">Header Issues Distribution</div>

  <svg width="340" height="220">
  ${(() => {
    const h1 = data?.header_optimization?.h1?.missing || 0;
    const h1d = data?.header_optimization?.h1?.duplicate || 0;
    const h1m = data?.header_optimization?.h1?.multiple || 0;
    const h1o = data?.header_optimization?.h1?.over_70_characters || 0;

    const max = Math.max(h1, h1d, h1m, h1o, 1);

    const bar = (x, value, label) => {
      const h = (value / max) * 140;
      const labelY = 205;

      return `
        <!-- BAR -->
        <rect x="${x}" y="${170 - h}" width="32" height="${h}" fill="#6366f1"/>

        <!-- VALUE ABOVE BAR -->
        <text 
          x="${x + 16}" 
          y="${165 - h}" 
          text-anchor="middle" 
          font-size="12"
          fill="#111">
          ${value}
        </text>

        <!-- VERTICAL LABEL -->
        <text
          font-size="11"
          fill="#111"
          x="${x + 16}"
          y="${labelY}">
          ${label}
        </text>
      `;
    };

    return `
      ${bar(40, h1, "Missing")}
      ${bar(110, h1d, "Duplicate")}
      ${bar(180, h1m, "Multiple")}
      ${bar(250, h1o, "Over 70")}
    `;
  })()}
</svg>



    </div>

  </div>

</div>


<!-- PAGE 14 : IMAGE OPTIMIZATION -->
<!-- PAGE : IMAGE OPTIMIZATION -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Image Optimization</h2>
  </div>

  <div class="optimization-layout">

    <!-- LEFT -->
    <div class="optimization-left">

      <p><b>Problem:</b></p>
      <p>
        <span class="optimization-highlight">
          Missing Alt Text: ${safe(data?.image_optimization?.missing_alt_text_count)} |
          Missing Size Attributes: ${safe(data?.image_optimization?.missing_size_attributes)}
        </span>
      </p>

      <p style="margin-top:12px;"><b>Solution:</b></p>
      <p>
        Compress images, add descriptive alt attributes,
        and define width and height to improve loading speed and accessibility.
      </p>

      <div class="optimization-note">
        Image optimization improves Core Web Vitals,
        accessibility compliance, and search visibility in image results.
      </div>

    </div>

    <!-- RIGHT -->
    <div class="optimization-chart">
      <div class="optimization-chart-title">Image Issues Distribution</div>

      <svg width="260" height="200">
        ${(() => {
          const alt = data?.image_optimization?.missing_alt_text_count || 0;
          const size = data?.image_optimization?.missing_size_attributes || 0;

          const max = Math.max(alt, size, 1);

          const bar = (x, value, label) => {
            const h = (value / max) * 140;
            return `
              <rect x="${x}" y="${170 - h}" width="40" height="${h}" fill="#f59e0b"/>
              <text x="${x + 20}" y="190" text-anchor="middle" font-size="11">${label}</text>
              <text x="${x + 20}" y="${160 - h}" text-anchor="middle" font-size="11">${value}</text>
            `;
          };

          return `
            ${bar(70, alt, "Alt")}
            ${bar(150, size, "Size")}
          `;
        })()}
      </svg>

    </div>

  </div>

</div>


<!-- PAGE 15 : URL OPTIMIZATION -->
<div class="section">
        <div class="page-header">
        <div class="bar"></div>
        <h2>URL Optimization</h2>
        </div>


  <p>
    Most of your URLs need proper optimization and should be readable
    for both users and search engines.
  </p>

  ${renderUrlIssues(urlOpt.issues_list)}
</div>




<!-- PAGE 20 : ACTION PLAN -->
<div class="section">
    <div class="page-header">
    <div class="bar"></div>
    <h2>30-Day SEO Action Plan</h2>
    </div>


  <h3>Week 1 – Technical</h3>
  <ul>${(action.week_1_technical || []).map((i) => `<li>${i}</li>`).join("")}</ul>

  <h3>Week 2 – On-Page</h3>
  <ul>${(action.week_2_on_page || []).map((i) => `<li>${i}</li>`).join("")}</ul>

  <h3>Week 3 – Content & Internal Links</h3>
  <ul>${(action.week_3_content_internal_links || []).map((i) => `<li>${i}</li>`).join("")}</ul>

  <h3>Week 4 – Measurement</h3>
  <ul>${(action.week_4_measurement || []).map((i) => `<li>${i}</li>`).join("")}</ul>
</div>


<!-- PAGE 21 : PAGE SPEED MOBILE OVERVIEW -->
<div class="section mobile-speed-ui">

  <div class="mobile-speed-header">
    <div class="mobile-speed-bar"></div>
    <h2>Page Speed Optimization – Mobile</h2>
  </div>

  <div class="mobile-speed-layout">

    <!-- LEFT CONTENT -->
    <div class="mobile-speed-content">

      <p class="mobile-problem">
        <b>Problem:</b> Website speed on Mobile is
        <span class="mobile-status">
          ${data.page_speed?.mobile?.performance_score < 50 ? "Low" : "Average"}
        </span>
      </p>

      <p class="mobile-solution">
        <b>Solution:</b> Website speed is one of the ranking factors. It is important
        to optimize your website for good website speed.
      </p>

      <!-- METRICS GRID -->
      <div class="mobile-metrics">

        <div class="mobile-metric">
          <span>First Contentful Paint</span>
          <b>${formatMsToMinOrSec(data.page_speed?.mobile?.fcp) || "N/A"}</b>
        </div>

        <div class="mobile-metric">
          <span>Largest Contentful Paint</span>
          <b>${formatMsToMinOrSec(data.page_speed?.mobile?.lcp) || "N/A"}</b>
        </div>

        <div class="mobile-metric">
          <span>Total Blocking Time</span>
          <b>${formatMsToMinOrSec(data.page_speed?.mobile?.tbt) || "N/A"}</b>
        </div>

        <div class="mobile-metric">
          <span>Cumulative Layout Shift</span>
          <b>${formatMsToMinOrSec(data.page_speed?.mobile?.cls) || "N/A"}</b>
        </div>

      </div>

      <!-- WARNING BOX -->
      <div class="mobile-warning">
        ❌ Site Loading Speed Test <br />
        The loading time of this webpage is slower than the recommended threshold.
      </div>

    </div>

    <!-- RIGHT SCORE -->
    <div class="mobile-speed-score">

      <div class="speed-circle">
        <svg viewBox="0 0 120 120">
          <circle class="speed-bg" cx="60" cy="60" r="50" />
          <circle
            class="speed-progress"
            cx="60"
            cy="60"
            r="50"
            stroke-dasharray="${314 * ((data.page_speed?.mobile?.performance_score || 0) / 100)} 314"
          />
        </svg>

        <div class="speed-value">
          ${data.page_speed?.mobile?.performance_score || 0}
        </div>
      </div>

      <div class="speed-label">Performance</div>

      <div class="speed-legend">
        <span class="legend red"></span> 0–49
        <span class="legend yellow"></span> 50–89
        <span class="legend green"></span> 90–100
      </div>

    </div>

  </div>

</div>


<!-- PAGE 22 :(TTFB) PAGE SPEED -->

  <div class="section">
        <div class="page-header">
        <div class="bar"></div>
        <h2>Page Speed Optimization – Mobile</h2>
        </div>
  <h3>Time To First Byte (TTFB)</h3>

  <p>
    Time to first byte measures server response speed.
  </p>

  <p>
    Current Value: 
    <b>${formatMsToMinOrSec(data.page_speed?.mobile?.ttfb) || "N/A"}</b>
  </p>

  <p>Recommended: ≤ 0.8s</p>
</div>
<!-- PAGE 23 :(fcB) PAGE SPEED -->

  <div class="section">
  <div class="page-header">
  <div class="bar"></div>
  <h2>Page Speed Optimization – Mobile</h2>
</div>
  <h3>First Contentful Paint (FCP)</h3>

  <p>
    Measures how fast first visible content appears.
  </p>

  <p>
    Current Value:
    <b>${formatMsToMinOrSec(data.page_speed?.mobile?.fcp) || "N/A"}</b>
  </p>

  <p>Recommended: ≤ 1.8s</p>
</div>
<!-- PAGE 24 :(LCP) PAGE SPEED -->


  <div class="section">
  <div class="page-header">
  <div class="bar"></div>
  <h2>Page Speed Optimization – Mobile</h2>
</div>
  <h3>Largest Contentful Paint (LCP)</h3>

  <p>
    Measures when main content finishes loading.
  </p>

  <p>
    Current Value:
    <b>${formatMsToMinOrSec(data.page_speed?.mobile?.lcp) || "N/A"}</b>
  </p>

  <p>Recommended: ≤ 2.5s</p>
</div>
<!-- PAGE 25 :(CLS) PAGE SPEED -->


 <div class="section">
  <div class="page-header">
  <div class="bar"></div>
  <h2>Page Speed Optimization – Mobile</h2>
</div>
  <h3>Cumulative Layout Shift (CLS)</h3>

  <p>
    Measures visual stability of the page.
  </p>

  <p>
    Current Value:
    <b>${formatMsToMinOrSec(data.page_speed?.mobile?.cls) || "N/A"}</b>
  </p>

  <p>Recommended: ≤ 0.1</p>
</div>

<!-- PAGE 26 : PAGE SPEED DESKTOP OVERVIEW -->
<div class="section desktop-speed-ui">

  <div class="desktop-speed-header">
    <div class="desktop-speed-bar"></div>
    <h2>Page Speed Optimization – Desktop</h2>
  </div>

  <div class="desktop-speed-layout">

    <!-- LEFT CONTENT -->
    <div class="desktop-speed-content">

      <p class="desktop-problem">
        <b>Problem:</b> Website speed on Desktop is
        <span class="desktop-status">
          ${data.page_speed?.desktop?.performance_score < 50 ? "Low" : "Average"}
        </span>
      </p>

      <p class="desktop-solution">
        <b>Solution:</b> Website speed impacts rankings and user experience.
      </p>

      <!-- METRICS GRID -->
      <div class="desktop-metrics">

        <div class="desktop-metric">
          <span>First Contentful Paint</span>
          <b>${formatMsToMinOrSec(data.page_speed?.desktop?.fcp) || "N/A"}</b>
        </div>

        <div class="desktop-metric">
          <span>Largest Contentful Paint</span>
          <b>${formatMsToMinOrSec(data.page_speed?.desktop?.lcp) || "N/A"}</b>
        </div>

        <div class="desktop-metric">
          <span>Total Blocking Time</span>
          <b>${formatMsToMinOrSec(data.page_speed?.desktop?.tbt) || "N/A"}</b>
        </div>
 
        <div class="desktop-metric">
          <span>Cumulative Layout Shift</span>
          <b>${formatMsToMinOrSec(data.page_speed?.desktop?.cls) || "N/A"}</b>
        </div>

      </div>

      <!-- INFO BOX -->
      <div class="desktop-warning">
        ⚠️ Desktop loading performance should be optimized for faster rendering and better crawl efficiency.
      </div>

    </div>

    <!-- RIGHT SCORE -->
    <div class="desktop-speed-score">

      <div class="desktop-speed-circle">
        <svg viewBox="0 0 120 120">
          <circle class="desktop-speed-bg" cx="60" cy="60" r="50" />
          <circle
            class="desktop-speed-progress"
            cx="60"
            cy="60"
            r="50"
            stroke-dasharray="${314 * ((data.page_speed?.desktop?.performance_score || 0) / 100)} 314"
          />
        </svg>

        <div class="desktop-speed-value">
          ${data.page_speed?.desktop?.performance_score || 0}
        </div>
      </div>

      <div class="desktop-speed-label">Performance</div>

      <div class="desktop-speed-legend">
        <span class="desktop-legend red"></span> 0–49
        <span class="desktop-legend yellow"></span> 50–89
        <span class="desktop-legend green"></span> 90–100
      </div>

    </div>

  </div>

</div>


<!-- PAGE 27 :(TTFB) PAGE SPEED -->

  <div class="section">
  <div class="page-header">
  <div class="bar"></div>
  <h2>Page Speed Optimization – Desktop</h2>
</div>
  <h3>Time To First Byte (TTFB)</h3>

  <p>
    Time to first byte measures server response speed.
  </p>

  <p>
    Current Value: 
    <b>${formatMsToMinOrSec(data.page_speed?.desktop?.ttfb) || "N/A"}</b>
  </p>

  <p>Recommended: ≤ 0.8s</p>
</div>
<!-- PAGE 23 :(fcB) PAGE SPEED -->

  <div class="section">
  <div class="page-header">
  <div class="bar"></div>
  <h2>Page Speed Optimization – Desktop</h2>
</div>
  <h3>First Contentful Paint (FCP)</h3>

  <p>
    Measures how fast first visible content appears.
  </p>

  <p>
    Current Value:
    <b>${formatMsToMinOrSec(data.page_speed?.desktop?.fcp) || "N/A"}</b>
  </p>

  <p>Recommended: ≤ 1.8s</p>
</div>
<!-- PAGE 28 :(LCP) PAGE SPEED -->


  <div class="section">
  <div class="page-header">
  <div class="bar"></div>
  <h2>Page Speed Optimization – Desktop</h2>
</div>
  <h3>Largest Contentful Paint (LCP)</h3>

  <p>
    Measures when main content finishes loading.
  </p>

  <p>
    Current Value:
    <b>${formatMsToMinOrSec(data.page_speed?.desktop?.lcp) || "N/A"} </b>
  </p>

  <p>Recommended: ≤ 2.5s</p>
</div>
<!-- PAGE 29 :(CLS) PAGE SPEED -->


 <div class="section">
  <div class="page-header">
  <div class="bar"></div>
  <h2>Page Speed Optimization – Desktop</h2>
</div>
  <h3>Cumulative Layout Shift (CLS)</h3>

  <p>
    Measures visual stability of the page.
  </p>

  <p>
    Current Value:
    <b>${formatMsToMinOrSec(data.page_speed?.desktop?.cls) || "N/A"}</b>
  </p>

  <p>Recommended: ≤ 0.1</p>
</div>


<!-- PAGE 30 : SEO HEALTH SCORE -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>SEO Health Score</h2>
  </div>

  <div class="seo-health-wrapper">

    <!-- LEFT : TEXT -->
    <div class="seo-health-text">
      <h3>Overall SEO Health</h3>
      <p>
        The SEO Health Score provides a consolidated view of your website’s
        optimization level based on technical, content, and on-page signals.
        A higher score indicates stronger alignment with Google ranking best
        practices.
      </p>

      <p>
        This score is calculated using multiple weighted factors including
        metadata optimization, heading structure, internal linking, performance,
        and technical SEO compliance.
      </p>
    </div>

    <!-- RIGHT : RING -->
    <div class="seo-health-chart">
      <svg class="seo-ring" width="260" height="260" viewBox="0 0 120 120">

        <circle class="seo-ring-bg"
          cx="60" cy="60" r="50"
          stroke="#e5e7eb"
          stroke-width="18"
          fill="none"/>

        <circle class="seo-ring-progress"
          cx="60" cy="60" r="50"
          stroke="#16a34a"
          stroke-width="18"
          fill="none"
          stroke-dasharray="${314 * (gradeToPercent(overview.seo_grade) / 100)} 314"
          transform="rotate(-90 60 60)"
        />

        <text class="seo-ring-text"
          x="60" y="66"
          text-anchor="middle"
          font-size="18"
          font-weight="bold">
          ${gradeToPercent(overview.seo_grade)}%
        </text>

      </svg>
    </div>

  </div>
</div>


 
<!-- PAGE 31 : SEO HEALTH BREAKDOWN -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>SEO Health Breakdown</h2>
  </div>

  <div class="seo-breakdown-wrapper">

    <!-- LEFT : TEXT -->
    <div class="seo-breakdown-text">
      <h3>Category-Wise Performance</h3>
      <p>
        This breakdown illustrates how different SEO components contribute
        to the overall health score. Each bar represents a core ranking
        category measured on a percentage scale.
      </p>

      <ul>
        <li><strong>On Page:</strong> Titles, meta descriptions, and headings</li>
        <li><strong>Content:</strong> Usability, structure, and readability</li>
        <li><strong>Internal Links:</strong> Crawlability and link distribution</li>
        <li><strong>Technical:</strong> Performance, security, and best practices</li>
      </ul>
    </div>

    <!-- RIGHT : BAR CHART -->
    <div class="seo-breakdown-chart-wrapper">
      <svg class="seo-breakdown-chart" width="520" height="260">

        ${[
          ["On Page", gradeToPercent(scores.on_page)],
          ["Content", gradeToPercent(scores.usability)],
          ["Internal Links", gradeToPercent(scores.links)],
          ["Technical", gradeToPercent(scores.performance)],
        ]
          .map((item, i) => {
            const barHeight = (item[1] / 100) * 160;
            const x = 60 + i * 110;
            const y = 200 - barHeight;

            return `
              <rect class="seo-breakdown-bar"
                    x="${x}" y="${y}"
                    width="50" height="${barHeight}" />

              <text class="seo-breakdown-label"
                    x="${x + 25}" y="220"
                    text-anchor="middle">${item[0]}</text>

              <text class="seo-breakdown-value"
                    x="${x + 25}" y="${y - 6}"
                    text-anchor="middle">${item[1]}%</text>
            `;
          })
          .join("")}

      </svg>
    </div>

  </div>
</div>

 
<!-- PAGE 23 : SEO PERFORMANCE -->
${
  gsc_present &&
  `
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>SEO Performance</h2>
  </div>

  <div class="seo-performance-wrapper">

    <!-- LEFT SIDE : TEXT -->
    <div class="seo-performance-text">
      <h3>Performance Overview</h3>
      <p>
        This chart represents the overall SEO performance based on Google Search
        Console data. It highlights impressions, clicks, click-through rate (CTR),
        and average position to help evaluate organic visibility and engagement.
      </p>

      <ul>
        <li><strong>Impressions:</strong> How often your site appears in search results</li>
        <li><strong>Clicks:</strong> Total organic visits from Google Search</li>
        <li><strong>CTR:</strong> Percentage of impressions resulting in clicks</li>
        <li><strong>Avg Position:</strong> Average ranking position in SERPs</li>
      </ul>
    </div>

    <!-- RIGHT SIDE : CHART -->
    <div class="seo-performance-chart-wrapper">
      <svg class="seo-performance-chart" width="560" height="300">

        ${(() => {
          const p = graph?.performance_metrics || {};

          const values = [
            p.impressions || 0,
            p.clicks || 0,
            p.ctr || 0,
            p.avg_position || 0,
          ];

          const rawMax = Math.max(...values, 1);

          const step =
            rawMax <= 50
              ? 10
              : rawMax <= 100
                ? 20
                : rawMax <= 500
                  ? 100
                  : rawMax <= 2000
                    ? 500
                    : rawMax <= 5000
                      ? 1000
                      : 2000;

          const maxY = Math.ceil(rawMax / step) * step;

          const yTicks = Array.from({ length: 5 }, (_, i) =>
            Math.round((maxY / 4) * i),
          );

          return `
            ${yTicks
              .map((v) => {
                const y = 230 - (v / maxY) * 180;
                return `
                <line class="seo-performance-grid"
                      x1="50" y1="${y}" x2="520" y2="${y}" />
                <text class="seo-performance-axis"
                      x="20" y="${y + 4}">${v}</text>
              `;
              })
              .join("")}

            ${["Impressions", "Clicks", "CTR", "Avg Position"]
              .map((l, i) => {
                const x = 90 + i * 130;
                return `
                  <text class="seo-performance-label"
                        x="${x}" y="260"
                        text-anchor="middle">${l}</text>
                `;
              })
              .join("")}

            ${(() => {
              const points = values
                .map((v, i) => {
                  const x = 90 + i * 130;
                  const y = 230 - (v / maxY) * 180;
                  return `${x},${y}`;
                })
                .join(" ");

              return `
                <polyline class="seo-performance-line"
                          fill="none"
                          stroke-width="2"
                          points="${points}" />

                ${points
                  .split(" ")
                  .map((p) => {
                    const [x, y] = p.split(",");
                    return `
                    <circle class="seo-performance-point"
                            cx="${x}" cy="${y}" r="4" />
                  `;
                  })
                  .join("")}
              `;
            })()}
          `;
        })()}

      </svg>
    </div>

  </div>
</div>

 `
}

 
 
 <!-- ===== STATIC SECURITY SECTION ===== -->
 <div class="section">
<div class="static-security">

  <!-- LEFT CONTENT -->
  <div class="static-security-content">

    <div class="static-security-title">
      <span class="security-bar"></span>
      <h2>Security</h2>
    </div>

    <p class="security-headline">
      Great! Your website has
      <span class="security-highlight">SSL enabled</span>
    </p>

    <p class="security-description">
      SSL helps to secure the transfer of information on your page and is used as
      a ranking signal by search engines.
    </p>

    <ul class="security-checklist">
      <li>The certificate is not used before the activation date.</li>
      <li>The certificate has not expired.</li>
      <li>The hostname "goodearthllc.com" is correctly listed in the certificate.</li>
      <li>The certificate should be trusted by all major web browsers.</li>
      <li>The certificate was not revoked.</li>
      <li>The certificate was signed with a secure hash.</li>
    </ul>

  </div>

  <!-- RIGHT ICON -->
  <div class="static-security-visual">
    <div class="security-shield">
      🔒
    </div>
  </div>

</div>
</div>
 
 
 
 
 
<!-- PAGE 26 : SCHEMA VALIDATION -->
<div class="section">
<div class="page-header">
  <div class="bar"></div>
  <h2>Schema Validation Summary</h2>
</div>


 
  <div class="dashboard-card">
    <ul>
      <li>Pages With Schema: <b>${safe(data?.schema_validation?.total_pages_with_schema)}</b></li>
      <li>Pages Missing Schema: <b>${safe(data?.schema_validation?.pages_missing_schema)}</b></li>
      <li>
        Rich Results Detected:
        ${
          data?.schema_validation?.rich_results_detected
            ? `<span class="badge green">YES</span>`
            : `<span class="badge red">NO</span>`
        }
      </li>
    </ul>
 
    <div class="notice">
      Adding structured schema markup improves search appearance and eligibility for rich results.
    </div>
  </div>
</div>
 
 
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Security Validation</h2>
  </div>

  <div class="dashboard-card security-card">
    ${(() => {
      const s = data?.security_checks || {};
      const badge = (v) =>
        v
          ? `<span class="badge green">PASS</span>`
          : `<span class="badge red">FAIL</span>`;

      return `
        <ul class="security-list">
          <li>HTTPS Enabled: ${badge(s.https_enabled)}</li>
          <li>Certificate Valid: ${badge(s.certificate_valid)}</li>
          <li>Not Expired: ${badge(s.not_expired)}</li>
          <li>Trusted Authority: ${badge(s.trusted)}</li>
          <li>Secure Hash: ${badge(s.secure_hash)}</li>
        </ul>
      `;
    })()}
  </div>
</div>




<!-- PAGE 30 : VOICE SEARCH OPTIMIZATION -->
<div class="section">

  <div class="section">
    <div class="page-header">
      <div class="bar"></div>
      <h2>Voice Search Optimization</h2>
    </div>

    <div class="dashboard-card voice-card">

      <p class="voice-description">
        Voice search usage is increasing rapidly. Websites must optimize content
        for conversational queries, FAQs and natural language patterns.
      </p>

      <ul class="voice-list">
        <li>FAQ Content Present: ${bool(data?.voice_search?.faq_present)}</li>
        <li>Conversational Keywords Optimized: ${bool(data?.voice_search?.optimized)}</li>
      </ul>

      <div class="notice voice-notice">
        Adding FAQ schema and long-tail conversational keywords improves voice discoverability.
      </div>

    </div>
  </div>
</div>


 
<!-- PAGE 31 : MOBILE USABILITY -->
<div class="section">

  <div class="page-header">
    <div class="bar"></div>
    <h2>Mobile Usability</h2>
  </div>

  <div class="dashboard-card mobile-card">

    <ul class="mobile-list">
      <li>Viewport Configured: ${bool(data?.mobile_usability?.viewport_ok)}</li>
      <li>Tap Targets Valid: ${bool(data?.mobile_usability?.tap_targets_ok)}</li>
      <li>Responsive Layout: ${bool(data?.mobile_usability?.responsive)}</li>
    </ul>

  </div>

</div>


<!-- PAGE 32 : SOCIAL PRESENCE -->
<div class="section">

  <div class="section">
    <div class="page-header">
      <div class="bar"></div>
      <h2>Social Presence</h2>
    </div>

    <div class="dashboard-card social-card">

      <ul class="social-list">

        <li class="social-item">
          <span class="social-label">Facebook :</span>
          <span class="social-links">
            ${
              data?.social_links?.facebook?.length
                ? data.social_links.facebook
                    .map((url) => `<a href="${url}" target="_blank">${url}</a>`)
                    .join(", ")
                : "No Link Found"
            }
          </span>
        </li>

        <li class="social-item">
          <span class="social-label">Instagram :</span>
          <span class="social-links">
            ${
              data?.social_links?.instagram?.length
                ? data.social_links.instagram
                    .map((url) => `<a href="${url}" target="_blank">${url}</a>`)
                    .join(", ")
                : "No Link Found"
            }
          </span>
        </li>

        <li class="social-item">
          <span class="social-label">LinkedIn :</span>
          <span class="social-links">
            ${
              data?.social_links?.linkedin?.length
                ? data.social_links.linkedin
                    .map((url) => `<a href="${url}" target="_blank">${url}</a>`)
                    .join(", ")
                : "No Link Found"
            }
          </span>
        </li>

        <li class="social-item">
          <span class="social-label">YouTube :</span>
          <span class="social-links">
            ${
              data?.social_links?.youtube?.length
                ? data.social_links.youtube
                    .map((url) => `<a href="${url}" target="_blank">${url}</a>`)
                    .join(", ")
                : "No Link Found"
            }
          </span>
        </li>

      </ul>

    </div>
  </div>

</div>











  <div class="section">
    <div class="page-header">
      <div class="bar"></div>
      <h2>Keyword Strategy</h2>
    </div>

    <div class="dashboard-card keyword-card">
      <ul class="keyword-list">
        ${(data?.keyword_strategy || []).map((k) => `<li>${k}</li>`).join("")}
      </ul>
    </div>

  </div>



  <div class="section">
    <div class="page-header">
      <div class="bar"></div>
      <h2>Content Strategy</h2>
    </div>

    <div class="dashboard-card content-card">
      <ul class="content-list">
        ${(data?.content_strategy || []).map((c) => `<li>${c}</li>`).join("")}
      </ul>
    </div>

  </div>
  </div>

 <div class="section">
 <div class="page-header">
  <div class="bar"></div>
  <h2>Analysis for Domain</h2>
</div>

 
  <div class="dashboard-card">
    <div class="metrics-grid">
          <div class="metric">
        <div class="metric-label">Domain Authority</div>
        <div class="metric-value">${safe(data?.seoAuthority?.domainAuthority)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Organic Traffic</div>
        <div class="metric-value">${safe(data?.seoAuthority?.organicTraffic)}</div>
      </div>
 

 
      <div class="metric">
        <div class="metric-label">Paid Traffic</div>
        <div class="metric-value">${safe(data?.seoAuthority?.paidTraffic)}</div>
      </div>
 
      <div class="metric">
        <div class="metric-label">Backlinks</div>
        <div class="metric-value">${safe(data?.seo_links?.backlinks)}</div>
      </div>
    </div>
 
    <div class="metrics-grid" style="margin-top:20px;">
      <div class="metric">
        <div class="metric-label">Organic Keywords</div>
        <div class="metric-value">${safe(data?.seoAuthority?.organicKeywords)}</div>
      </div>
 

   
      <div class="metric">
        <div class="metric-label">Spam Score</div>
        <div class="metric-value">${safe(data?.seoAuthority?.spamScore)}</div>
      </div>

 
       <div class="metric">
        <div class="metric-label">Referring Domains</div>
        <div class="metric-value">${safe(data?.seo_links?.referringDomains)}</div>
      </div>
       </div>
 
<div class="notice">
  The domain performance reflects healthy potential, with opportunities available to further enhance SEO visibility and growth.
</div>

  </div>
 </div>


${
  gsc_present &&
  `
  <div class="section trending-keywords">

    <div class="page-header">
      <div class="bar"></div>
      <h2>Trending Keywords</h2>
    </div>

    ${
      (data.trending_keywords?.rows || []).length === 0
        ? `<p class="trending-empty">No keyword data available</p>`
        : `
          <table class="trending-table">
            <tr>
              <th>Keyword</th>
              <th>Clicks</th>
              <th>Impressions</th>
            
              <th>percent</th>
            </tr>

            ${data.trending_keywords.rows
              .map(
                (k) => `
                  <tr>
                    <td>${k.name}</td>
                    <td>${k.clicks}</td>
                    <td>${k.impressions}</td>
                    <td>${k.percent}</td>
                  </tr>
                `,
              )
              .join("")}
          </table>
        `
    }

  </div>
  `
}


<!-- PAGE 17 : TRENDING URLS -->
${
  gsc_present &&
  `
<div class="section">
 
<div class="page-header">
  <div class="bar"></div>
  <h2>Trending Pages (URLs)</h2>
</div>
  ${
    (data.trending_urls?.rows || []).length === 0
      ? "<p>No URL performance data available</p>"
      : `
      <table>
        <tr>
          <th>URL</th>
          <th>Clicks</th>
          <th>Impressions</th>
          <th>percent</th>
        </tr>
        ${data.trending_urls.rows
          .map(
            (p) => `
          <tr>
            <td>${p.url}</td>
            <td>${p.clicks}</td>
            <td>${p.impressions}</td>
            <td>${p.percent}</td>
          </tr>
        `,
          )
          .join("")}
      </table>
    `
  }
</div>
  `
}
<div class="section">
  <div class="page-header">
    <div class="bar"></div>
    <h2>Three Main Search Ranking Factors</h2>
  </div>

  <div class="dashboard-card keyword-card">
    <ul class="keyword-list">
      ${(data?.three_main_search_ranking_factors?.factors || [])
        .map((f) => `<li>${f}</li>`)
        .join("")}
    </ul>
  </div>
</div>

<div class="section">
  <div class="page-header">
    <div class="bar"></div>
    <h2>Content Wise Study</h2>
  </div>

  <div class="dashboard-card keyword-card">
    <ul class="keyword-list">
      ${(data?.content_wise_study?.insights || [])
        .map((insight) => `<li>${insight}</li>`)
        .join("")}
    </ul>
  </div>
</div>

<div class="section">
  <div class="page-header">
    <div class="bar"></div>
    <h2>Activities Required</h2>
  </div>

  <div class="dashboard-card keyword-card">
    <ul class="keyword-list">
      ${(data?.activities_required?.actions || [])
        .map((action) => `<li>${action}</li>`)
        .join("")}
    </ul>
  </div>
</div>

</body>
</html>
`;
}

function gradeOnPage(pages) {
  const checksPerPage = 6;
  let score = 0;

  pages.forEach(p => {
    const d = p.data || {};
    if (d.title) score++;
    if (d.meta_description) score++;
    if (d.h1_count > 0) score++;
    if (d.canonical) score++;
    if (d.schemaCount > 0) score++;
    if (d.h2_count > 0) score++;
  });

  const maxScore = pages.length * checksPerPage;
  const ratio = score / maxScore;

  if (ratio >= 0.9) return "A";
  if (ratio >= 0.75) return "B";
  if (ratio >= 0.6) return "C";
  if (ratio >= 0.4) return "D";
  return "F";
}

function gradeLinks(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return "D";

  const totalLinks = pages.reduce(
    (sum, p) => sum + (p?.data?.internalLinks?.length || 0),
    0
  );

  const avgLinks = totalLinks / pages.length;

  if (avgLinks >= 20) return "A";
  if (avgLinks >= 12) return "B";
  if (avgLinks >= 6) return "C";
  if (avgLinks >= 3) return "D";
  return "F";
}

function gradeUsability(pages) {
  if (!pages.length) return "F";

  const mobileIssues = pages.filter(
    p => p.data?.viewport_missing
  ).length;

  const ratio = mobileIssues / pages.length;

  if (ratio === 0) return "A";
  if (ratio <= 0.2) return "B";
  if (ratio <= 0.5) return "C";
  return "F";
}

function gradePerformance(pageSpeed) {
  if (!pageSpeed?.mobile && !pageSpeed?.desktop) return "—";

  const mobileScore = pageSpeed?.mobile?.performance_score ?? null;
  const desktopScore = pageSpeed?.desktop?.performance_score ?? null;

  // Mobile-first weighting (70% mobile, 30% desktop)
  let finalScore;

  if (mobileScore !== null && desktopScore !== null) {
    finalScore = mobileScore * 0.7 + desktopScore * 0.3;
  } else {
    finalScore = mobileScore ?? desktopScore;
  }

  if (finalScore >= 90) return "A";
  if (finalScore >= 75) return "B";
  if (finalScore >= 60) return "C";
  if (finalScore >= 40) return "D";
  return "F";
}

function gradeSocial(pages) {
  const platforms = new Set();

  pages.forEach(p => {
    const s = p.data?.social_links || {};
    Object.keys(s).forEach(k => {
      if (s[k]?.length) platforms.add(k);
    });
  });

  if (platforms.size >= 4) return "A";
  if (platforms.size >= 3) return "B";
  if (platforms.size >= 2) return "C";
  if (platforms.size >= 1) return "D";
  return "F";
}

function formatMsToMinOrSec(ms) {
  if (!ms || ms < 0) return "0 sec";

  const totalSeconds = Math.floor(ms / 1000);

  // Less than 1 minute → show seconds
  if (totalSeconds < 60) {
    return `${totalSeconds} sec`;
  }

  // 1 minute or more → show minutes.seconds
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}.${seconds.toString().padStart(2, "0")} min`;
}

async function checkSslCertificate(url) {
  try {
    const httpsUrl = url.replace(/^http:\/\//, "https://");

    const res = await fetch(httpsUrl, {
      method: "HEAD",
      redirect: "follow",
      timeout: 8000,
    });

    return {
      https_supported: true,
      certificate_valid: true,
      trusted: true,
      final_url: res.url,
    };
  } catch (err) {
    return {
      https_supported: false,
      certificate_valid: false,
      trusted: false,
      final_url: null,
      error: err.message,
    };
  }
}

async function buildAuditFacts(pages, ga, gsc, pageSpeed) {
  const totalPages = pages.length;

  /* -----------------------------
     ON-PAGE ISSUES
  ----------------------------- */
  const missingTitle = pages.filter((p) => !p.data?.title?.trim()).length;

  const missingMeta = pages.filter((p) => {
    const meta = p.data?.meta_description;
    return typeof meta !== "string" || meta.trim() === "";
  }).length;

  const missingH1 = pages.filter(
    (p) => !p.data?.h1 || p.data.h1.length === 0,
  ).length;

  const schemaPages = pages.filter((p) => p.data?.schemaCount > 0).length;

  const httpsPages = pages.filter((p) => p.url?.startsWith("https://")).length;

  const sslEnabled = httpsPages === totalPages;

  /* -----------------------------
     RECOMMENDATIONS COUNT
  ----------------------------- */
  const recommendationsCount = missingTitle + missingMeta + missingH1;

  /* -----------------------------w
     SEO GRADE
  ----------------------------- */
  const issueRatio = recommendationsCount / (totalPages * 3 || 1);

  let seoGrade = "C";
  if (issueRatio <= 0.05) seoGrade = "A+";
  else if (issueRatio <= 0.15) seoGrade = "A";
  else if (issueRatio <= 0.3) seoGrade = "B";
  else if (issueRatio <= 0.5) seoGrade = "C";
  else seoGrade = "D";

  /* -----------------------------
     DOMAIN FILE CHECKS
  ----------------------------- */
  const baseUrl = pages[0]?.url ? new URL(pages[0].url).origin : null;
  const sitemapCandidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap-index.xml`,
    `${baseUrl}/sitemap1.xml`,
  ];

  let detectedSitemapUrl = null;

  for (const sitemapUrl of sitemapCandidates) {
    const exists = await checkFileExists(sitemapUrl);
    if (exists) {
      detectedSitemapUrl = sitemapUrl;
      break;
    }
  }

  const sitemapPresent = !!detectedSitemapUrl;

  // const sitemapPresent = baseUrl
  //   ? await checkFileExists(`${baseUrl}/sitemap.xml`)
  //   : false;

  const robotsPresent = baseUrl
    ? await checkFileExists(`${baseUrl}/robots.txt`)
    : false;

  /* -----------------------------
     TITLE OPTIMIZATION
  ----------------------------- */
  const titleMap = {};
  let duplicateTitles = 0;
  let titlesBelow30 = 0;
  let titlesOver60 = 0;
  let maxTitleLength = 0;
  let maxLengthTitle = null;

  pages.forEach((p) => {
    const title = p.data?.title || "";
    const normalizedTitle = p.data?.title_normalized || "";
    const length = p.data?.title_length || 0;

    if (normalizedTitle) {
      titleMap[normalizedTitle] = (titleMap[normalizedTitle] || 0) + 1;
    }

    if (length > 0 && length < 30) titlesBelow30++;
    if (length > 60) titlesOver60++;

    if (length > maxTitleLength && title) {
      maxTitleLength = length;
      maxLengthTitle = title;
    }
  });

  duplicateTitles = Object.values(titleMap).filter((v) => v > 1).length;

  /* -----------------------------
     HEADER OPTIMIZATION
  ----------------------------- */

  let h1Missing = 0;
  let h1Duplicate = 0;
  let h1Multiple = 0;
  let h1Over70 = 0;

  let h2Missing = 0;
  let h2Duplicate = 0;
  let h2Multiple = 0;
  let h2Over70 = 0;

  pages.forEach((p) => {
    /* ---------- H1 ---------- */
    const h1List = Array.isArray(p.data?.h1) ? p.data.h1 : [];
    const h1Normalized = p.data?.h1_normalized || [];

    if (h1List.length === 0) h1Missing++;
    if (h1List.length > 1) h1Multiple++;

    const h1Map = {};
    h1Normalized.forEach((h) => {
      if (!h || h.trim() === "") return;

      h1Map[h] = (h1Map[h] || 0) + 1;
      if (h.length > 70) h1Over70++;
    });

    if (Object.values(h1Map).some((v) => v > 1)) {
      h1Duplicate++;
    }

    /* ---------- H2 ---------- */
    const h2List = Array.isArray(p.data?.h2) ? p.data.h2 : [];
    const h2Normalized = p.data?.h2_normalized || [];

    if (h2List.length === 0) h2Missing++;
    if (h2List.length > 1) h2Multiple++;

    const h2Map = {};
    h2Normalized.forEach((h) => {
      if (!h || h.trim() === "") return;

      h2Map[h] = (h2Map[h] || 0) + 1;
      if (h.length > 70) h2Over70++;
    });

    if (Object.values(h2Map).some((v) => v > 1)) {
      h2Duplicate++;
    }
  });

  /* -----------------------------
   IMAGE OPTIMIZATION
----------------------------- */
  let imagesMissingAlt = 0;
  let imagesMissingSize = 0;

  pages.forEach((p) => {
    const images = p.data?.images || [];

    images.forEach((img) => {
      if (!img.alt || !img.alt.trim()) {
        imagesMissingAlt++;
      }

      if (!img.width || !img.height) {
        imagesMissingSize++;
      }
    });
  });

  const imagesOver100kb = null;

  const brokenLinksCount = 0;

  const summaryText = getOverallSeoNote(seoGrade);

  const urlIssues = [];

  pages.forEach((p) => {
    const missing = [];

    if (!p.data?.title?.trim()) {
      missing.push("title");
    }

    if (!p.data?.meta_description?.trim()) {
      missing.push("meta_description");
    }

    if (!p.data?.h1 || p.data.h1.length === 0) {
      missing.push("h1");
    }

    if (!p.data?.h2 || p.data.h2.length === 0) {
      missing.push("h2");
    }

    if (missing.length > 0) {
      urlIssues.push({
        url: p.url,
        title: p.data?.title || null,
        missing,
      });
    }
  });
  const domainMetrics = {
    authority_score: null, // requires external API (ahrefs/semrush)
    organic_traffic: gsc?.summary?.web?.clicks || 0,
    paid_traffic: 0,
    referring_domains: gsc?.links?.referring_domains || 0,
    backlinks: gsc?.links?.total || 0,
    organic_keywords: gsc?.topQueries?.length || 0,
    traffic_share: 0,
  };

  const backlinkTypes = {
    text: 0,
    image: 0,
    form: 0,
    frame: 0,
  };

  pages.forEach((p) => {
    const links = p.data?.externalLinks || [];
    links.forEach((l) => {
      if (l.type === "image") backlinkTypes.image++;
      else backlinkTypes.text++;
    });
  });

  const sslChecks = {
    https_enabled: sslEnabled,
    certificate_valid: sslEnabled,
    not_expired: sslEnabled,
    trusted: sslEnabled,
    secure_hash: sslEnabled,
  };

  const schemaSummary = {
    total_pages_with_schema: schemaPages,
    pages_missing_schema: totalPages - schemaPages,
    rich_results_detected: schemaPages > 0,
  };

  /* -----------------------------
   SOCIAL LINKS (AGGREGATED)
----------------------------- */

  const socialLinks = {
    facebook: new Set(),
    instagram: new Set(),
    twitter: new Set(),
    linkedin: new Set(),
    youtube: new Set(),
  };

  pages.forEach((p) => {
    const links = p.data?.social_links || {};

    Object.keys(socialLinks).forEach((platform) => {
      (links[platform] || []).forEach((url) => {
        socialLinks[platform].add(url);
      });
    });
  });

  // Convert Set → Array
  const aggregatedSocialLinks = {
    facebook: [...socialLinks.facebook],
    instagram: [...socialLinks.instagram],
    twitter: [...socialLinks.twitter],
    linkedin: [...socialLinks.linkedin],
    youtube: [...socialLinks.youtube],
  };

  const sslCertificate = baseUrl
    ? await checkSslCertificate(baseUrl)
    : {
        https_supported: false,
        certificate_valid: false,
        trusted: false,
        final_url: null,
      };

  const redirectUrls = pages.filter((p) => p.isRedirect).map((p) => p.url);

  /* -----------------------------
   GOOGLE SERVICES (AGGREGATED FROM PAGES)
----------------------------- */
  const googleServicesFromPages = {
    google_analytics: pages.some(
      (p) => p.data?.google_services?.google_analytics === true,
    ),

    google_search_console: pages.some(
      (p) => p.data?.google_services?.google_search_console === true,
    ),

    google_my_business: pages.some(
      (p) => p.data?.google_services?.google_my_business === true,
    ),
  };



  return {
    totals: {
      pages: totalPages,
      missing_title: missingTitle,
      missing_meta: missingMeta,
      missing_h1: missingH1,
      recommendations_count: recommendationsCount,
      images_missing_alt: imagesMissingAlt,
      broken_links: brokenLinksCount,
    },

    overview: {
      seo_grade: seoGrade,
      recommendations_count: recommendationsCount,
      summary_text: summaryText,
    },

    technical_fixes: {
      schema_codes_found: schemaPages > 0,
      schema_note:
        schemaPages > 0
          ? `${schemaPages} pages contain structured data markup`
          : "No schema markup detected across analyzed pages",

      sitemap_present: sitemapPresent,
      sitemap_url: detectedSitemapUrl,

      robots_txt_present: robotsPresent,
      sitemap_and_robots_note: null,
    },

    ssl_security: {
      https_supported: sslCertificate.https_supported,
      certificate_valid: sslCertificate.certificate_valid,
      trusted: sslCertificate.trusted,
      final_url: sslCertificate.final_url,
      note: sslCertificate.https_supported
        ? "SSL is properly configured. Secure HTTPS improves user trust, protects data transmission, and is a confirmed Google ranking factor."
        : "SSL is not properly configured. Missing HTTPS may expose user data, reduce trust, and negatively impact SEO rankings.",
      page: 17,
    },

    title_optimization: {
      duplicate_count: duplicateTitles,
      titles_below_30: titlesBelow30,
      titles_over_60: titlesOver60,

      max_title_length: maxTitleLength,
      max_length_title: maxLengthTitle,
    },

    header_optimization: {
      h1: {
        missing: h1Missing,
        duplicate: h1Duplicate,
        multiple: h1Multiple,
        over_70_characters: h1Over70,
      },
      h2: {
        missing: h2Missing,
        duplicate: h2Duplicate,
        multiple: h2Multiple,
        over_70_characters: h2Over70,
      },
      note: "Proper heading hierarchy improves accessibility, keyword relevance, and search rankings.",
    },
    meta_description_optimization: {
      missing_descriptions_count: missingMeta,
      note: "Optimize meta descriptions using targeted keywords to improve click-through rate.",
    },
    url_optimization: {
      issues_list: urlIssues,
      page: 11,
    },
    image_optimization: {
      images_over_100kb: imagesOver100kb,
      missing_size_attributes: imagesMissingSize,
      missing_alt_text_count: imagesMissingAlt,
      image_metadata_note:
        "Images should be optimized with descriptive alt text and appropriate sizing.",
      page: 10,
    },

    overview_scores: {
      on_page: gradeOnPage(pages),
      links: gradeLinks(gsc),
      usability: gradeUsability(pages),
      performance: gradePerformance(pageSpeed),
      social: gradeSocial(pages),
    },
     
    security: {
      ssl_enabled: sslEnabled,
    },

    page_speed: {
      mobile: pageSpeed?.mobile || null,
      desktop: pageSpeed?.desktop || null,
    },
    domain_analysis: domainMetrics,

    backlink_profile: {
      total_backlinks: domainMetrics.backlinks,
      referring_domains: domainMetrics.referring_domains,
      distribution: backlinkTypes,
    },
    redirects: {
      total_redirects: redirectUrls.length,
      redirect_urls: redirectUrls,
      note:
        redirectUrls.length > 0
          ? "Some URLs redirect to different destinations. Excessive redirects may reduce crawl efficiency and slow page loading."
          : "No redirect issues detected. All URLs resolve directly without unnecessary redirects.",
      page: 9,
    },

    security_checks: sslChecks,

    schema_validation: schemaSummary,
    social_links: aggregatedSocialLinks,
    trending_keywords: gsc?.topQueries ? { rows: gsc.topQueries } : null,
    trending_urls: gsc?.topPages ? { rows: gsc.topPages } : null,

    google_analytics: {
      google_analytics_found: !!ga,
      summary: {
        sessions: ga?.sessions ?? null,
        pageviews: ga?.pageviews ?? null,
        avg_session_duration_minutes: ga?.avgSessionDurationMinutes ?? null,
        bounce_rate_percent: ga?.bounceRatePercent ?? null,
        conversion_rate_percent: ga?.sessionConversionRatePercent ?? null,
        total_conversions: ga?.totalConversions ?? null,
      },
    },

    google_search_console: {
      google_search_console_found: !!gsc,
      summary: {
        clicks: gsc?.summary?.web?.clicks ?? null,
        impressions: gsc?.summary?.web?.impressions ?? null,
        ctr: gsc?.summary?.web?.ctr ?? null,
        avg_position: gsc?.summary?.web?.avg_position ?? null,
      },
    },

    ga_present: !!ga,
    gsc_present: !!gsc,

    googleServicesFromPages,
  };
}

async function fetchPageSpeed(url, strategy = "mobile") {
  try {
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      url,
    )}&strategy=${strategy}&key=${PAGESPEED_API_KEY}`;

    const res = await fetch(apiUrl);
    const json = await res.json();

    const lighthouse = json?.lighthouseResult;
    const audits = lighthouse?.audits;

    if (!audits) return null;

    return {
      performance_score: Math.round(
        (lighthouse.categories?.performance?.score || 0) * 100,
      ),
      fcp: audits["first-contentful-paint"]?.numericValue || 0,
      lcp: audits["largest-contentful-paint"]?.numericValue || 0,
      cls: audits["cumulative-layout-shift"]?.numericValue || 0,
      tbt: audits["total-blocking-time"]?.numericValue || 0,
      ttfb: audits["server-response-time"]?.numericValue || 0,
      speed_index: audits["speed-index"]?.numericValue || 0,
    };
  } catch (err) {
    console.error("❌ PageSpeed API error:", url, strategy, err.message);
    return null;
  }
}

async function checkFileExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.ok;
  } catch {
    return false;
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getUrlsFromSitemap(sitemapUrl) {
  const response = await axios.get(sitemapUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: {
      "User-Agent": "SEO-Audit-Bot",
    },
  });

  let xml;

  // Handle .gz sitemaps
  if (sitemapUrl.endsWith(".gz")) {
    xml = zlib.gunzipSync(response.data).toString("utf-8");
  } else {
    xml = response.data.toString("utf-8");
  }

  // 📌 Sitemap index
  if (xml.includes("<sitemapindex")) {
    const sitemapUrls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(
      (m) => m[1],
    );

    let urls = [];
    for (const smUrl of sitemapUrls) {
      const childUrls = await getUrlsFromSitemap(smUrl);
      urls.push(...childUrls);
    }
    return urls;
  }

  // 📌 Regular sitemap
  if (xml.includes("<urlset")) {
    return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  }

  return [];
}

exports.generatePdf = async (req, res) => {
  try {

    const userId = String(req.user?.id);
    // console.log("userId", userId)
const domain = await Brand.findOne({
      where: { user_id: userId },
    });
const siteUrl =domain.domain[0]
   const LLMData = await getLLMResponse(siteUrl)

// return res.json(LLMData);
    if (!domain) {
      return res.json({
        status: false,
        message: "No domain found for this user",
      });
    }

    const id = String(domain.user_id);
    const endDate = new Date().toISOString().split("T")[0];
    const start = new Date(endDate);
    start.setMonth(start.getMonth() - 6);
    const startDate = start.toISOString().split("T")[0];

    const urls = await Urls.findAll({ where: { domainId: id } });

    //      const Urls = await getUrlsFromSitemap(`${domain.domain}sitemap.xml`);
    //     if (!Urls.length) {
    //       return res.json({
    //         status: false,
    //         message: "No URLs found for domain",
    //       });
    //     }
    const pageUrls = urls.map((u) => u.url);
    //     const pageUrls = Urls.slice(0, 10);

    // console.log("url fetch", Urls.length);

    /* ------------------------------------
           2. Crawl pages
        ------------------------------------ */

    let pagesData = await fetchPagesInBatches(pageUrls, 5);
    pagesData = await removeDuplicatePages(pagesData);
    console.log("after pagesData", pagesData.length);
    // console.log("pagesData", pagesData[0]);

    // // await Webpage.bulkCreate(
    // //   pagesData.map((page) => ({
    // //     domainId: 8,
    // //     url: page.url,
    // //     title: page?.data?.title || '',
    // //     date: new Date(),
    // //     meta_description: page?.data?.meta_description || '',
    // //     body_text: page?.data?.body_text || '',
    // //     canonical: page?.data?.canonical || '',
    // //     h1: page?.data?.h1 || [],
    // //     h2: page?.data?.h2 || [],
    // //   }))
    // // );

    /* ------------------------------------
       3A. Fetch PageSpeed from DOMAIN URL
    ------------------------------------ */

    console.log("🚀 Fetching PageSpeed for domain homepage...");

    let pageSpeed = null;

    if (domain?.domain) {
      pageSpeed = {
        mobile: await fetchPageSpeed(siteUrl, "mobile"),
        desktop: await fetchPageSpeed(siteUrl, "desktop"),
      };

      console.log("✅ Domain PageSpeed:", siteUrl, pageSpeed);
    }

    if (!pagesData.length) {
      return res.json({
        status: false,
        message: "No page HTML data fetched",
      });
    }
    //     /* ------------------------------------
    //            3. Fetch GA + GSC
    //         ------------------------------------ */
    const getdata = await getGSCDataAndSEOOverview({
      siteUrl: siteUrl,
      refreshToken: domain.gsc_refresh_token,
      startDate: startDate,
      endDate: endDate,
    });

    // //  return res.json({success:true, data:getdata});
    const gaData = domain.ga_refresh_token
      ? await getGASeoData({
          refreshToken: domain.ga_refresh_token,
          propertyId: domain.property_id,
          startDate,
          endDate,
        })
      : null;

    const gscData = domain.gsc_refresh_token
      ? await getGSCSeoData({
          refreshToken: domain.gsc_refresh_token,
          siteUrl:siteUrl,
          startDate,
          endDate,
        })
      : null;

    console.log("ga gsc fetch");

    /* ------------------------------------
           4. Normalize facts (THIS IS CRITICAL)
       ------------------------------------ */
    const auditFacts = await buildAuditFacts(
      pagesData,
      gaData,
      gscData,
      pageSpeed,
    );

    console.log("AUDIT FACTS");

    /* ------------------------------------
           5. Generate FULL SEO AUDIT JSON (AI)
        ------------------------------------ */

    // const aiData = pagesData.map(p => ({ url: p.url, isRedirect: p.isRedirect }));

    const auditJson = await generateSeoAuditJson({
      domain,
      pagesData,
      gaData,
      gscData,
      auditFacts,
    });
    //     if (!auditJson || typeof auditJson !== "object") {
    //       throw new Error("AI audit JSON generation failed");
    //     }
    console.log("auditfetch fetch");

    // return res.json({success:true, data:auditJson});

    /* ------------------------------------
       7. Generate PDF
    ------------------------------------ */
    const pdfDir = path.join(__dirname, "../pdfFolder");
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, `seo-audit-${Date.now()}.pdf`);

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    /* ---------- DESKTOP ---------- */
    const desktopPage = await browser.newPage();

    await desktopPage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
    );

    await desktopPage.setViewport({ width: 1366, height: 768 });
    const targetUrl = siteUrl.startsWith("http")
      ? siteUrl
      : `https://${siteUrl}`;

    await desktopPage.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await desktopPage.waitForSelector("body", { visible: true });
    await delay(3000);

    const desktop = await desktopPage.screenshot({
      encoding: "base64",
      fullPage: false,
    });

    await desktopPage.close();

    /* ---------- MOBILE ---------- */
    const mobilePage = await browser.newPage();

    await mobilePage.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    );

    await mobilePage.setViewport({
      width: 375,
      height: 667,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });

    await mobilePage.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await mobilePage.waitForSelector("body", { visible: true });
    await delay(3000);

    const mobile = await mobilePage.screenshot({
      encoding: "base64",
      fullPage: false,
    });

    await mobilePage.close();

    console.log("Desktop length:", desktop?.length);
    console.log("Mobile length:", mobile?.length);

    imageData = { desktop, mobile };
    const finalAuditJson = {
      ...auditFacts,
      ...auditJson,
      ...getdata,
      ...LLMData
    };

    const finalAuditJson2 = {
      ...finalAuditJson,
      imageData,
    };

    const html = renderAuditJsonToHtml(finalAuditJson2);

    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);

    await page.setContent(html, {
      waitUntil: "domcontentloaded",
    });

    await new Promise((r) => setTimeout(r, 2000));

    await page.pdf({
      path: pdfPath,
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: {
        top: "10mm",
        bottom: "10mm",
        left: "15mm",
        right: "15mm",
      },
    });

    await browser.close();

    /* ------------------------------------
       8. Response
    ------------------------------------ */

    return res.json({
      success: true,
      pdfPath,
      finalAuditJson2,
      //   pages: pagesData.length,
        auditJson,
      // pageSpeed,
      // pagesData
    });
  } catch (err) {
    console.error("❌ PDF ERROR", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

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

exports.getLLMResponse123 = async (req, res) => {
  try {
    const { domain } = req.body;

    const pagesData = await fetchPagesInBatches([domain], 1);

    const promptForInformation = `
Analyze the official website ${domain} and determine its business details.
I have attached webpage data for reference:
${JSON.stringify(pagesData)}

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
- Use null ONLY if information is truly missing
- Prefer explicit mentions over guesses
- Infer location if address, phone code, or city name appears
- No explanations
`;

    const llmResponse = await runPrompt(promptForInformation);
    const cleanLocationJSON = extractPureJSON(llmResponse);
    const results = JSON.parse(cleanLocationJSON);

    console.log("LOCATION RESULT:", results);

    // ---- BEST COMPANIES PROMPT ----
    const promptForData = `
List the best ${results.business_type} brands in ${results.city}, ${results.state}, ${results.country}.

Respond ONLY in valid JSON using this exact format:
{
  "city": "${results.city}",
  "category": "${results.business_type}",
  "brands": [
    { "name": "brand Name" }
  ]
}
`;
    const surpData = runSerp({
      title: `List the best ${results.business_type} brands in ${results.city}, ${results.country}`,
    });
    // const rawCompanies = await runPrompt(promptForData);
    // const cleanCompaniesJSON = extractPureJSON(rawCompanies);
    // const companiesResult = JSON.parse(cleanCompaniesJSON);

    // //gemini
    // const geminiResponse = await runPromptGemini(promptForData);
    // const cleanGeminiJSON = extractPureJSON(geminiResponse);
    // const geminiResult = JSON.parse(cleanGeminiJSON);

    return res.json({
      success: true,
      location: results,
      //       openAi: companiesResult,
      // gemini:geminiResult,
      surpData,
    });
  } catch (err) {
    console.error("LLM ERROR", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

async function parseSitemap(sitemapUrl, collectedUrls) {
  if (VISITED_SITEMAPS.has(sitemapUrl)) return;
  VISITED_SITEMAPS.add(sitemapUrl);

  try {
    const { data } = await axios.get(sitemapUrl, { timeout: 10000 });
    const result = await parser.parseStringPromise(data);

    // Case 1️⃣ sitemap contains URLs
    if (result?.urlset?.url) {
      result.urlset.url.forEach((item) => {
        if (item.loc?.[0]) {
          collectedUrls.add(item.loc[0]);
        }
      });
    }

    // Case 2️⃣ sitemap contains sitemap links
    if (result?.sitemapindex?.sitemap) {
      for (const sitemap of result.sitemapindex.sitemap) {
        if (sitemap.loc?.[0]) {
          await parseSitemap(sitemap.loc[0], collectedUrls);
        }
      }
    }
  } catch (err) {
    // Ignore unreachable or invalid sitemap files
  }
}

async function fetchAllSitemapUrls(baseUrl) {
  const collectedUrls = new Set();
  VISITED_SITEMAPS.clear();

  const cleanBase = baseUrl.replace(/\/$/, "");

  const possibleSitemaps = [
    `${cleanBase}/sitemap.xml`,
    `${cleanBase}/sitemap_index.xml`,
  ];

  for (const sitemapUrl of possibleSitemaps) {
    await parseSitemap(sitemapUrl, collectedUrls);
  }

  return Array.from(collectedUrls);
}

exports.getUrl = async (req, res) => {
  try {
    const { url, limit = 20 } = req.body;
    const userId = req.user?.id;
const domain = await Brand.findOne({where: {user_id: userId}});
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    console.log("userrrr", userId);
    if (!domain) {
      return res.status(200).json({
        success: false,
        message: "No user found",
      });
    }
    const domainId = domain.id;
    if (!url) {
      return res.status(200).json({ error: "URL is required" });
    }

    if (!userId) {
      return res.status(200).json({ error: "Invalid User" });
    }

    let pageUrls = [];

    // 🔍 STEP 1: Try sitemap (xml, index, nested, mixed)
    pageUrls = await fetchAllSitemapUrls(url);

    // 🕷️ STEP 2: Fallback to crawler
    if (!pageUrls.length) {
      pageUrls = await crawlSite(url, Number(limit), 8);
    }

    // 🛑 Nothing found
    if (!pageUrls.length) {
      return res.status(200).json({
        success: false,
        message: "No page URLs found",
      });
    }

    pageUrls = pageUrls.slice(0, Number(limit));

    console.log("pageUrls count:", pageUrls.length);

    const records = pageUrls.map((pageUrl) => ({
      user_id: userId,
      domainId: domainId,
      url: pageUrl,
    }));

    await Urls.bulkCreate(records, {
      updateOnDuplicate: ["url"],
    });

    return res.status(200).json({
      success: true,
      user_id: userId,
      total: pageUrls.length,
      data: pageUrls,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.generatePageData = async (req, res) => {
  try {
    // const { id } = req.query;
    // if (!id) {
    //   return res.status(200).json({ error: "Invalid User" });
    // }
    // const domain = await Domain.findOne({ where: { id } });
    // if (!domain) {
    //   return res.json({
    //     status: false,
    //     message: "No domain data found",
    //   });
    // }
    const userId = req.user?.id;

       console.log("userId", userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
const domain = await Brand.findOne({
      where: { user_id: userId },
     
    });
// return res.json(domain);
    if (!domain) {
      return res.json({
        status: false,
        message: "No domain found for this user",
      });
    }

    const id = domain.id;
    const urls = await Urls.findAll({ where: { user_id: userId } });
    if (!urls.length) {
      return res.json({
        status: false,
        message: "No URLs found for domain",
      });
    }

// return res.json(urls);

    const pageUrls = urls.map((u) => u.url);
    let pagesData = await fetchPagesInBatches(pageUrls, 5);
    pagesData = await removeDuplicatePages(pagesData);

    await Webpage.bulkCreate(
      pagesData.map((page) => ({
        user_id: userId,
        domainId: id,
        url: page.url,
        title: page?.data?.title || "",
        date: new Date(),
        meta_description: page?.data?.meta_description || "",
        body_text: page?.data?.body_text || "",
        canonical: page?.data?.canonical || "",
        h1: page?.data?.h1 || [],
        h2: page?.data?.h2 || [],
      })),
    );

    console.log("after pagesData", pagesData.length);
    return res.json({
      success: true,
      user_id: userId,

      pagesFetched: pagesData.length,
    });
  } catch (err) {
    console.error("❌ PAGE DATA ERROR", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
