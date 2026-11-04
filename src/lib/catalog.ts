/** Shared, client-safe catalogue constants. */

export const CONDITIONS = ["mint", "excellent", "good", "fair"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const GRADES: Record<Condition, { label: string; rank: number; summary: string }> = {
  mint: { label: "Mint", rank: 4, summary: "Looks and works like new. No visible signs of use; often with original box." },
  excellent: { label: "Excellent", rank: 3, summary: "Light signs of use you'd only spot up close. Fully functional." },
  good: { label: "Good", rank: 2, summary: "Visible wear such as scuffs or fading. Everything works as it should." },
  fair: { label: "Fair", rank: 1, summary: "Heavy wear or a minor, disclosed defect. Priced to reflect it." },
};

export const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "condition", label: "Condition: best first" },
  { value: "relevance", label: "Best match" },
] as const;
export type SortKey = (typeof SORTS)[number]["value"];

export const REPORT_REASONS = [
  { value: "counterfeit", label: "Counterfeit or replica" },
  { value: "misleading", label: "Misleading condition or photos" },
  { value: "prohibited", label: "Prohibited item" },
  { value: "scam", label: "Scam or off-platform payment request" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
] as const;

export const DISPUTE_REASONS = [
  { value: "not_received", label: "Item hasn't arrived" },
  { value: "not_as_described", label: "Not as described (condition, wear or specs)" },
  { value: "damaged", label: "Arrived damaged" },
  { value: "counterfeit", label: "Appears counterfeit" },
  { value: "other", label: "Another problem" },
] as const;

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid: funds held",
  shipped: "Shipped",
  delivered: "Delivered: inspection window",
  completed: "Completed",
  disputed: "Disputed: funds on hold",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  pre_transit: "Label created",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  return_to_sender: "Returning to sender",
  failure: "Delivery problem",
  unknown: "Status unknown",
};
