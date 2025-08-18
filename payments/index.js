'use strict';

/**
 * Module payments - Point d'entrée principal
 * Architecture modulaire backend-stripe
 */

const paymentService = require('./paymentService');
const paymentRoutes = require('./paymentRoutes');

module.exports = {
  // Services métier
  createCheckoutSession: paymentService.createCheckoutSession,
  handleWebhook: paymentService.handleWebhook,
  createInvoice: paymentService.createInvoice,
  retrievePaymentIntent: paymentService.retrievePaymentIntent,
  processPaymentSuccess: paymentService.processPaymentSuccess,
  processPaymentFailure: paymentService.processPaymentFailure,
  createPaymentAttestation: paymentService.createPaymentAttestation,
  getReceipt: paymentService.getReceipt,
  
  // Routes API
  paymentRoutes,
};