class InvoiceGenerationService {
  static async generateInvoicePDF(invoice, property, agent) {
    try {
      const invoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        property: {
          title: property.title,
          price: property.price
        },
        amount: invoice.totalAmount,
        date: invoice.createdAt,
        paymentMethods: [{
          type: 'bank_transfer',
          details: {
            bankName: 'Trust Account',
            accountName: agent.name,
            accountNumber: agent.bankAccountNumber, // Make sure this is included
            reference: `PROP-${property._id.toString().slice(-6)}`
          }
        }]
      };

      // Log to verify data
      console.log('Generating PDF with payment details:', {
        accountName: agent.name,
        accountNumber: agent.bankAccountNumber,
        reference: `PROP-${property._id.toString().slice(-6)}`
      });

      return invoiceData;
    } catch (error) {
      console.error('Error generating invoice PDF:', error);
      throw error;
    }
  }
}