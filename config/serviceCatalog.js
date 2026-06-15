// config/serviceCatalog.js
// Server-side Marketplace (Seller Media Studio) service catalog.
// This is the SINGLE SOURCE OF TRUTH for service pricing — prices are never
// trusted from the client. `amountCents` is the exact amount charged via Stripe.
// Keep the `id` values in sync with the frontend marketplace cards.

const SERVICE_CURRENCY = 'aud';

const SERVICES = [
  {
    id: 'full-media-package',
    name: 'Full Media Package',
    description:
      'Complete cinematic production suite: 25x HDR photography, 4K video walkthrough, detailed 2D floor plan, and 4K drone aerial shots.',
    amountCents: 99900, // A$999.00
    currency: SERVICE_CURRENCY,
  },
  {
    id: 'virtual-staging',
    name: 'Virtual Staging',
    description:
      'Transform vacant spaces into inviting rooms — up to 5 key rooms, 48h turnaround, editorial furniture styling.',
    amountCents: 49900, // A$499.00
    currency: SERVICE_CURRENCY,
  },
  {
    id: 'lidar-spatial-map',
    name: 'LiDAR Spatial Map',
    description:
      'High-precision laser scanning for immersive 3D walkthroughs — 99% measurement accuracy, Matterport integration, renovation planning data.',
    amountCents: 19900, // A$199.00
    currency: SERVICE_CURRENCY,
  },
];

const getServiceById = (id) => SERVICES.find((s) => s.id === id) || null;

module.exports = { SERVICES, getServiceById, SERVICE_CURRENCY };
