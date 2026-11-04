import { describe, expect, it } from "vitest";
import { computeFees, dollarsToCents, formatCents, savingsPct } from "@/lib/money";
import { cleanLine, cleanText, looksLikeOffPlatformPayment, wearList } from "@/lib/sanitize";
import { safeNext } from "@/lib/http";
import { toPrefixQuery } from "@/lib/listings";

describe("fees", () => {
  it("charges buyer protection with a $1 minimum and takes the platform fee from the seller", () => {
    const f = computeFees(2000, 400, { protection: 300, platform: 800 });
    expect(f.protectionFeeCents).toBe(100); // 3% of $20 = $0.60 → $1 minimum
    expect(f.platformFeeCents).toBe(160);
    expect(f.totalCents).toBe(2000 + 400 + 100);
    expect(f.sellerPayoutCents).toBe(2000 + 400 - 160);
  });

  it("scales protection with price", () => {
    expect(computeFees(62900, 1200, { protection: 300, platform: 800 }).protectionFeeCents).toBe(1887);
  });

  it("formats and parses money", () => {
    expect(formatCents(38900)).toBe("$389");
    expect(formatCents(4999)).toBe("$49.99");
    expect(formatCents(1000, true)).toBe("$10.00");
    expect(dollarsToCents("12.345")).toBe(1235);
    expect(savingsPct(389, 799)).toBe(51);
    expect(savingsPct(100, 50)).toBe(0);
  });
});

describe("untrusted text", () => {
  it("strips control, bidi-override and zero-width characters", () => {
    expect(cleanLine("Sony‮gpj.exe​ headphones\u0007")).toBe("Sonygpj.exe headphones");
    expect(cleanLine("  multi\nline\ttitle  ")).toBe("multi line title");
  });

  it("keeps paragraphs but collapses runs of blank lines", () => {
    expect(cleanText("a\r\n\r\n\r\n\r\nb  \n c")).toBe("a\n\nb\n c");
  });

  it("does not try to 'sanitise' HTML: it stays literal text and React escapes it on render", () => {
    expect(cleanText("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });

  it("turns wear notes into a clean list", () => {
    expect(wearList("- scratch on back\n\n• dent\n  * faded strap ")).toEqual(["scratch on back", "dent", "faded strap"]);
  });

  it("flags off-platform payment requests", () => {
    expect(looksLikeOffPlatformPayment("pay me on Zelle instead")).toBe(true);
    expect(looksLikeOffPlatformPayment("Is the battery original?")).toBe(false);
  });

  it("only allows same-site redirects after sign-in", () => {
    expect(safeNext("/account/orders")).toBe("/account/orders");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
  });
});

describe("search query builder", () => {
  it("builds a prefix tsquery from words only", () => {
    expect(toPrefixQuery("Sony head")).toBe("sony:* & head:*");
  });

  it("neutralises tsquery operators and injection attempts", () => {
    expect(toPrefixQuery("a' | b) & !c:*")).toBe("a:* & b:* & c:*");
    expect(toPrefixQuery("'); DROP TABLE listings;--")).toBe("drop:* & table:* & listings:*");
    expect(toPrefixQuery("   ")).toBeNull();
  });

  it("strips accents so it matches the unaccented index", () => {
    expect(toPrefixQuery("Poäng café")).toBe("poang:* & cafe:*");
  });
});
