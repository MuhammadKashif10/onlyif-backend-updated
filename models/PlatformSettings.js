const mongoose = require('mongoose');

const PlatformSettingsSchema = new mongoose.Schema(
  {
    commissionRate: { type: Number, default: 3.0 },
    platformFee: { type: Number, default: 99 },
    listingFee: { type: Number, default: 299 },
    contactEmail: { type: String, default: 'admin@onlyif.com' },
    contactPhone: { type: String, default: '+1 (555) 123-4567' },
    companyAddress: { type: String, default: '123 Real Estate St, City, State 12345' },
    termsOfService: { type: String, default: '' },
    privacyPolicy: { type: String, default: '' },
    maintenanceMode: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false }
  },
  { timestamps: true }
);

PlatformSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('PlatformSettings', PlatformSettingsSchema);