import EasyPostClient from "@easypost/api";
import { randomUUID } from "node:crypto";
import { config } from "../env";
import type { Address, ShipmentStatus, ShippingAdapter, TrackingEvent } from "./types";

let client: InstanceType<typeof EasyPostClient> | null = null;
export function getEasyPost() {
  client ??= new EasyPostClient(config.easypost.apiKey);
  return client;
}

const toEasyPostAddress = (a: Address) => ({
  name: a.name,
  street1: a.line1,
  street2: a.line2 || undefined,
  city: a.city,
  state: a.state,
  zip: a.postalCode,
  country: a.country || "US",
});

/** EasyPost: rate shopping + label purchase. Test keys (EZTK…) never charge postage. */
export const easypostShipping: ShippingAdapter = {
  name: "easypost",
  async createLabel({ orderId, from, to, parcel }) {
    const ep = getEasyPost();
    const shipment = await ep.Shipment.create({
      to_address: toEasyPostAddress(to),
      from_address: toEasyPostAddress(from),
      parcel: { weight: parcel.weightOz, length: parcel.lengthIn, width: parcel.widthIn, height: parcel.heightIn },
      reference: orderId,
    });
    const bought = await ep.Shipment.buy(shipment.id, shipment.lowestRate());
    return {
      providerShipmentId: bought.id,
      carrier: bought.selected_rate?.carrier ?? "USPS",
      service: bought.selected_rate?.service ?? "",
      trackingCode: bought.tracking_code,
      labelUrl: bought.postage_label?.label_url ?? "",
      status: "pre_transit",
    };
  },
};

/** Verifies an EasyPost webhook and normalises tracker updates. Returns null for other events. */
export function parseEasyPostWebhook(rawBody: Buffer, headers: Record<string, string>) {
  const secret = config.easypost.webhookSecret;
  if (!secret) throw new Error("EASYPOST_WEBHOOK_SECRET is not set");
  const event = getEasyPost().Utils.validateWebhook(rawBody, headers, secret) as {
    id: string;
    description: string;
    result?: { object?: string; tracking_code?: string; status?: string; tracking_details?: Array<{ status: string; message: string; datetime: string; tracking_location?: { city?: string; state?: string } }> };
  };
  if (event.description !== "tracker.updated" && event.description !== "tracker.created") return { eventId: event.id, update: null };
  const r = event.result;
  if (!r?.tracking_code) return { eventId: event.id, update: null };
  const events: TrackingEvent[] = (r.tracking_details ?? []).map((d) => ({
    status: normaliseStatus(d.status),
    message: d.message,
    at: d.datetime,
    location: [d.tracking_location?.city, d.tracking_location?.state].filter(Boolean).join(", ") || undefined,
  }));
  return { eventId: event.id, update: { trackingCode: r.tracking_code, status: normaliseStatus(r.status ?? "unknown"), events } };
}

const KNOWN: ShipmentStatus[] = ["pre_transit", "in_transit", "out_for_delivery", "delivered", "return_to_sender", "failure"];
export const normaliseStatus = (s: string): ShipmentStatus => (KNOWN.includes(s as ShipmentStatus) ? (s as ShipmentStatus) : "unknown");

/** Mock: instant label with a fake tracking number; status is advanced from the order page. */
export const mockShipping: ShippingAdapter = {
  name: "mock",
  async createLabel({ orderId }) {
    const code = `MOCK${randomUUID().replace(/\D/g, "").slice(0, 14).padEnd(14, "0")}`;
    return {
      providerShipmentId: `mock_shp_${orderId}`,
      carrier: "MockPost",
      service: "Ground",
      trackingCode: code,
      labelUrl: `/mock/shipping/label/${orderId}`,
      status: "pre_transit",
    };
  },
};

/** Order the mock tracker walks through. */
export const MOCK_TRACKING_STEPS: { status: ShipmentStatus; message: string }[] = [
  { status: "in_transit", message: "Accepted at origin facility" },
  { status: "out_for_delivery", message: "Out for delivery" },
  { status: "delivered", message: "Delivered, left at front door" },
];
