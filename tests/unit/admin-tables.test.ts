import { describe, expect, it } from "vitest";
import { tableParams, USER_SORTS } from "@/lib/admin";

describe("admin table params", () => {
  const parse = (sp: Record<string, string>) => tableParams(sp, USER_SORTS, { sort: "created_at", dir: "desc" });

  it("uses defaults for missing or unknown values", () => {
    expect(parse({})).toEqual({ q: "", sort: "created_at", dir: "desc", page: 1, filter: "" });
    expect(parse({ sort: "password_hash", dir: "sideways", page: "-4" })).toMatchObject({ sort: "created_at", dir: "desc", page: 1 });
  });

  it("only accepts whitelisted sort columns", () => {
    expect(parse({ sort: "email", dir: "asc", page: "3" })).toMatchObject({ sort: "email", dir: "asc", page: 3 });
    expect(parse({ sort: "email; DROP TABLE users" }).sort).toBe("created_at");
  });

  it("bounds the search text and page number", () => {
    expect(parse({ q: `  ${"x".repeat(500)}  ` }).q).toHaveLength(100);
    expect(parse({ page: "999999999" }).page).toBe(10_000);
  });
});
