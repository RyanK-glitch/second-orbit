import { forbidden } from "../http";
import type { SessionUser } from "./session";

/**
 * Role → permission map for the back office. Every admin page and API route checks one
 * of these on the server; the UI only hides what the server would refuse anyway.
 */
export const PERMISSIONS = [
  "admin.view", // overview, read-only tables (users, listings, orders), audit log
  "moderation.act", // resolve reports and disputes
  "users.suspend", // disable/enable regular member accounts, revoke sessions
  "users.manage", // change roles, disable staff accounts
  "listings.moderate", // remove/restore listings
  "listings.edit", // edit listing fields, feature
  "categories.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<SessionUser["role"], readonly Permission[]> = {
  user: [],
  moderator: ["admin.view", "moderation.act", "users.suspend", "listings.moderate"],
  admin: PERMISSIONS,
};

export const can = (user: Pick<SessionUser, "role" | "suspended"> | null, permission: Permission) =>
  !!user && !user.suspended && ROLE_PERMISSIONS[user.role].includes(permission);

/** Pure so the rule can be unit tested; `required` comes from config. */
export const missingStaffTwoFactor = (user: Pick<SessionUser, "role" | "twoFactorEnabled">, required: boolean) =>
  required && user.role !== "user" && !user.twoFactorEnabled;

export function assertCan(user: SessionUser, permission: Permission) {
  if (!can(user, permission)) throw forbidden();
}
