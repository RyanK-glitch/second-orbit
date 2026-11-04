import { describe, expect, it } from "vitest";
import { can, PERMISSIONS } from "@/lib/auth/permissions";

const as = (role: "user" | "moderator" | "admin", suspended = false) => ({ role, suspended });

describe("back-office permissions", () => {
  it("members have no back-office permissions", () => {
    for (const p of PERMISSIONS) expect(can(as("user"), p), p).toBe(false);
  });

  it("moderators can view, moderate and suspend members, but not manage staff, edit listings or categories", () => {
    expect(PERMISSIONS.filter((p) => can(as("moderator"), p))).toEqual(["admin.view", "moderation.act", "users.suspend", "listings.moderate"]);
  });

  it("admins hold every permission", () => {
    for (const p of PERMISSIONS) expect(can(as("admin"), p), p).toBe(true);
  });

  it("suspended staff and signed-out visitors hold nothing", () => {
    for (const p of PERMISSIONS) {
      expect(can(as("admin", true), p)).toBe(false);
      expect(can(null, p)).toBe(false);
    }
  });
});
