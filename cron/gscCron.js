const cron = require("node-cron");
const { Op } = require("sequelize");
const { Brand } = require("../models");
const { collectAndStoreGSCDataForBrand } = require("../services/gscService");

// console.log("🕒 GSC cron file loaded");

let isRunning = false;

cron.schedule(
  "58 8 * * *", 
  async () => {
    console.log("🔥 GSC CRON TRIGGERED");

    if (isRunning) {
      console.log("⚠️ GSC cron already running, skipping");
      return;
    }

    isRunning = true;

    try {
      const brands = await Brand.findAll({
        where: {
          site_url: { [Op.ne]: null },
        },
      });

      console.log(`🔎 Found ${brands.length} brands`);

      for (const brand of brands) {
        if (!brand.gsc_refresh_token || brand.gsc_refresh_token.trim() === "") {
          console.log(
            `⏭ Skipping brand ${brand.id} — missing refresh token`
          );
          continue;
        }

        try {
          await collectAndStoreGSCDataForBrand(brand);
        } catch (brandErr) {
          console.error(
            ` GSC failed for brand ${brand.id}:`,
            brandErr.message
          );
        }
      }

      console.log("✅ GSC cron finished");
    } catch (err) {
      console.error("❌ GSC cron failed:", err);
    } finally {
      isRunning = false;
    }
  },
  {
    timezone: "Asia/Kolkata",
  }
);
