const { Resend } = require('resend');

// Configuration Email
const resend = new Resend(process.env.RESEND_API_KEY);
resend.domains.create({ name: 'novapsy.info' });

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@novapsy.info';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'contact@novapsy.info.test-google-a.com';

module.exports = {
  resend,
  FROM_EMAIL,
  CONTACT_EMAIL
};