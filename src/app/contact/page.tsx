import type { Metadata } from "next";
import Link from "next/link";
import { SimpleForm } from "@/components/SimpleForm";
import { getCurrentUser } from "@/lib/auth/session";
import { config, isLocalApp, isMock } from "@/lib/env";
import { isUuid } from "@/lib/http";

export const metadata: Metadata = { title: "Contact us" };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  const orderId = order && isUuid(order) ? order : undefined;
  const user = await getCurrentUser();
  return (
    <div className="auth-wrap" style={{ maxWidth: 560 }}>
      <div className="glass">
        <h1>Contact us</h1>
        <p className="hint">
          Check the <Link href="/help">help pages</Link> first, as the answer may already be there.
          {orderId && " We'll attach this order to your message."}
        </p>
        <SimpleForm
          endpoint="/api/contact"
          fields={[
            { name: "name", label: "Your name", autoComplete: "name", defaultValue: user?.displayName },
            { name: "email", label: "Email", type: "email", autoComplete: "email", defaultValue: user?.email },
            { name: "topic", label: "Topic", type: "select", options: ["Order problem", "Account help", "Selling", "Privacy request", "Something else"], defaultValue: orderId ? "Order problem" : undefined },
            { name: "message", label: "Message", type: "textarea" },
          ]}
          extra={orderId ? { orderId } : undefined}
          submit="Send message"
          success="Thanks, we've got your message and will reply by email."
        />
        <p className="demo-creds">
          Or email <code>{config.email.support}</code>.
          {isMock("email") && isLocalApp() && <> Test mode: messages land in the <Link href="/mock/inbox">test inbox</Link>.</>}
        </p>
      </div>
    </div>
  );
}
