const cron = require("node-cron");
const { generatePdfCron } = require("./generatePdf.service");

cron.schedule("0 0 * * *", async () => {
  console.log("🕛 Midnight SEO PDF generation started");

  try {
    await generatePdfCron();
    console.log("✅ SEO PDF generation completed");
  } catch (err) {
    console.error("❌ SEO PDF generation failed:", err.message);
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

console.log("⏰ SEO Cron Job Initialized");
