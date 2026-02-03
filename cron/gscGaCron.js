const cron = require("node-cron");
const { Op } = require("sequelize");
const { Brand } = require("../models");

const { collectAndStoreGSCDataForBrand } = require("../services/gscService");
const { collectAndStoreGADataForBrand } = require("../services/gaService");

let isRunning = false;

cron.schedule("31 18 * * *", async () => {
  console.log("🔥 GSC + GA CRON TRIGGERED");
  console.log("🕒 Time:", new Date().toISOString());

  if (isRunning) {
    console.log("⚠️ Cron already running, skipping");
    return;
  }

  isRunning = true;

  try {
    const brands = await Brand.findAll({
      where: {
        site_url: { [Op.ne]: null },
      },
    });

    console.log(`🔎 Brands found: ${brands.length}`);

    for (const brand of brands) {
      console.log("\n==============================");
      console.log(`🏷 Brand ID: ${brand.id}`);
      console.log(`🌐 Site URL: ${brand.site_url}`);

      /* =====================
           GSC
        ===================== */
      if (!brand.gsc_refresh_token || brand.gsc_refresh_token.trim() === "") {
        console.log("⏭ GSC: SKIPPED (no refresh token)");
      } else {
        try {
          console.log("📊 GSC: START");
          await collectAndStoreGSCDataForBrand(brand);
          console.log("✅ GSC: SUCCESS");
        } catch (gscErr) {
          console.error("❌ GSC: FAILED", gscErr.message);
        }
      }

      /* =====================
           GA
        ===================== */
      if (!brand.property_id) {
        console.log("⏭ GA: SKIPPED (no GA property)");
      } else {
        try {
          console.log("📈 GA: START");
          await collectAndStoreGADataForBrand(brand);
          console.log("✅ GA: SUCCESS");
        } catch (gaErr) {
          console.error("❌ GA: FAILED", gaErr.message);
        }
      }
    }

    console.log("\n🎉 GSC + GA CRON COMPLETED");
  } catch (err) {
    console.error("❌ CRON FAILED:", err);
  } finally {
    isRunning = false;
    console.log("🔓 Cron lock released");
  }
});
