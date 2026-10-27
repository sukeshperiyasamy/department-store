/**
 * SaaS Subscription Plans & Feature Matrix Configuration.
 *
 * All prices are illustrative proposed pricing subject to commercial sign-off.
 * Clear boundaries are documented between shared mobile access and dedicated
 * customer-branded mobile apps.
 */

export interface PricingPlan {
  id: "starter" | "growth" | "enterprise";
  name: string;
  tagline: string;
  billingFrequency: string;
  indicativePriceINR: number | null; // null represents "Custom / Contact Sales"
  isPopular?: boolean;
  maxCounters: number;
  features: string[];
  mobileAccessNotes: string;
  supportLevel: string;
  ctaText: string;
  ctaHref: string;
}

export const SAAS_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter Store",
    tagline: "Essential POS billing and catalog management for single-counter retail shops.",
    billingFrequency: "per month (indicative, billed annually)",
    indicativePriceINR: 1499,
    maxCounters: 1,
    features: [
      "1 Windows POS billing counter terminal",
      "Full offline SQLite durable transaction queue",
      "Item catalog up to 5,000 SKUs",
      "ESC/POS thermal receipt printing (80mm)",
      "Daily sales summary & cash/UPI reporting",
      "Standard India GST tax templates & invoices",
      "Automatic local database backup runner",
    ],
    mobileAccessNotes: "Shared mobile web dashboard access included (responsive browser view).",
    supportLevel: "Standard email and documentation support",
    ctaText: "Start with Starter",
    ctaHref: "/register?plan=starter",
  },
  {
    id: "growth",
    name: "Growth Multi-Counter",
    tagline: "High-throughput billing and inventory tracking for departmental stores with 2–5 counters.",
    billingFrequency: "per month (indicative, billed annually)",
    indicativePriceINR: 3499,
    isPopular: true,
    maxCounters: 5,
    features: [
      "Up to 5 concurrent Windows POS counters",
      "Full multi-counter concurrency & claim-based deduplication",
      "Item catalog up to 50,000 SKUs with barcode aliases",
      "Batch tracking & expiry notifications (7/30/60 day alerts)",
      "ZPL / TSPL barcode label printing engine",
      "Tamil & Tanglish catalog search ranking",
      "Advanced sales returns & allocated credit notes",
      "Automated Windows Task Scheduler backup automation",
    ],
    mobileAccessNotes: "Planned shared platform mobile app access (when launched on App Store/Play Store).",
    supportLevel: "Priority email & WhatsApp business hours support",
    ctaText: "Choose Growth",
    ctaHref: "/register?plan=growth",
  },
  {
    id: "enterprise",
    name: "Departmental Premium",
    tagline: "Full-scale departmental store operations with custom integrations and dedicated white-label options.",
    billingFrequency: "custom quote",
    indicativePriceINR: null, // Contact sales
    maxCounters: 25,
    features: [
      "Unlimited Windows POS counter terminals",
      "High-concurrency MariaDB optimization & dedicated worker tuning",
      "Unlimited catalog SKUs and multi-warehouse support",
      "Optional dedicated white-label mobile app (separate custom build/signing/release workflow)",
      "Custom ERPNext workflow customization & ledger mappings",
      "Dedicated account manager & migration assistance",
      "Enterprise SLA & custom disaster recovery replication",
    ],
    mobileAccessNotes: "Optional custom customer-branded mobile app (separate build, publishing, and maintenance workflow).",
    supportLevel: "24/7 emergency response & dedicated account engineer",
    ctaText: "Contact for Custom Plan",
    ctaHref: "/request-demo?plan=enterprise",
  },
];

export const PRICING_DISCLAIMERS = [
  "All displayed plan prices are proposed illustrative tiers subject to formal commercial sign-off and mutual agreement.",
  "Applicable GST (18%) and statutory taxes will be applied at billing.",
  "Payment gateway processing fees (if applicable for online collections) and physical hardware costs (computers, barcode scanners, printers) are separate.",
  "Shared mobile app access is planned as part of the unified platform roadmap. Dedicated customer-branded mobile apps (with custom name/icon on app stores) are a separate premium offering requiring individual developer accounts and release maintenance.",
];
