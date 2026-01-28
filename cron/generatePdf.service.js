const { generatePdf } = require("../controllers/userController"); 

exports.generatePdfCron = async () => {
    await generatePdf();
};
 