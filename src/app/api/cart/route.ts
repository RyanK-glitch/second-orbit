import { quoteCart } from "@/lib/cart";
import { isUuid, route } from "@/lib/http";

export const GET = route(async (req) => {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(isUuid).slice(0, 20);
  return quoteCart(ids);
});
