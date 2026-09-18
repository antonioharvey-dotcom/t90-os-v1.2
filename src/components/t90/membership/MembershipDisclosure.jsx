import React from "react";
import { Link } from "react-router-dom";
import { FileText, Lock } from "lucide-react";

// ── Provider-specific payment disclosures ──
// Only shown for the provider that manages the user's billing.
// Non-store grants (promotional, manual, lifetime, scholarship) show
// no payment disclosure — only Terms / Privacy links.

const APPLE_DISCLOSURE =
  "Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours before the end of the current period. You can manage or cancel your subscription in your App Store account settings.";

const GOOGLE_DISCLOSURE =
  "Payment will be charged to your Google Play account at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours before the end of the current period. You can manage or cancel your subscription in your Google Play subscription settings.";

const STRIPE_DISCLOSURE =
  "This membership is managed through T90's previous web billing provider, Stripe. You can update or cancel this existing subscription through the billing portal. New T90 consumer memberships are purchased through the Apple App Store or Google Play.";

// `provider` is resolved from the server-authoritative entitlement scope.
// `purchaseChannel` is the channel the user is about to purchase through
// (for no-membership / expired states where no entitlement exists yet).
export default function MembershipDisclosure({ provider, purchaseChannel }) {
  const effectiveProvider = purchaseChannel || provider;

  let disclosure = null;
  if (effectiveProvider === "apple") disclosure = APPLE_DISCLOSURE;
  else if (effectiveProvider === "google") disclosure = GOOGLE_DISCLOSURE;
  else if (effectiveProvider === "stripe") disclosure = STRIPE_DISCLOSURE;

  return (
    <div className="space-y-3">
      {disclosure && (
        <p className="text-[11px] font-body text-white/40 leading-[1.45] px-1">
          {disclosure}
        </p>
      )}
      <div className="flex items-center justify-center gap-6">
        <Link
          to="/terms"
          className="flex items-center gap-1.5 text-[12px] font-heading font-bold text-white/55 uppercase tracking-wide min-h-[44px] active:opacity-60"
        >
          <FileText className="w-3.5 h-3.5" strokeWidth={2} /> Terms
        </Link>
        <Link
          to="/privacy"
          className="flex items-center gap-1.5 text-[12px] font-heading font-bold text-white/55 uppercase tracking-wide min-h-[44px] active:opacity-60"
        >
          <Lock className="w-3.5 h-3.5" strokeWidth={2} /> Privacy
        </Link>
      </div>
    </div>
  );
}