const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendPdfMail = async ({ to, subject, html, pdfBuffer }) => {
  await transporter.sendMail({
    from: `"SEO Audit" <${process.env.SMTP_USER}>`,
    to,
    cc:"pranav.a@aquilmedia.in",
    subject,
    html,
    attachments: [
      {
        filename: `seo-audit-${Date.now()}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
};

module.exports = { sendPdfMail };
