import { APP_NAME } from "./brand";
import { formatCents } from "./money";

/**
 * Plain-text transactional emails. Text only, so member-written content can't inject markup, and
 * message bodies are never copied in: an email is a nudge back to the site, which keeps private
 * conversations out of inboxes and makes phishing through our sending domain harder.
 */
type Email = { subject: string; body: string };
type OrderVars = { title: string; orderUrl: string };

const SIGN_OFF = `\n\n-- ${APP_NAME}`;
const mail = (subject: string, ...paragraphs: string[]): Email => ({ subject, body: paragraphs.join("\n\n") + SIGN_OFF });

export const templates = {
  welcome: (v: { name: string; verifyUrl: string }) =>
    mail(`Welcome to ${APP_NAME}, please confirm your email`, `Hi ${v.name},`, "Thanks for joining. Confirm this address so we know how to reach you about your orders:", v.verifyUrl, "The link works for 24 hours."),
  verifyEmail: (v: { verifyUrl: string }) =>
    mail(`Confirm your ${APP_NAME} email`, "Use this link to confirm your email address:", v.verifyUrl, "The link works for 24 hours. If you didn't ask for it, you can ignore this email."),
  passwordReset: (v: { resetUrl: string }) =>
    mail(`Reset your ${APP_NAME} password`, "Use this link to choose a new password:", v.resetUrl, "The link works once, for one hour. If you didn't ask for it, you can ignore this email and your password stays the same."),
  passwordChanged: (_: Record<string, never>) =>
    mail(`Your ${APP_NAME} password was changed`, "Your password was just changed, and every device was signed out.", "If this wasn't you, reset your password straight away and contact support."),
  twoFactorChanged: (v: { enabled: boolean }) =>
    mail(`Two-factor sign-in was turned ${v.enabled ? "on" : "off"}`, `Two-factor sign-in was just turned ${v.enabled ? "on" : "off"} for your account.`, "If this wasn't you, reset your password straight away and contact support."),
  orderPaid: (v: OrderVars) =>
    mail(`Order confirmed: ${v.title}`, `Your payment for "${v.title}" went through. We hold it until you've received the item.`, `Track your order: ${v.orderUrl}`),
  itemSold: (v: OrderVars & { payoutCents: number }) =>
    mail(`You sold ${v.title}`, `"${v.title}" just sold. Please ship it or arrange pickup soon.`, `You'll receive ${formatCents(v.payoutCents, true)} once the buyer has the item.`, `Open the order: ${v.orderUrl}`),
  orderShipped: (v: OrderVars & { carrier: string; trackingCode: string }) =>
    mail(`On its way: ${v.title}`, `"${v.title}" has shipped with ${v.carrier}. Tracking number: ${v.trackingCode}.`, `Follow it here: ${v.orderUrl}`),
  orderDelivered: (v: OrderVars & { windowHours: number }) =>
    mail(`Delivered: ${v.title}`, `"${v.title}" was delivered. You have ${v.windowHours} hours to check it matches the listing.`, `Confirm it, or report a problem: ${v.orderUrl}`),
  inspectionEnding: (v: OrderVars) =>
    mail(`Last chance to check ${v.title}`, `The inspection window for "${v.title}" ends soon. After that, payment goes to the seller automatically.`, `Report a problem or confirm the order: ${v.orderUrl}`),
  disputeOpened: (v: OrderVars) =>
    mail(`A buyer reported a problem with ${v.title}`, `The buyer opened a dispute on "${v.title}", so your payout is on hold while we review it.`, `Add your side of the story: ${v.orderUrl}`),
  disputeResolved: (v: OrderVars & { outcome: string }) =>
    mail(`Dispute decided: ${v.title}`, `We've reached a decision on the dispute for "${v.title}": ${v.outcome}.`, `See the details: ${v.orderUrl}`),
  refundIssued: (v: OrderVars & { amountCents: number }) =>
    mail(`Refund issued: ${v.title}`, `We've refunded ${formatCents(v.amountCents, true)} for "${v.title}" to your original payment method. Banks usually take 5 to 10 days to show it.`, `Order details: ${v.orderUrl}`),
  payoutSent: (v: OrderVars & { amountCents: number }) =>
    mail(`You've been paid for ${v.title}`, `We've released ${formatCents(v.amountCents, true)} for "${v.title}" to your payout account.`, `Order details: ${v.orderUrl}`),
  newMessage: (v: { senderName: string; title: string; conversationUrl: string }) =>
    mail(`New message about ${v.title}`, `${v.senderName} sent you a message about "${v.title}".`, `Read and reply: ${v.conversationUrl}`),
  chargebackSeller: (v: OrderVars) =>
    mail(`Payment under review: ${v.title}`, `The buyer's bank is questioning the card payment for "${v.title}", so your payout is on hold until the bank decides.`, "We send the evidence to the bank for you. You don't need to do anything.", `Order details: ${v.orderUrl}`),
  chargebackStaff: (v: { amountCents: number; reason: string; dueBy: string; adminUrl: string }) =>
    mail(`Chargeback opened for ${formatCents(v.amountCents, true)}`, `Reason given by the bank: ${v.reason || "not stated"}. Evidence is due by ${v.dueBy}.`, `Review it: ${v.adminUrl}`),
  chargebackLost: (v: OrderVars) =>
    mail(`Chargeback decided: ${v.title}`, `The bank decided in the buyer's favour for "${v.title}" and returned the payment to them.`, `Order details: ${v.orderUrl}`),
  contactForm: (v: { name: string; email: string; topic: string; orderId: string | null; message: string }) =>
    mail(`[Contact] ${v.topic} from ${v.name}`, `From: ${v.name} <${v.email}>`, ...(v.orderId ? [`Order: ${v.orderId}`] : []), v.message),
};

export type TemplateName = keyof typeof templates;
export type TemplateVars<T extends TemplateName> = Parameters<(typeof templates)[T]>[0];
