const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class StripeService {
  constructor() {
    this.isConfigured = !!process.env.STRIPE_SECRET_KEY;
  }

  async createPaymentIntent(amount, currency = 'aud', metadata = {}) {
    try {
      // Mock response when Stripe is not configured
      if (!this.isConfigured) {
        console.log('Stripe not configured, returning mock payment intent');
        return {
          id: `pi_mock_${Date.now()}`,
          client_secret: `pi_mock_${Date.now()}_secret_mock`,
          amount,
          currency,
          status: 'requires_payment_method'
        };
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return paymentIntent;
    } catch (error) {
      console.error('Stripe Error:', error.message);
      throw new Error(`Payment processing failed: ${error.message}`);
    }
  }

  async confirmPaymentIntent(paymentIntentId) {
    try {
      if (!this.isConfigured) {
        return {
          id: paymentIntentId,
          status: 'succeeded'
        };
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error) {
      console.error('Stripe Confirm Error:', error.message);
      throw new Error('Payment confirmation failed');
    }
  }
}

module.exports = new StripeService();