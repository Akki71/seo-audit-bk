const bcrypt = require('bcryptjs');
const Brand = require("../models/Brand");

const getBrand = async (req, res) => {
  try {
    const userId = req.user.id; 
// const userId=85;
    const brand = await Brand.findOne({
      where: { user_id: userId },
      attributes: [
        "id",
        "brand_name",
        "domain",
        "region",
        "image_url",
        "refresh_token",
        "site_url",
        "property_id"
      ]
    });

    if (!brand) {
      return res.status(404).json({ message: "Brand not found for this user" });
    }

  
    const brandData = brand.toJSON();

 
    brandData.has_refresh_token = brandData.refresh_token ? 1 : 0;
    brandData.has_gsc_data = brandData.site_url ? 1 : 0;
    brandData.has_analytics_data = brandData.property_id ? 1 : 0;


    delete brandData.refresh_token;
    delete brandData.site_url;
    delete brandData.property_id;



    return res.json({
      success: true,
      data: brandData
    });

  } catch (error) {
    console.error("Error fetching brand:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};


module.exports = {  getBrand };
