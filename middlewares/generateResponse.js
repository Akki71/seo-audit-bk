const OpenAI = require("openai");
const { marked } = require("marked");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
//17-01-2026
exports.generateResponse = async (pages = [], ga = null, gsc = null) => {
  try {
    let analyticsSection = "";
    let gscSection = "";

    // ✅ GA Conditional Block
    if (ga && Object.keys(ga).length > 0) {
      analyticsSection = `
====================
GOOGLE ANALYTICS (GA4)
====================
${JSON.stringify(ga, null, 2)}
`;
    }

if (gsc && gsc.summary?.web) {
gscSection = `
=========================
GOOGLE SEARCH CONSOLE (GSC)
=========================

SITE PERFORMANCE SUMMARY (SOURCE OF TRUTH):
- impressions: ${gsc.summary.web.impressions}
- clicks: ${gsc.summary.web.clicks}
- ctr: ${gsc.summary.web.ctr}
- avg_position: ${gsc.summary.web.avg_position}

Search-Visible Pages (GSC Sample): ${gsc.summary.totalPages}
Total Search Queries (Sample): ${gsc.summary.totalQueries}
Date Range: ${gsc.summary.startDate} to ${gsc.summary.endDate}

IMPORTANT LIMITATION:
- GSC data includes ONLY pages with impressions
- This is NOT a full index coverage report

Top Pages Performance:
${JSON.stringify(gsc.topPages.slice(0, 20), null, 2)}
`;

}

const prompt = `
You are a Principal SEO Auditor & Growth Analyst working for enterprise clients.
You specialize in:
- Technical SEO
- On-page optimization
- GA4 + GSC performance analysis
- AEO (Answer Engine Optimization)
- GEO (Generative Engine Optimization)
 
You MUST behave like a professional audit system.
Your output will be consumed by dashboards and business teams.
 

 
====================================
INPUT DATA
====================================
 
[GOOGLE ANALYTICS]
${analyticsSection || "NO GA DATA PROVIDED"}
 
[GOOGLE SEARCH CONSOLE]
${gscSection || "NO GSC DATA PROVIDED"}
 
[ON-PAGE PAGES SAMPLE]
${JSON.stringify(pages.slice(0, 50), null, 2)}
 ====================================
GA & GSC DATA USAGE RULES (MANDATORY)
====================================

These rules are STRICT and MUST be followed:

1. If GSC SITE PERFORMANCE SUMMARY is provided:
   - impressions MUST come from:
     gsc.summary.web.impressions
   - clicks MUST come from:
     gsc.summary.web.clicks
   - ctr MUST come from:
     gsc.summary.web.ctr
   - avg_position MUST come from:
     gsc.summary.web.avg_position

2. These values MUST be reused:
   - In Section 3 (Ranking & Visibility Issues)
   - In SEO PERFORMANCE SCORE calculation
   - In FINAL GRAPH DATA OUTPUT JSON

3. If GA data is present:
   - Use sessions, engagement, conversions ONLY if explicitly provided
   - Do NOT invent traffic trends

4. If any metric is missing:
   - Explicitly state data is missing
   - Set corresponding graph JSON value to 0
   - Do NOT infer or estimate values

5. Top Search Queries:
   - Represent REAL keyword demand
   - Use them for keyword strategy ONLY
   - Do NOT invent new keywords

====================================
REPORT OBJECTIVE
====================================
 
Generate a **professional SEO audit report** with strict structure.
Every insight MUST reference actual fields or URLs from the input.
 
Do NOT give generic advice.
If evidence is missing, say so explicitly.
 
====================================
OUTPUT FORMAT RULES
====================================
 
- Use clear section headers exactly as listed.
- Use bullet points.
- Tag every recommendation with priority:
  [HIGH] [MEDIUM] [LOW]
- Reference affected URLs wherever possible.
- Quantify issues whenever possible (% or count).
- Avoid marketing language. Be precise.
 

The Executive Summary MUST begin with a narrative paragraph similar in tone and
structure to a professional SEO consultant report.

Example style (do NOT copy verbatim):
"The website for <Brand Name> demonstrates a solid digital foundation; however,
several on-page, technical, and content-related gaps are limiting its organic
search performance and visibility."
====================================
1. Executive SEO Health Summary
====================================

Start with a short professional paragraph (3–4 lines) describing the overall SEO
condition of the website using the brand name.

Tone:
- Strategic
- Consultant-style
- Non-technical
- No URLs
- No page-level references

Then include:

Overall SEO Health Status:
- Rate as: Excellent / Good / Average / Below Average
- Justify in 2–3 lines

Top 3 Critical Risks:
- NO URLs
- NO page names
- Use qualitative assessment only
- Each risk must be explained in 2–3 lines
- Use wording like:
  "Below Average", "Needs Improvement", "Moderate Risk"

Top 3 Growth Opportunities:
- NO URLs
- Strategic-level opportunities only
- Explain impact and benefit in 2–3 lines each

Evidence References:
- Summarize evidence types ONLY (no URLs)
- Example:
  "Based on analysis of title tags, H1 structure, meta descriptions, and internal linking patterns across the site."

 
====================================
2. Traffic & Conversion Insights (GA-Based)
====================================

- Traffic trend direction
- Engagement quality signals
- Conversion bottlenecks
- Best and worst performing pages (URLs)

 
====================================
3. Ranking & Visibility Issues (GSC-Based)
====================================

- Indexed vs non-indexed pages
- Low CTR pages with impressions
- Declining visibility URLs
====================================
3B. Keyword Insights & Optimization Strategy (GSC-Based)
====================================

Using ONLY the provided GSC topQueries data:

- Classify keywords into:
  • Branded
  • Non-branded
  • Service / commercial intent
  • Informational intent

For EACH keyword group:
- Explain current performance (clicks, impressions, CTR)
- Identify missed opportunities (high impressions, low clicks)
- Recommend:
  • Which keywords to prioritize
  • Which keywords to expand with modifiers
  • Which keywords are not worth pursuing

Keyword Recommendation Rules:
- Base suggestions ONLY on existing GSC keywords
- You MAY suggest keyword variations by:
  • Adding service modifiers (services, company, agency)
  • Adding location modifiers (city, region)
  • Adding intent modifiers (pricing, solutions, development)
- Do NOT invent unrelated keywords
- Clearly explain WHY each recommendation is made

====================================
4A. Sitewide On-Page SEO Overview (Aggregate Only)
====================================
Analyze ONLY aggregate patterns across the site:

- Presence of missing title tags (use qualitative terms such as: none, few, some, several, widespread)
- Occurrence of duplicate title tags (qualitative assessment only)
- Presence of missing H1 tags (qualitative assessment only)
- Overall strength of meta descriptions (weak / inconsistent / generally strong)
- General title length patterns (too short / optimal / too long)

STRICT RULES:
- Do NOT include numbers, percentages, or counts
- Do NOT reference individual URLs
- Do NOT audit individual pages
- Use only qualitative descriptors (e.g., "some pages", "several pages", "widespread issue")

 
❌ Do NOT audit individual pages here.
 
====================================
4B. Media & Visual Optimization (AEO + GEO)
====================================
Analyze images:
- Resolution adequacy
- Alt text quality
- Image relevance to content
- Pages with weak visual quality
 
You MUST list affected URLs when possible.
 
====================================
5. Internal Linking & Content Gaps
====================================
- Orphan pages
- Shallow content pages
- Missing topical clusters
- Internal link imbalance
 
====================================
6A. Technical SEO Risks & Fixes
====================================
Evaluate the site for:
- Indexability issues
- Status code problems
- Thin or low-value pages
- Duplicate content risks

For EACH issue:
- Describe the problem (data-backed)
- Explain WHY it is a risk
- Specify WHAT needs to be fixed
- Tag priority: High / Medium / Low

Output format:
- Issue
- Affected pages (examples)
- Impact
- Recommended fix
- Priority

------------------------------------
6B. AEO Readiness Analysis & Improvements
------------------------------------
Evaluate the site’s readiness for Answer Engines
(featured snippets, People Also Ask, voice search).

Analyze:
- Presence of question-based headings
- Direct answer formatting (40–60 word blocks)
- Use of lists and tables
- FAQ content & schema
- Snippet eligibility at page level

You MUST:
- Identify pages with AEO potential
- Identify pages failing AEO requirements
- Explain WHY each page fails or succeeds
- Provide SPECIFIC improvement actions

For EACH opportunity:
- Page / page type
- Current limitation
- Recommended improvement
- Expected outcome (snippet / PAA / voice)
- Priority (High / Medium / Low)

------------------------------------
6C. GEO Readiness Analysis & Improvements
------------------------------------
Evaluate the site’s optimization for Generative AI
(ChatGPT, Gemini, Perplexity, AI Overviews).

Analyze:
- Entity clarity & consistency
- Brand & author mentions
- Structured data signals
- Content trustworthiness
- Citation & AI attribution readiness

You MUST:
- Identify content AI engines would trust
- Identify content AI engines would ignore or misinterpret
- Explain the reason clearly
- Provide ACTIONABLE GEO improvements

For EACH improvement:
- Page / content type
- Current weakness
- Recommended fix
- How this improves AI visibility or citation
- Priority (High / Medium / Low)

 
====================================
7. High-Impact Fixes (Quick Wins)
====================================
List fixes achievable in <30 days.
Each item must include:
- Impact level
- Effort level
- Expected outcome
 
====================================
8. 30-Day SEO Action Plan
====================================
Week 1 → Technical
Week 2 → On-page
Week 3 → Content + Internal links
Week 4 → Measurement
 
====================================
9. SEO Scoring Methodology
====================================
 
You MUST calculate scores ONLY from provided data.
 
SEO HEALTH SCORE (0–100):
- On-page quality (titles, H1, meta)
- Content depth
- Internal linking
- Technical signals
 
SEO PERFORMANCE SCORE (0–100):
- GSC impressions vs clicks
- CTR efficiency
- Ranking spread
- Indexed coverage
 
Scoring Rules:
90–100 = Excellent
70–89  = Good
50–69  = Average
<50    = Weak
 
Explain exactly what reduced the score.
 
====================================
10. GRAPH DATA OUTPUT (MANDATORY)
====================================
 
At the END of your response output ONLY valid JSON inside a markdown block.
 
NO TEXT before or after JSON block.
 
STRUCTURE EXACTLY:
 
{
  "seo_health_score": number,
  "seo_health_breakdown": {
    "on_page": number,
    "content": number,
    "internal_links": number,
    "technical": number
  },
  "seo_performance_score": number,
  "performance_metrics": {
    "impressions": number,
    "clicks": number,
    "ctr": number,
    "avg_position": number
  }
}
 
RULES:
- Numbers only
- No null
- No comments
- No strings
- No trailing commas
If data missing → use 0
If data exists in GSC summary → MUST reuse exact numeric values

 
====================================
FINAL QUALITY RULES
====================================
✅ No invented metrics
✅ Evidence-based insights only
✅ Page references where possible
✅ Clear business language
❌ No fluff
❌ No generic SEO advice
`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // fast & cost effective
      messages: [
        {
          role: "system",
          content: "You are an expert SEO consultant."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 3500
    });
      // const htmlContent = marked.parse(response.choices[0].message.content);

      const raw = response.choices[0].message.content;

// extract JSON block
const jsonMatch = raw.match(/```json([\s\S]*?)```/);
const graphData = jsonMatch ? JSON.parse(jsonMatch[1]) : null;

// remove json from text
const cleanText = raw.replace(/```json[\s\S]*?```/, "");

const htmlContent = marked.parse(cleanText);

return {
  success: true,
  content: htmlContent,
  graphData
};

    // return {
    //   success: true,
    //   content: htmlContent
    // };

  } catch (error) {
    console.error("❌ ChatGPT SEO Report Error:", error);
    return {
      success: false,
      message: error.message
    };
  }
};

exports.generatePageLevelAudit = async (pagesChunk = []) => {
  try {
const prompt = `
You are a senior SEO auditor.

Analyze EACH page below.
DO NOT skip any page.

STRICT OUTPUT TEMPLATE (MANDATORY):

For EACH page, output EXACTLY in this format:

URL: <page_url>
- Current Title: "<existing_title_or_N/A>"
- Title Tag: MUST FIX / CAN IMPROVE – suggested improved title (1 line only)
- Current Meta Description: "<existing_meta_or_N/A>"
- Meta Description: MUST FIX / CAN IMPROVE – suggested improved meta (1 line only)
- H1 Tag: MUST FIX / CAN IMPROVE – short reason (1 line only)

FORMAT RULES (VERY IMPORTANT):
❌ Do NOT write paragraphs
❌ Do NOT merge pages
❌ Do NOT add explanations longer than 1 line
❌ Do NOT add headings
❌ Do NOT add page numbers
❌ Do NOT add blank lines inside a page block
✅ Always use bullet points (-)
✅ Leave ONE blank line BETWEEN pages
✅ Add "---" after EACH page block
✅ Follow EXACT ordering shown above

CONTENT RULES:
- Use ONLY data provided for each page
- If title or meta is missing, write "N/A"
- Suggested improvements must be SEO-optimized but concise
- No marketing language
- Be technical and precise

PAGES:
${JSON.stringify(pagesChunk, null, 2)}
`;


    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 3500
    });

    return marked.parse(response.choices[0].message.content);

  } catch (error) {
    console.error("❌ Page Audit Error:", error);
    return "<p>Failed to generate page audit.</p>";
  }
};


exports.generateSeoAuditJson = async ({
  domain,
  pagesData,
  gaData,
  gscData,
  auditFacts
}) => {
  try {
const prompt = `
you are expert in seo 
You are an automated SEO Audit JSON Generator.

You MUST generate ONE valid JSON object.
This JSON will be used directly for dashboards and PDF rendering.

==========================
ABSOLUTE RULES (MANDATORY)
==========================
1. Output ONLY valid JSON
2. NO markdown
3. NO backticks
4. NO explanations
5. NO extra keys
6. Follow schema EXACTLY
7. NEVER invent numbers
8. Use PROVIDED FACTS ONLY
9. If a fact is explicitly null → use null
10. Arrays must be [] if empty
11. Grades must use only: A+, A, B+, B, C+, C, D+, D, F

==========================  
PRE-COMPUTED AUDIT FACTS
==========================
These values are VERIFIED.
You MUST reuse them.

${JSON.stringify(auditFacts, null, 2)}
==========================
DATA PRESERVATION RULE (CRITICAL)
==========================
The following fields are ALREADY fully computed inside auditFacts.
You MUST output them EXACTLY as provided.
DO NOT summarize, rename, restructure, omit, or modify them.

If these fields are missing or altered, the output is INVALID.
You MUST copy them verbatim from auditFacts into the final JSON:

- social_links
- security_checks
- technical_fixes

If a value exists in auditFacts, it MUST appear in the output JSON.
If a value is an object or array, preserve its full structure.
==========================
INPUT ANALYTICS DATA
==========================
[GA DATA]
${JSON.stringify(gaData)}

[GSC DATA]
${JSON.stringify(gscData)}

==========================
DATA AVAILABILITY FLAGS
==========================
- Google Analytics present: ${!!gaData}
- Google Search Console present: ${!!gscData}
- Total pages crawled: ${pagesData.length}

==========================
GRADING INSTRUCTIONS
==========================
Derive qualitative grades conservatively using provided data ONLY.

- on_page → use title, meta, H1, schema issues
- usability → infer from structure and crawl data
- performance → if no CWV or PSI data exists → F

===================================
30-Day SEO Action Plan
====================================
Week 1 → Technical
Week 2 → On-page
Week 3 → Content + Internal links
Week 4 → Measurement

The action plan must be reflected inside JSON output under:
"top_priority_action_plan"

Structure example:
"top_priority_action_plan": {
  "week_1_technical": [],
  "week_2_on_page": [],
  "week_3_content_internal_links": [],
  "week_4_measurement": [],
  "page": 14
}

Rules:
- Use ONLY issues detected in auditFacts
- Do NOT invent tasks
- If no tasks exist → return empty array []
- Each item must be a short actionable sentence
- Maximum 6 items per week

==========================
OVERVIEW SCORES (CRITICAL)
==========================

You MUST ALWAYS generate grades for ALL overview_scores fields.

Rules:
- overview_scores.on_page → REQUIRED
- overview_scores.links → REQUIRED
- overview_scores.usability → REQUIRED
- overview_scores.performance → REQUIRED
- overview_scores.social → REQUIRED

Grades MUST be one of:
A+, A, B+, B, C+, C, D+, D, F

IMPORTANT:
- Grades must NEVER be null
- If data is weak or missing → assign a LOW grade (D+ or F)
- If performance data (CWV / PSI) is missing → performance MUST be "F"
- If social signals are missing → social MUST be "F"
- Conservative grading is REQUIRED

====================================
10. GRAPH DATA OUTPUT (MANDATORY)
====================================

At the END of your response output ONLY valid JSON inside the SAME JSON object.

Add a new section called:
"graph_data"

STRUCTURE EXACTLY:

"graph_data": {
  "seo_health_score": 0,
  "seo_health_breakdown": {
    "on_page": 0,
    "content": 0,
    "internal_links": 0,
    "technical": 0
  },
  "seo_performance_score": 0,
  "performance_metrics": {
    "impressions": 0,
    "clicks": 0,
    "ctr": 0,
    "avg_position": 0
  },
  "page": 15
},

RULES:
- Numbers only
- No null
- No strings
- No comments
- No trailing commas
- If data missing → use 0
- If data exists in GSC summary → MUST reuse exact numeric values


====================================
GA & GSC DATA USAGE RULES (MANDATORY)
====================================

These rules are STRICT and MUST be followed:

1. If GSC SITE PERFORMANCE SUMMARY is provided:
   - impressions MUST come from:
     gsc.summary.web.impressions
   - clicks MUST come from:
     gsc.summary.web.clicks
   - ctr MUST come from:
     gsc.summary.web.ctr
   - avg_position MUST come from:
     gsc.summary.web.avg_position

2. These values MUST be reused:
   - In SEO PERFORMANCE SCORE calculation
   - In FINAL graph_data JSON

3. If GA data is present:
   - Use sessions, engagement, conversions ONLY if explicitly provided
   - Do NOT invent traffic trends

4. If any metric is missing:
   - Set corresponding graph JSON value to 0
   - Do NOT infer or estimate values

5. Top Search Queries:
   - Represent REAL keyword demand
   - Use them for keyword strategy ONLY
   - Do NOT invent new keywords
   ===================================
30-Day SEO ACTION PLAN (MANDATORY)
===================================

You MUST ALWAYS generate a complete actionable 30-day SEO plan.

The plan MUST be generated using:
- auditFacts
- GA data (if present)
- GSC data (if present)
- pagesData crawl issues
- technical_fixes
- meta_description_optimization

You are NOT allowed to return empty arrays.

If a category has limited issues:
- Still generate best-practice improvements based on available data.
- Convert weak signals into optimization tasks.
- Use conservative SEO logic.

Each week MUST contain 3–6 actionable items.

Each task MUST:
- Be short
- Be implementation-ready
- Reference real issues when possible
- Avoid generic marketing language
- Avoid fake metrics
- Avoid invented numbers

You MUST prioritize in this order:
1. Critical technical blockers
2. Indexing and crawlability
4. On-page optimization
5. Internal linking and content
6. Measurement and tracking

-----------------------------------
WEEK DEFINITIONS
-----------------------------------

Week 1 → Technical Foundation
Focus on:
- Sitemap
- Robots
- Schema
- HTTPS
- Redirects
- Page speed bottlenecks
- Broken links
- Crawlability
- Core Web Vitals

Week 2 → On-Page Optimization
Focus on:
- Title duplication
- Title length issues
- Missing meta descriptions
- H1 / H2 structure issues
- URL readability
- Image alt text
- Content relevance

Week 3 → Content & Internal Linking
Focus on:
- Pages with low impressions / clicks (from GSC)
- Content expansion opportunities
- Internal link distribution
- Anchor optimization
- Top performing pages scaling
- Thin content strengthening

Week 4 → Measurement & Growth
Focus on:
- GA event tracking
- Conversion tracking
- GSC indexing validation
- Performance monitoring
- Ranking tracking
- Dashboard validation
- Monthly benchmarking

-----------------------------------
OUTPUT FORMAT (STRICT)
-----------------------------------

You MUST output this structure inside final JSON:

"top_priority_action_plan": {
  "week_1_technical": [ ... ],
  "week_2_on_page": [ ... ],
  "week_3_content_internal_links": [ ... ],
  "week_4_measurement": [ ... ],
  "page": 14
}

Rules:
- Each array must contain between 3 and 6 items.
- Do NOT return empty arrays.
- Do NOT repeat the same task in multiple weeks.
- Do NOT invent unavailable metrics.
- Do NOT mention missing data.
- Tasks must be actionable and specific.

Example of acceptable task style:
- "Submit sitemap.xml in Google Search Console and validate index coverage."
- "Fix duplicate title tags on product pages identified in audit."
- "Compress images missing size attributes to improve LCP."
- "Add internal links from high-traffic pages to underperforming service pages."
- "Configure GA conversion tracking for primary lead form."

==========================
KEYWORD STRATEGY RULES
==========================
Generate keyword_strategy using:
- GSC top queries
- impressions/click data
- page topics
- crawl structure
- content gaps from auditFacts

Rules:
- Do NOT copy example text
- Do NOT use generic SEO phrases
- Use site-specific logic
- Each item must reference real signals
- 3–6 items

==========================
CONTENT STRATEGY RULES
==========================
Generate content_strategy using:
- thin pages
- missing content signals
- low-impression pages
- content gaps
- GSC queries
- crawl depth

Rules:
- Do NOT reuse template phrases
- Must be site-specific
- Actionable content ideas
- 3–6 items

==========================
ROADMAP RULES
==========================
Generate roadmap using:
- technical_fixes
- auditFacts priorities
- performance gaps
- crawl issues
- indexability issues

Rules:
- Strategic (not tasks)
- Outcome-focused
- No generic SEO statements
- 3–6 items

==========================
THREE MAIN SEARCH RANKING FACTORS RULES
==========================
Generate three_main_search_ranking_factors.factors using:
- site weaknesses
- auditFacts
- GSC performance patterns

Rules:
- Must be site-specific
- Not generic SEO theory
- Based on detected issues
- Exactly 3 items

==========================
CONTENT WISE STUDY RULES
==========================
Generate content_wise_study.insights using:
- page structure data
- meta/title issues
- H1/H2 issues
- internal linking gaps
- performance data

Rules:
- Observational insights
- Evidence-based
- Site-specific
- 3–6 items

==========================
ACTIVITIES REQUIRED RULES
==========================
Generate activities_required.actions using:
- auditFacts
- technical_fixes
- crawl issues
- GA/GSC insights
- performance gaps

Rules:
- Must be executable tasks
- No strategy language
- No generic SEO phrasing
- Site-specific
- 4–8 actions

==========================
JSON SCHEMA (MANDATORY)
==========================
{

"document_title": ${JSON.stringify(domain?.domain ?? null)},
  "overview_scores": {
    "on_page": null,
    "links": null,
    "usability": null,
    "performance": null,
    "social": null,
    "page": 2
  },

  "basic_setup": {
    "google_analytics_found": ${!!gaData},
    "google_search_console_found": ${!!gscData},
"google_search_console_note": ${JSON.stringify(
  gscData ? "GSC data available for analysis" : null
)},
    "google_my_business_found": false,
    "page": 3
  },
  "broken_links": {
    "contains_broken_links": ${auditFacts.totals.broken_links > 0},
    "rows": [],
    "page": 12
  },
"top_priority_action_plan": {
  "week_1_technical": [""],
  "week_2_on_page": [""],
  "week_3_content_internal_links": [""],
  "week_4_measurement": [""],
  "page": 14
},

"graph_data": {
  "seo_health_score": 0,
  "seo_health_breakdown": {
    "on_page": 0,
    "content": 0,
    "internal_links": 0,
    "technical": 0
  },
  "seo_performance_score": 0,
  "performance_metrics": {
    "impressions": 0,
    "clicks": 0,
    "ctr": 0,
    "avg_position": 0
  },
  "page": 15
},


"voice_search": {
  "faq_present": false,
  "optimized": false,
  "page": 30
},
 
"mobile_usability": {
  "viewport_ok": true,
  "tap_targets_ok": true,
  "responsive": true,
  "page": 31
},
 
"social_links": ${JSON.stringify(auditFacts.social_links)},

 
"competitors": [
  {
    "name": "Competitor A",
    "traffic": 1200,
    "backlinks": 340
  },
  {
    "name": "Competitor B",
    "traffic": 890,
    "backlinks": 210
  }
],
 
"llm_visibility": {
  "entity_ready": false,
  "schema_ready": false,
  "brand_mentions": 0,
  "page": 34
},

 
"keyword_strategy": [],
 
"content_strategy": [],
 
"roadmap": [],
 
"three_main_search_ranking_factors": {
  "factors": [],
  "page": 37
},

"content_wise_study": {
  "insights": [],
  "page": 38
},

"activities_required": {
  "actions": [],
  "page": 39
}

}
`;


    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 7000
    });
console.log("Response", response)
    return JSON.parse(response.choices[0].message.content);

  } catch (err) {
    console.error("❌ SEO JSON Audit Error:", err);
    throw err;
  }
};


