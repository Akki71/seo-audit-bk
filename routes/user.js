const express = require("express");
const {

  getBrand,
} = require("../controllers/userController");


const {
  UserInformation,
} = require("../controllers/promptsController");

const { authenticateToken } = require("../middlewares/auth");

const router = express.Router();
  
router.use(authenticateToken);


router.get("/getbrand", getBrand);

router.get("/userinfo", UserInformation);

module.exports = router;
