import { PROVIDER_LABEL, type OAuthProfile } from "./providers";

/**
 * What to do with a social sign-in that isn't linked to anyone yet. Pure, so the rules are unit tested.
 *
 * Auto-linking to an existing account by email is only safe when the provider vouches for the
 * address (Google/Apple `email_verified`). Facebook never does, Apple relay addresses never match
 * a real account, and staff accounts always link manually from Settings after a password sign-in.
 */
export type ExistingAccount = { id: string; role: "user" | "moderator" | "admin"; suspended: boolean } | null;

export type LinkDecision =
  | { kind: "create" }
  | { kind: "link"; userId: string }
  | { kind: "refuse"; reason: OAuthErrorCode };

export const OAUTH_ERRORS = {
  cancelled: "Sign-in was cancelled. You can try again or use your email and password.",
  failed: "We couldn't complete that sign-in. Please try again.",
  expired: "That sign-in took too long or was opened in another browser. Please start again.",
  unavailable: "That sign-in option isn't available right now.",
  no_email: "Your account didn't share an email address with us. Allow email access, or sign up with email and password.",
  unverified_email: "That provider hasn't verified your email address, so we can't use it to sign you in. Sign up with email and password instead.",
  email_exists: "An account with this email already exists. Sign in with your password, then connect this provider in Settings.",
  staff_link: "Staff accounts can't be linked automatically. Sign in with your password, then connect this provider in Settings.",
  suspended: "This account is suspended.",
  already_linked: "That social account is already connected to a different member.",
  link_session: "Your session changed during linking. Sign in and try again.",
} as const;
export type OAuthErrorCode = keyof typeof OAUTH_ERRORS;

export function decideNewSignIn(profile: OAuthProfile, existingByEmail: ExistingAccount): LinkDecision {
  if (!profile.email) return { kind: "refuse", reason: "no_email" };
  if (existingByEmail) {
    if (existingByEmail.suspended) return { kind: "refuse", reason: "suspended" };
    if (!profile.emailVerified || profile.isPrivateEmail || profile.provider === "facebook") return { kind: "refuse", reason: "email_exists" };
    if (existingByEmail.role !== "user") return { kind: "refuse", reason: "staff_link" };
    return { kind: "link", userId: existingByEmail.id };
  }
  // A new account needs an address we can trust to be theirs, or anyone could squat an email.
  // Facebook emails are confirmed by Facebook before they're shared, so they may create (but never link) accounts.
  if (!profile.emailVerified && profile.provider !== "facebook") return { kind: "refuse", reason: "unverified_email" };
  return { kind: "create" };
}

/** Display name for a brand-new account: provider name, else the part of the email before @. */
export function displayNameFor(profile: OAuthProfile): string {
  const fromEmail = profile.isPrivateEmail ? "" : (profile.email?.split("@")[0] ?? "").replace(/[._+-]+/g, " ");
  const name = (profile.name ?? "").trim() || fromEmail.trim() || `${PROVIDER_LABEL[profile.provider]} member`;
  return name.length >= 2 ? name : `${name} (${PROVIDER_LABEL[profile.provider]})`;
}
