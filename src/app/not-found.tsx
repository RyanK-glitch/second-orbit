import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty glass" style={{ marginTop: 24 }}>
      <h1>That page has drifted out of orbit</h1>
      <p>The item may have been sold or removed.</p>
      <Link className="btn btn-primary" href="/shop">Browse the shop</Link>
    </div>
  );
}
