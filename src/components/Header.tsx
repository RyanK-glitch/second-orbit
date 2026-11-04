import Link from "next/link";
import { getCurrentUser, isModerator } from "@/lib/auth/session";
import { unreadCount } from "@/lib/messaging";
import { CartLink } from "./Cart";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "./ThemeToggle";
import { ChatIcon, HeartIcon, SearchIcon, UserIcon } from "./icons";
import { APP_NAME } from "@/lib/brand";

function HeaderSearch({ id }: { id: string }) {
  return (
    <form className="header-search" role="search" action="/shop">
      <label htmlFor={id} className="visually-hidden">
        Search listings
      </label>
      <input id={id} name="q" type="search" placeholder="Search phones, jackets, lamps…" autoComplete="off" />
      <button type="submit" aria-label="Search">
        <SearchIcon />
      </button>
    </form>
  );
}

export async function Header() {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <MobileNav>
            <Link href="/shop">Shop</Link>
            <Link href="/shop?sort=newest">Just listed</Link>
            <Link href="/sell">Sell an item</Link>
          </MobileNav>
          <Link className="brand" href="/" aria-label={`${APP_NAME} home`}>
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-text">{APP_NAME}</span>
          </Link>
          <HeaderSearch id="header-q" />
          <div className="header-actions">
            <ThemeToggle />
            {user && (
              <Link className="icon-btn" href="/account/saved" aria-label="Saved items">
                <HeartIcon />
              </Link>
            )}
            {user && (
              <Link className="icon-btn" href="/messages" aria-label={`Messages${unread ? `, ${unread} unread` : ""}`}>
                <ChatIcon />
                {unread > 0 && <span className="dot">{unread}</span>}
              </Link>
            )}
            <CartLink />
            {user ? (
              <details className="user-menu">
                <summary className="icon-btn">
                  <UserIcon />
                  <span className="visually-hidden">Account menu</span>
                </summary>
                <div className="menu-panel">
                  <div className="menu-name">{user.displayName}</div>
                  <div className="menu-email">{user.email}</div>
                  <hr />
                  <Link href="/account/orders">Purchases</Link>
                  <Link href="/account/sales">Sales</Link>
                  <Link href="/account/listings">My listings</Link>
                  <Link href="/account/saved">Saved items</Link>
                  <Link href={`/sellers/${user.id}`}>Public profile</Link>
                  <Link href="/account/settings">Settings</Link>
                  {isModerator(user) && <Link href="/admin">Back office</Link>}
                  {isModerator(user) && <Link href="/admin/moderation">Moderation queue</Link>}
                  <hr />
                  <form action="/api/auth/signout" method="post">
                    <button type="submit">Sign out</button>
                  </form>
                </div>
              </details>
            ) : (
              <Link className="btn" href="/signin">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      {/* Small screens: outside the sticky header, so it scrolls away and only the top row stays. */}
      <div className="search-row">
        <div className="container">
          <HeaderSearch id="header-q-small" />
        </div>
      </div>
    </>
  );
}
