const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
// const { sendOTP, verifyOTP } = require('../utils/otpService');
const Brand = require('../models/Brand');
const { CompetitorSuggestions } = require('../models');
const OpenAI = require("openai");
// const getDomainAuthority = require("../utils/getDomainAuthority");
const { Op, fn, col, where } = require("sequelize");
// const { generateCompetitors } = require("../config/generateCompetitors");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


const UserRegister = async (req, res) => {                                       
  try {
    const { username, email, password } = req.body;
     
    if (!username || !email || !password ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    //user
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      isVerified:true

    });
    return res.status(201).json({
        success:true,
      message: "Registration successful"

    });
  } catch (error) {
    console.error("Register error:", error);
     if (error.name === "SequelizeUniqueConstraintError" || error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Username or email already exists",
        field: error?.fields,
      });
    }
    res.status(500).json({success:false, message: "Server error", error: error.message });
  }
};

// DOMAIN AUTHORITY ADDED
// const brandRegistration = async (req, res) => {
//   try {
//     console.log("🔥 brandRegistration() called");
//     const userId = req.user.id;
//     const { brand_name, region, domain, keywords, localArea, cities } = req.body;

//     if (!brand_name) {
//       return res.status(400).json({ success: false, message: "Brand name is required" });
//     }
//     if (!Array.isArray(region) || region.length === 0) {
//       return res.status(400).json({ success: false, message: "Region is required" });
//     }
//     if (!Array.isArray(domain) || domain.length === 0) {
//       return res.status(400).json({ success: false, message: "Domain is required" });
//     }
//     if (!Array.isArray(keywords) || keywords.length === 0) {
//       return res.status(400).json({ success: false, message: "Keywords are required" });
//     }

//     const normalizedName = brand_name.trim().toLowerCase();

//     const existingBrand = await Brand.findOne({
//       where: where(fn("LOWER", col("brand_name")), normalizedName),
//     });

//     if (existingBrand) {
//       return res.status(400).json({ success: false, message: "Brand already exists" });
//     }

//     if (localArea && (!Array.isArray(cities) || cities.length === 0)) {
//       return res.status(400).json({
//         success: false,
//         message: "Cities are required for local market"
//       });
//     }

//     const newBrand = await Brand.create({
//       user_id: userId,
//       brand_name,
//       region,
//       domain,
//       keywords,
//       image_url: `https://www.google.com/s2/favicons?domain=${domain[0]}`
//     });

//     const cleanDomain = (d) => {
//       return d
//         .replace(/^(https?:\/\/)/, "")
//         .replace(/^www\./, "")
//         .replace(/\/.*$/, "")
//         .trim()
//         .toLowerCase();
//     };

//     let cleanList = domain.map((d) => cleanDomain(d));
//     cleanList = [...new Set(cleanList)];

//     const authorityResults = [];

//     for (let d of cleanList) {
//       try {
//         const daData = await getDomainAuthority(d);

//         authorityResults.push({
//           domain: d,
//           da: daData.results?.[0]?.domain_authority || null,
//         });

//       } catch (err) {
//         authorityResults.push({
//           domain: d,
//           da: null,
//           error: "Failed to fetch DA"
//         });
//       }
//     }

//     await Brand.update(
//       { domain_authority: JSON.stringify(authorityResults) },
//       { where: { id: newBrand.id } }
//     );

//     const competitors = await generateCompetitors({
//       brand_name,
//       keywords,
//       cities
//     });
    
//     console.log("🤖 AI Competitor Generation Completed");

//     if (!competitors.length) {
//       return res.status(500).json({
//         success: false,
//         message: "No competitors generated from AI models"
//       });
//     }

//     for (const item of competitors) {
//       await CompetitorSuggestions.create({
//         user_id: userId,
//         organization_name: item.competitor_name,
//         domain: item.domain,
//         keywords: item.keywords,
//         image_url: item.image_url,
//         isSelected: false,
//         status: "active"
//       });
//     }

//     await User.update(
//       { brand_register: 1 },
//       { where: { id: userId } }
//     );

//     return res.status(201).json({
//       success: true,
//       message: "Brand Registration successful",
//       domain_authority: authorityResults,
//       competitor_count: competitors.length
//     });

//   } catch (error) {
//     console.error("Register error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: error.message
//     });
//   }
// };


const brandRegistration = async (req, res) => {
  try {
    const userId = req.user.id;
   
    const { brand_name, region, domain, keywords, localArea, cities, country, country_code } = req.body;

    if (!brand_name) {
      return res.status(400).json({ success: false, message: "Brand name is required" });
    }

    if (!Array.isArray(domain) || domain.length === 0) {
      return res.status(400).json({ success: false, message: "Domain is required" });
    }
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ success: false, message: "Keywords are required" });
    }

    const normalizedName = brand_name.trim().toLowerCase();

    const existingBrand = await Brand.findOne({
      where: where(fn("LOWER", col("brand_name")), normalizedName),
    });

    if (existingBrand) {
      return res.status(400).json({ success: false, message: "Brand already exists" });
    }

    if (localArea && (!Array.isArray(cities) || cities.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Cities are required for local market"
      });
    }

    // CREATE BRAND
  await Brand.create({
      user_id: userId,
      brand_name,
      country,
      country_code,
       region: Array.isArray(region) ? region : region ? [region] : null,
      domain,
      keywords,
        localArea: localArea ?? false,
        cities: Array.isArray(cities) ? cities : cities ? [cities] : null,
      image_url: `https://www.google.com/s2/favicons?domain=${domain[0]}`
    });

    // =================================================
    //  ❌ COMMENTED — DOMAIN AUTHORITY FEATURE REMOVED
    // =================================================

    /*
    const cleanDomain = (d) => {
      return d
        .replace(/^(https?:\/\/)/, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "")
        .trim()
        .toLowerCase();
    };

    let cleanList = domain.map((d) => cleanDomain(d));
    cleanList = [...new Set(cleanList)];

    const authorityResults = [];

    for (let d of cleanList) {
      try {
        const daData = await getDomainAuthority(d);
        authorityResults.push({
          domain: d,
          da: daData.results?.[0]?.domain_authority || null,
        });

      } catch (err) {
        authorityResults.push({
          domain: d,
          da: null,
          error: "Failed to fetch DA"
        });
      }
    }

    await Brand.update(
      { domain_authority: JSON.stringify(authorityResults) },
      { where: { id: newBrand.id } }
    );
    */




    await User.update(
      { brand_register: 1 },
      { where: { id: userId } }
    );

    return res.status(201).json({
      success: true,
      message: "Brand Registration successful",
      // domain_authority: authorityResults // commented out
    });

  } catch (error) {
    console.error("Register error:", error);
    
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await User.findOne({ where: { email } });
        
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }


        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (!user.isVerified) {
            return res.status(400).json({ message: 'Please verify your email first' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h' });

        res.json({ message: 'Login successful', token ,user_brand:user.brand_register});
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// const verifyEmail = async (req, res) => {
//     try {
//         const { email, otp } = req.body;

//         if (!email || !otp) {
//             return res.status(400).json({ message: 'Email and OTP are required' });
//         }

//         const result = await verifyOTP(email, otp);
//         if (!result.success) {
//             return res.status(400).json({ message: result.message });
//         }

//         await result.user.update({ isVerified: true });

//         res.json({ message: 'Email verified successfully' });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Server error' });
//     }
// };

// const forgotPassword = async (req, res) => {
//     try {
//         const { email } = req.body;

//         if (!email) {
//             return res.status(400).json({ message: 'Email is required' });
//         }

//         const user = await User.findOne({ where: { email } });
//         if (!user) {
//             return res.status(404).json({ message: 'User not found' });
//         }

//         const otpResult = await sendOTP(email, 'reset');
//         if (!otpResult.success) {
//             return res.status(500).json({ message: 'Failed to send reset email' });
//         }

//         res.json({ message: 'Password reset OTP sent to your email' });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Server error' });
//     }
// };

// const resetPassword = async (req, res) => {
//     try {
//         const { email, otp, newPassword } = req.body;

//         if (!email || !otp || !newPassword) {
//             return res.status(400).json({ message: 'Email, OTP, and new password are required' });
//         }

//         const result = await verifyOTP(email, otp);
//         if (!result.success) {
//             return res.status(400).json({ message: result.message });
//         }

//         const hashedPassword = await bcrypt.hash(newPassword, 10);
//         await result.user.update({ password: hashedPassword });

//         res.json({ message: 'Password reset successfully' });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Server error' });
//     }
// };

module.exports = { UserRegister, brandRegistration, login,
  //  verifyEmail, forgotPassword, resetPassword 
  };
