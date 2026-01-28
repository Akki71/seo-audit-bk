exports.calculateScores = (issues, totalPages) => {
  const score = issueCount =>
    Math.max(0, Math.round(100 - (issueCount / totalPages) * 100));

  return {
    contentQuality: score(
      issues.contentQuality.lowTextContent.activeIssues +
        issues.contentQuality.imagesMissingAlt.activeIssues
    ),
    indexableContent: score(
      Object.values(issues.indexableContent)
        .reduce((a, b) => a + b.activeIssues, 0)
    ),
    security: score(
      Object.values(issues.security)
        .reduce((a, b) => a + b.activeIssues, 0)
    ),
    internalLinks: score(
      issues.internalLinks.orphanPages.activeIssues
    )
  };
};
