const express = require('express');
const router = express.Router();
const userController = require('../controllers/auditController');
const { authenticateToken } = require("../middlewares/auth");

router.post('/getUrl',authenticateToken,userController.getUrl);
// router.get("/analytics/accounts", authenticateToken, getGAAccounts);

router.get('/generatePdf',authenticateToken, userController.generatePdf);
router.get('/userData',authenticateToken, userController.userData);

// router.post('/getLLMResponse', userController.getLLMResponse);
router.get('/generatePageData',authenticateToken,userController.generatePageData);

// router.get('/renderAuditReport', userController.renderAuditReport);



module.exports = router;
