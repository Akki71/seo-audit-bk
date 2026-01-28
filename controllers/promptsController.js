const User = require("../models/User");



const UserInformation = async (req, res) => {
  try {
    const userId = req.user.id;
    // const userId=85;
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "username", "email"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  UserInformation,

};
