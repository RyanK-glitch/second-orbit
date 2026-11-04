/**
 * Realistic sample catalogue used by `npm run db:seed`.
 * Prices are in dollars here and converted to cents when seeding.
 * `daysAgo` spreads listing dates so "recently listed" looks alive.
 */
export type SeedSeller = { name: string; location: string; rating: number; reviews: number; sales: number; since: number; verified: boolean; responds: string };
export type SeedListing = {
  id: string; title: string; category: string; brand: string; condition: "mint" | "excellent" | "good" | "fair";
  price: number; originalPrice: number; originalNote?: string; shipping: number; pickupOnly?: boolean; daysAgo: number;
  featured?: boolean; stock?: number; shape: string; hue: number; seller: string; description: string; wear: string[];
  specs: Record<string, string>;
};

export const CATEGORIES = [
  { id: "electronics", name: "Electronics", blurb: "Phones, laptops, audio" },
  { id: "fashion", name: "Fashion", blurb: "Jackets, shoes, bags" },
  { id: "furniture", name: "Furniture", blurb: "Seating, storage, lighting" },
  { id: "books", name: "Books", blurb: "Fiction, tech, art" },
  { id: "home", name: "Home & Kitchen", blurb: "Coffee, cookware" },
  { id: "hobby", name: "Sports & Hobby", blurb: "Bikes, instruments" },
];

export const SELLERS: Record<string, SeedSeller> = {
  s1: { name: "Maya Chen", location: "Portland, OR", rating: 4.9, reviews: 212, sales: 340, since: 2019, verified: true, responds: "within 1 hour" },
  s2: { name: "Jonas Weber", location: "Austin, TX", rating: 4.7, reviews: 88, sales: 131, since: 2021, verified: true, responds: "within 3 hours" },
  s3: { name: "Priya Raman", location: "Chicago, IL", rating: 5.0, reviews: 46, sales: 52, since: 2022, verified: true, responds: "within 2 hours" },
  s4: { name: "Leo Okafor", location: "Brooklyn, NY", rating: 4.6, reviews: 154, sales: 290, since: 2018, verified: true, responds: "same day" },
  s5: { name: "Sofia Lindqvist", location: "Seattle, WA", rating: 4.8, reviews: 63, sales: 77, since: 2020, verified: false, responds: "within a day" },
  s6: { name: "Carlos Mendes", location: "San Diego, CA", rating: 4.4, reviews: 29, sales: 34, since: 2023, verified: false, responds: "within a day" },
  s7: { name: "Hana Sato", location: "Denver, CO", rating: 4.9, reviews: 120, sales: 188, since: 2020, verified: true, responds: "within 1 hour" },
  s8: { name: "Ben Adeyemi", location: "Atlanta, GA", rating: 4.8, reviews: 97, sales: 150, since: 2019, verified: true, responds: "within 2 hours" },
};

// `daysAgo` keeps "recently listed" fresh whenever the demo is opened.
// `shape` picks the product illustration in images.js. `hue` tints its backdrop.
export const LISTINGS: SeedListing[] = [
  // ---- Electronics
  {
    id: "iphone-13-midnight", title: "Apple iPhone 13 — 128 GB, Starlight", category: "electronics", brand: "Apple",
    condition: "excellent", price: 389, originalPrice: 799, shipping: 8, daysAgo: 0.2, featured: true, shape: "phone", hue: 200, seller: "s1",
    description: "Unlocked, works on all major carriers. Battery health 89%. Always used with a case and screen protector, so the body is in great shape. Factory reset and removed from my Apple ID.",
    wear: ["Two hairline scratches on the screen, invisible when the display is on", "Tiny scuff on the bottom-left corner of the frame"],
    specs: { Storage: "128 GB", Battery: "89% health", Carrier: "Unlocked", Included: "USB-C to Lightning cable" },
  },
  {
    id: "sony-wh1000xm4", title: "Sony WH-1000XM4 Noise-Cancelling Headphones", category: "electronics", brand: "Sony",
    condition: "good", price: 139, originalPrice: 349, shipping: 7, daysAgo: 1.5, shape: "headphones", hue: 260, seller: "s2",
    description: "Noise cancelling and Bluetooth multipoint both work perfectly. Battery still lasts around 25 hours. Comes with the hard case and the 3.5 mm cable.",
    wear: ["Ear pad leather is slightly creased (replacement pads are about $15)", "Light shine on the headband from use"],
    specs: { Colour: "Black", Battery: "~25 hrs per charge", Connection: "Bluetooth 5.0, 3.5 mm", Included: "Case, audio cable, USB-C cable" },
  },
  {
    id: "fujifilm-xt30", title: "Fujifilm X-T30 with XC 15–45 mm Lens", category: "electronics", brand: "Fujifilm",
    condition: "excellent", price: 629, originalPrice: 999, shipping: 12, daysAgo: 3, featured: true, shape: "camera", hue: 30, seller: "s3",
    description: "Shutter count about 6,200. Mostly used for travel, always kept in a padded bag. Sensor recently cleaned. Two batteries and charger included.",
    wear: ["Light wear on the top-plate paint near the shutter dial", "No marks on the lens glass"],
    specs: { Sensor: "26.1 MP APS-C", "Shutter count": "~6,200", Lens: "XC 15–45 mm f/3.5–5.6", Included: "2 batteries, charger, strap" },
  },
  {
    id: "macbook-air-m1", title: 'MacBook Air M1 13" — 8 GB / 256 GB', category: "electronics", brand: "Apple",
    condition: "good", price: 529, originalPrice: 999, shipping: 15, daysAgo: 5, shape: "laptop", hue: 210, seller: "s4",
    description: "Fast and quiet, handles everyday work and light photo editing easily. Battery cycle count 412, health 86%. Freshly reinstalled macOS.",
    wear: ["Small dent on the rear-left corner of the lid (see the detail photo)", "Faint keyboard imprint on the screen coating, only visible when the screen is off"],
    specs: { Chip: "Apple M1", Memory: "8 GB", Storage: "256 GB SSD", Battery: "86% health, 412 cycles", Included: "Original 30 W charger" },
  },
  {
    id: "switch-oled", title: "Nintendo Switch OLED — White", category: "electronics", brand: "Nintendo",
    condition: "mint", price: 249, originalPrice: 349, shipping: 10, daysAgo: 0.6, featured: true, shape: "gamepad", hue: 320, seller: "s7",
    description: "Got it as a gift and barely played it. Screen protector fitted from day one. Comes complete in the original box with dock, Joy-Cons and all cables.",
    wear: ["None visible, it's essentially new"],
    specs: { Storage: "64 GB", Included: "Dock, Joy-Cons, grip, HDMI, power adapter, box" },
  },
  {
    id: "garmin-fr245", title: "Garmin Forerunner 35 GPS Running Watch", category: "electronics", brand: "Garmin",
    condition: "fair", price: 49, originalPrice: 169.99, shipping: 5, daysAgo: 9, shape: "watch", hue: 160, seller: "s6",
    description: "GPS, heart rate and notifications all work. Holds about 5 days of charge with daily runs. A good watch for training on a budget.",
    wear: ["Several visible scratches on the bezel", "Strap is worn and slightly stretched, and a new one costs around $12", "Charging cable is a third-party replacement"],
    specs: { Battery: "~5 days", Water: "5 ATM", Included: "Charging cable (third-party)" },
  },

  // ---- Fashion
  {
    id: "levis-trucker", title: "Classic Denim Trucker Jacket — Men's M", category: "fashion", brand: "",
    condition: "good", price: 38, originalPrice: 98, shipping: 6, daysAgo: 2, shape: "jacket", hue: 220, seller: "s5",
    description: "Classic mid-wash trucker jacket, nicely broken in. Fits true to size. Machine washed cold and line dried.",
    wear: ["Natural fading on the elbows and cuffs", "One button has a small chip in its enamel"],
    specs: { Size: "M (chest 40–42 in)", Material: "100% cotton denim", Colour: "Mid-wash blue" },
  },
  {
    id: "nike-airmax-90", title: "Nike Air Max 90 — US 10, Infrared", category: "fashion", brand: "Nike",
    condition: "excellent", price: 64, originalPrice: 130, shipping: 9, daysAgo: 0.9, shape: "sneaker", hue: 0, seller: "s8",
    description: "Worn about five times, mostly indoors. Cleaned before listing. Comes with original laces, no box.",
    wear: ["Very light creasing on the toe box", "Soles are clean, with minimal tread wear"],
    specs: { Size: "US 10 / EU 44", Colour: "White / Grey / Infrared", Box: "Not included" },
  },
  {
    id: "patagonia-nano-puff", title: "Patagonia Nano Puff Jacket — Men's L, Orange", category: "fashion", brand: "Patagonia",
    condition: "excellent", price: 92, originalPrice: 239, shipping: 8, daysAgo: 4, featured: true, shape: "jacket", hue: 140, seller: "s1",
    description: "Warm, light and packs into its own pocket. Worn for one winter. No tears, rips or loose stitching. Zippers run smoothly.",
    wear: ["Very slight pilling under the arms"],
    specs: { Size: "L", Colour: "Orange", Insulation: "PrimaLoft Gold Eco" },
  },
  {
    id: "coach-crossbody", title: "Coach Signature Canvas Crossbody Bag — Khaki", category: "fashion", brand: "Coach",
    condition: "good", price: 85, originalPrice: 295, shipping: 7, daysAgo: 6, shape: "bag", hue: 25, seller: "s3",
    description: "Signature coated canvas with leather trim and an adjustable strap. Interior is clean, with no stains or odours. Authenticity serial number inside.",
    wear: ["Corner rubbing on the bottom edges", "Small pen mark on the inner lining"],
    specs: { Dimensions: "9 × 6.5 × 2.5 in", Material: "Coated canvas, leather trim", Strap: "Adjustable, 22 in drop" },
  },
  {
    id: "docmartens-1460", title: "Dr. Martens 1460 Boots — UK 6, Black", category: "fashion", brand: "Dr. Martens",
    condition: "fair", price: 45, originalPrice: 170, shipping: 10, daysAgo: 12, shape: "boot", hue: 340, seller: "s4",
    description: "Fully broken in, so you can skip the painful part. Still plenty of life left in the soles. Recently cleaned and polished.",
    wear: ["Deep creases across the toes", "Heel tab stitching has started to fray", "Scuff on the right toe cap that polish only partly covers"],
    specs: { Size: "UK 6 / US W8 / US M7", Colour: "Black smooth leather" },
  },

  // ---- Furniture
  {
    id: "ikea-poang", title: "IKEA Poäng Armchair — Birch with Beige Cushion", category: "furniture", brand: "IKEA",
    condition: "good", price: 55, originalPrice: 149, shipping: 0, pickupOnly: true, daysAgo: 1, shape: "chair", hue: 45, seller: "s5",
    description: "Comfortable bouncy armchair. The cushion cover is removable and was just washed. From a smoke-free, pet-free home.",
    wear: ["Light scratches on the armrests", "Cushion has flattened slightly with use"],
    specs: { Dimensions: "27 × 32 × 39 in", Frame: "Birch veneer", Delivery: "Local pickup only (Seattle)" },
  },
  {
    id: "teak-sideboard", title: "Vintage Walnut Buffet Sideboard", category: "furniture", brand: "Vintage",
    condition: "excellent", price: 420, originalPrice: 1200, originalNote: "estimated retail for a comparable piece", shipping: 85, daysAgo: 7, featured: true, shape: "sideboard", hue: 30, seller: "s7",
    description: "Solid walnut and veneer buffet with two cabinet doors and dovetailed drawers. Professionally refinished last year. Very solid, with no wobble.",
    wear: ["Faint water ring on the top, softened by refinishing", "Some veneer patina on the left door, normal for its age"],
    specs: { Dimensions: "70 × 18 × 30 in", Material: "Walnut, walnut veneer", Era: "c. 1950s", Delivery: "Freight, or pickup in Denver" },
  },
  {
    id: "aeron-size-b", title: "Herman Miller Aeron Chair — Size B, Fully Loaded", category: "furniture", brand: "Herman Miller",
    condition: "good", price: 495, originalPrice: 1395, shipping: 60, daysAgo: 2.5, shape: "officechair", hue: 190, seller: "s2",
    description: "Remastered model with PostureFit SL, adjustable arms, tilt limiter and forward tilt. All adjustments work. Mesh is taut, with no tears or sagging.",
    wear: ["Scuffing on the base and casters", "Armrest pads show light wear"],
    specs: { Size: "B (medium)", Model: "Aeron Remastered", Adjustments: "PostureFit SL, 4D arms, forward tilt" },
  },
  {
    id: "brass-arc-lamp", title: "Tulip-Style Round Dining Table with 4 Chairs", category: "furniture", brand: "",
    condition: "excellent", price: 380, originalPrice: 1100, originalNote: "estimated retail for a comparable new set", shipping: 0, pickupOnly: true, daysAgo: 0.4, shape: "table", hue: 50, seller: "s8",
    description: "Mid-century-style pedestal dining table with a white top and four matching tulip chairs. Seats four comfortably. Moving and it won't fit the new place.",
    wear: ["Faint ring marks on the tabletop, only visible in raking light", "One chair cushion is slightly faded"],
    specs: { Table: "Ø 42 in, height 29 in", Chairs: "4 × tulip side chairs", Delivery: "Local pickup only (Atlanta)" },
  },
  {
    id: "oak-dining-table", title: "Solid Oak Dining Table — Seats 6", category: "furniture", brand: "Handmade",
    condition: "fair", price: 260, originalPrice: 900, shipping: 0, pickupOnly: true, daysAgo: 10, shape: "table", hue: 35, seller: "s6",
    description: "Heavy, solid oak farmhouse table. Structurally perfect, but the surface has a lot of character. A great candidate for sanding and refinishing.",
    wear: ["Several knife marks and dents across the top", "Sun-faded patch on one end", "One leg has a repaired chip (glued, solid)"],
    specs: { Dimensions: "72 × 36 × 30 in", Material: "Solid white oak", Delivery: "Local pickup only (San Diego)" },
  },

  // ---- Books
  {
    id: "dune-hardcover", title: "Vintage Hardcover Encyclopedia Set (12 volumes)", category: "books", brand: "",
    condition: "good", price: 45, originalPrice: 240, shipping: 4, daysAgo: 3.5, shape: "book", hue: 30, seller: "s3",
    description: "Complete twelve-volume reference set with colourful cloth bindings. A great shelf piece and still a fun read. Bindings are tight and no pages are missing.",
    wear: ["Spine edges are slightly faded from sunlight", "Pages have toned (yellowed) evenly with age"],
    specs: { Format: "Hardcover × 12", Language: "English", Weight: "About 30 lb" },
  },
  {
    id: "pragmatic-programmer", title: "Hardcover Novel Bundle: 6 Classics", category: "books", brand: "",
    condition: "excellent", price: 30, originalPrice: 90, shipping: 4, daysAgo: 1.2, shape: "book", hue: 200, seller: "s4",
    description: "Six hardcover classic novels, each read once. No writing, highlighting or dog-eared pages. Left over from a book club.",
    wear: ["Slight shelf wear on the cover corners"],
    specs: { Format: "Hardcover × 6", Language: "English" },
  },
  {
    id: "hp-box-set", title: "Harry Potter Complete Paperback Box Set (1–7)", category: "books", brand: "Scholastic",
    condition: "good", price: 42, originalPrice: 89, shipping: 9, daysAgo: 8, shape: "books", hue: 0, seller: "s5",
    description: "All seven books in the original slipcase. Read by one careful reader. All pages are intact.",
    wear: ["Spine creasing on books 4 and 5", "Slipcase is scuffed on one side"],
    specs: { Format: "Paperback × 7 + slipcase", Edition: "Scholastic US" },
  },
  {
    id: "taschen-bauhaus", title: "Bauhaus: Large-Format Art Book (Hardcover)", category: "books", brand: "",
    condition: "mint", price: 28, originalPrice: 60, shipping: 6, daysAgo: 0.1, shape: "book", hue: 0, seller: "s7",
    description: "Large-format art book, still in its shrink wrap. It was a duplicate gift.",
    wear: ["None, still sealed"],
    specs: { Format: "Hardcover", Pages: "256", Language: "English" },
  },

  // ---- Home & Kitchen
  {
    id: "breville-barista", title: "Breville Barista Express Espresso Machine", category: "home", brand: "Breville",
    condition: "good", price: 289, originalPrice: 699, shipping: 30, daysAgo: 4.5, featured: true, shape: "coffee", hue: 15, seller: "s8",
    description: "Pulls great shots. Descaled monthly, new water filter and gasket fitted last month. The grinder works across its full range of settings.",
    wear: ["Scratches on the drip tray cover", "Small cosmetic dent on the left side panel"],
    specs: { Grinder: "Built-in conical burr", Included: "Portafilter, 4 baskets, tamper, milk jug" },
  },
  {
    id: "le-creuset-dutch-oven", title: "Le Creuset 5.5 qt Round Dutch Oven — Cerise", category: "home", brand: "Le Creuset",
    condition: "excellent", price: 165, originalPrice: 420, shipping: 18, daysAgo: 6.5, shape: "pot", hue: 355, seller: "s1",
    description: "Used a handful of times for bread. The enamel interior has no chips or crazing. Heavy and built to last generations.",
    wear: ["Light utensil marks on the interior base, normal for enamel"],
    specs: { Capacity: "5.5 qt", Material: "Enamelled cast iron", Colour: "Cerise red" },
  },

  // ---- Sports & Hobby
  {
    id: "trek-fx2", title: "Trek FX Sport Hybrid Bike — Medium", category: "hobby", brand: "Trek",
    condition: "good", price: 340, originalPrice: 849, shipping: 0, pickupOnly: true, daysAgo: 2.2, featured: true, shape: "bike", hue: 180, seller: "s2",
    description: "A great commuter bike. Serviced last month, with new brake pads and chain. Hydraulic disc brakes, 2×9 drivetrain. Fits riders about 5'5\" to 5'10\".",
    wear: ["Paint chips on the chainstay", "Saddle has a small scuff on its edge"],
    specs: { Frame: "Medium, alloy", Brakes: "Hydraulic disc", Gearing: "2 × 9", Delivery: "Local pickup only (Austin)" },
  },
  {
    id: "fender-strat", title: "Fender Stratocaster — 3-Color Sunburst", category: "hobby", brand: "Fender",
    condition: "excellent", price: 520, originalPrice: 829, shipping: 40, daysAgo: 0.8, featured: true, shape: "guitar", hue: 280, seller: "s6",
    description: "Freshly set up with 10s, low action and no fret buzz. Electronics are clean, with no crackle. Comes with a gig bag.",
    wear: ["Minor pick scratches on the pickguard", "Small finish ding on the back of the neck heel"],
    specs: { Body: "Alder", Neck: "Maple, modern C", Pickups: "3 × Player Series Alnico V", Included: "Gig bag, tremolo arm" },
  },
];

