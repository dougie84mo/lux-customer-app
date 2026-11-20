// Pure retail logic (no Supabase / React imports, so Jest can load it bare).
// Backend: migration 0247 in ../app/supabase. Hooks live in ./products.
//
// There is no online ordering: products are browse-only and bought in the shop
// at checkout. Nothing here prices a basket — the server does that.

// One row of business_products_public(): a shop's shelf. Stock is a yes/no,
// never a count.
export type BusinessProduct = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_path: string | null;
  in_stock: boolean;
  is_featured: boolean;
};

// One row of my_shop_products(): the same shelf across every shop the caller
// has favourited or is a client of, with a barber's recommendation attached.
export type ShopProduct = BusinessProduct & {
  business_id: string;
  business_name: string;
  recommended: boolean;
  // The barber's first name; '' when the account is gone.
  recommended_by: string | null;
  recommended_note: string | null;
  recommended_at: string | null;
};

export type ShopGroup = {
  businessId: string;
  businessName: string;
  products: ShopProduct[];
};

// One row of my_sale_lines().
export type SaleLine = {
  kind: 'service' | 'retail' | string;
  description: string | null;
  quantity: number;
  amount_cents: number;
};

// The "Recommended for you" strip, in the order the server sent (newest
// recommendation first).
export function recommendedProducts(products: ShopProduct[] | undefined): ShopProduct[] {
  return (products ?? []).filter((p) => p.recommended);
}

// Every product grouped under its shop. Shops and the products inside each keep
// the server's order (shop name, then featured / the shop's own sort) — except
// that the server lists recommended rows first overall, so a shop's group is
// re-sorted to put its shelf back in catalogue order: featured first, the rest
// as sent. Shops are ordered by name.
export function groupProductsByShop(products: ShopProduct[] | undefined): ShopGroup[] {
  const groups = new Map<string, ShopGroup>();
  for (const p of products ?? []) {
    let g = groups.get(p.business_id);
    if (!g) {
      g = { businessId: p.business_id, businessName: p.business_name, products: [] };
      groups.set(p.business_id, g);
    }
    g.products.push(p);
  }
  const out = Array.from(groups.values());
  for (const g of out) {
    // Stable: Array.prototype.sort keeps equal elements in their sent order.
    g.products.sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
  }
  return out.sort((a, b) => a.businessName.localeCompare(b.businessName));
}

// The barber's name for "Recommended by <name>", or null when there is none to
// show (the server sends '' when the recommending account was removed).
export function recommenderName(p: Pick<ShopProduct, 'recommended' | 'recommended_by'>): string | null {
  if (!p.recommended) return null;
  const name = p.recommended_by?.trim();
  return name ? name : null;
}

// Catalogue prices are stored in cents; the catalogue price formatter
// (lib/format formatPrice: "$25" / "$25.50") takes dollars.
export function productPriceDollars(p: Pick<BusinessProduct, 'price_cents'>): number {
  return Math.max(0, p.price_cents) / 100;
}

export type ReceiptBreakdown = {
  // False for every sale written before retail existed (0 / 0): the receipt
  // then renders exactly as it always did.
  hasRetail: boolean;
  servicesCents: number;
  retailCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
};

// retail_cents and tax_cents sit INSIDE gross_cents (0247), so:
//   services = gross - retail - tax,   total = gross + tip (unchanged).
// services + retail + tax + tip always equals the total.
export function receiptBreakdown(sale: {
  gross_cents: number;
  tip_cents: number;
  retail_cents?: number | null;
  tax_cents?: number | null;
}): ReceiptBreakdown {
  const gross = Math.max(0, sale.gross_cents || 0);
  const tip = Math.max(0, sale.tip_cents || 0);
  // Clamped the way the table's check constraint guarantees anyway, so a bad
  // row can never produce a negative services figure.
  const retail = Math.min(Math.max(0, sale.retail_cents ?? 0), gross);
  const tax = Math.min(Math.max(0, sale.tax_cents ?? 0), gross - retail);
  return {
    hasRetail: retail > 0 || tax > 0,
    servicesCents: gross - retail - tax,
    retailCents: retail,
    taxCents: tax,
    tipCents: tip,
    totalCents: gross + tip,
  };
}

// The product lines of a sale, for the itemised part of the receipt.
export function retailLines(lines: SaleLine[] | undefined): SaleLine[] {
  return (lines ?? []).filter((l) => l.kind === 'retail');
}
