function issue() {
  return { activeIssues: 0, pagesAffected: new Set() };
}
const hit = (b, url) => {
  b.activeIssues++;
  b.pagesAffected.add(url);
};

exports.analyzeSeoIssues = (pages = []) => {
  const report = {
    contentQuality: {
      lowTextContent: issue(),
      imagesMissingAlt: issue()
    },
    indexableContent: {
      missingTitle: issue(),
      titleTooLong: issue(),
      missingMetaDescription: issue(),
      missingH1: issue(),
      multipleH1: issue()
    },
    security: {
      missingHSTS: issue(),
      missingCSP: issue(),
      missingXCTO: issue(),
      missingXFO: issue(),
      missingReferrerPolicy: issue()
    },
    internalLinks: {
      orphanPages: issue()
    }
  };

  for (const page of pages) {
    if (!page?.data) continue;

    const { url, data, headers } = page;

    // Content Quality
    if (data.body_text.split(" ").length < 300)
      hit(report.contentQuality.lowTextContent, url);

    if (data.images.some(img => !img.alt))
      hit(report.contentQuality.imagesMissingAlt, url);

    // Indexable
    if (!data.title) hit(report.indexableContent.missingTitle, url);
    if (data.title.length > 60) hit(report.indexableContent.titleTooLong, url);
    if (!data.meta_description)
      hit(report.indexableContent.missingMetaDescription, url);
    if (!data.h1.length) hit(report.indexableContent.missingH1, url);
    if (data.h1.length > 1)
      hit(report.indexableContent.multipleH1, url);

    // Security
    if (!headers?.hsts) hit(report.security.missingHSTS, url);
    if (!headers?.csp) hit(report.security.missingCSP, url);
    if (!headers?.xcto) hit(report.security.missingXCTO, url);
    if (!headers?.xfo) hit(report.security.missingXFO, url);
    if (!headers?.referrerPolicy)
      hit(report.security.missingReferrerPolicy, url);

    // Internal Links
    if (data.internalLinks.length < 3)
      hit(report.internalLinks.orphanPages, url);
  }

  const normalize = obj =>
    Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k,
        {
          activeIssues: v.activeIssues,
          pagesAffected: v.pagesAffected.size
        }
      ])
    );

  return Object.fromEntries(
    Object.entries(report).map(([k, v]) => [k, normalize(v)])
  );
};
