const express = require('express');
const router = express.Router();
const userController = require('../controllers/auditController');

router.post('/getUrl', userController.getUrl);
router.get('/generatePdf', userController.generatePdf);
router.post('/getLLMResponse', userController.getLLMResponse);
router.get('/generatePageData', userController.generatePageData);


// router.get('/renderAuditReport', userController.renderAuditReport);



module.exports = router;
