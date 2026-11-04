import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Cookie notice" };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie notice" intro="We only use the cookies the site needs in order to work.">
      <p>We don&apos;t use advertising or tracking cookies, so there&apos;s nothing to accept or decline. Analytics, when switched on, come from Plausible, which sets no cookies.</p>
      <p>Your light or dark mode choice is kept in your own browser. It isn&apos;t a cookie and is never sent to us.</p>
      <h2>Cookies we set</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th scope="col">Name</th><th scope="col">Why</th><th scope="col">Lasts</th></tr></thead>
          <tbody>
            <tr><td><code>so_session</code></td><td>Keeps you signed in</td><td>30 days</td></tr>
            <tr><td><code>so_2fa</code></td><td>Remembers that your password was correct while you enter a two-factor code</td><td>10 minutes</td></tr>
            <tr><td><code>so_oauth_state</code></td><td>Protects Google, Apple and Facebook sign-in from forgery</td><td>10 minutes</td></tr>
          </tbody>
        </table>
      </div>
    </LegalPage>
  );
}
