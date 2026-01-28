function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function computeRankScore(position = 10) {
  // Convert Google SERP position → score 100..0
  return Math.max(100 - ((position - 1) * 8), 0);
}

function computeVisibilityScore(rankScore, title = "", query = "") {
  let score = rankScore;
  const keywords = query.toLowerCase().split(" ");
  const titleLower = title.toLowerCase();

  // reward matching query words in result title
  keywords.forEach(k => {
    if (titleLower.includes(k)) score += 2;
  });

  return Math.min(score, 100);
}

module.exports = {
  getHostname,
  computeRankScore,
  computeVisibilityScore
};