import { notFound, redirect } from "next/navigation";
import { can, type Permission } from "./permissions";
import { getCurrentUser, isModerator, staffNeedsTwoFactor, type SessionUser } from "./session";

const STAFF_SETUP_PAGE = "/account/settings?two_factor=required#security";

function requireStaffTwoFactor(user: SessionUser) {
  if (staffNeedsTwoFactor(user)) redirect(STAFF_SETUP_PAGE);
}

/** For server components: the signed-in user, or a redirect to sign-in that returns here. */
export async function requirePageUser(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  if (user.suspended) redirect("/signin?suspended=1");
  return user;
}

export async function requirePageModerator(next: string) {
  const user = await requirePageUser(next);
  if (!isModerator(user)) redirect("/");
  requireStaffTwoFactor(user);
  return user;
}

/** For back-office pages. Signed-out users go to sign-in; signed-in users without the permission get a 404. */
export async function requirePagePermission(permission: Permission, next: string) {
  const user = await requirePageUser(next);
  if (!can(user, permission)) notFound();
  requireStaffTwoFactor(user);
  return user;
}
