const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.post('/getUrl', userController.getUrl);
router.get('/generatePdf', userController.generatePdf);
// router.get('/renderAuditReport', userController.renderAuditReport);



module.exports = router;
