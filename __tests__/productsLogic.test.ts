import {
  groupProductsByShop,
  productPriceDollars,
  receiptBreakdown,
  recommendedProducts,
  recommenderName,
  retailLines,
  type SaleLine,
  type ShopProduct,
} from '@/lib/productsLogic';

const product = (over: Partial<ShopProduct> = {}): ShopProduct => ({
  id: 'p1',
  business_id: 'b1',
  business_name: 'Studio Nine',
  name: 'Matte clay',
  description: null,
  price_cents: 2400,
  image_path: null,
  in_stock: true,
  is_featured: false,
  recommended: false,
  recommended_by: null,
  recommended_note: null,
  recommended_at: null,
  ...over,
});

describe('recommendedProducts', () => {
  it('keeps only recommended rows, in the order sent', () => {
    const rows = [
      product({ id: 'a', recommended: true }),
      product({ id: 'b', recommended: true }),
      product({ id: 'c' }),
    ];
    expect(recommendedProducts(rows).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('is empty for no data', () => {
    expect(recommendedProducts(undefined)).toEqual([]);
    expect(recommendedProducts([product()])).toEqual([]);
  });
});

describe('groupProductsByShop', () => {
  it('groups by shop and orders shops by name', () => {
    const rows = [
      product({ id: 'z1', business_id: 'bz', business_name: 'Zen Cuts' }),
      product({ id: 'a1', business_id: 'ba', business_name: 'Alpha Barbers' }),
      product({ id: 'z2', business_id: 'bz', business_name: 'Zen Cuts' }),
    ];
    const groups = groupProductsByShop(rows);
    expect(groups.map((g) => g.businessName)).toEqual(['Alpha Barbers', 'Zen Cuts']);
    expect(groups[1].businessId).toBe('bz');
    expect(groups[1].products.map((p) => p.id)).toEqual(['z1', 'z2']);
  });

  it('keeps a recommended product in its shop, featured first, rest as sent', () => {
    // The server lists recommended rows first overall; inside a shop the shelf
    // goes back to catalogue order.
    const rows = [
      product({ id: 'rec', recommended: true }),
      product({ id: 'feat', is_featured: true }),
      product({ id: 'plain' }),
    ];
    const [group] = groupProductsByShop(rows);
    expect(group.products.map((p) => p.id)).toEqual(['feat', 'rec', 'plain']);
  });

  it('does not mutate the input and handles no data', () => {
    const rows = [product({ id: 'a' }), product({ id: 'b', is_featured: true })];
    groupProductsByShop(rows);
    expect(rows.map((p) => p.id)).toEqual(['a', 'b']);
    expect(groupProductsByShop(undefined)).toEqual([]);
    expect(groupProductsByShop([])).toEqual([]);
  });
});

describe('recommenderName', () => {
  it('returns the trimmed first name of a recommendation', () => {
    expect(recommenderName(product({ recommended: true, recommended_by: ' Marco ' }))).toBe('Marco');
  });

  it('is null when not recommended or the name is blank', () => {
    expect(recommenderName(product({ recommended: false, recommended_by: 'Marco' }))).toBeNull();
    expect(recommenderName(product({ recommended: true, recommended_by: '' }))).toBeNull();
    expect(recommenderName(product({ recommended: true, recommended_by: null }))).toBeNull();
  });
});

describe('productPriceDollars', () => {
  it('converts cents to dollars and never goes negative', () => {
    expect(productPriceDollars({ price_cents: 2450 })).toBe(24.5);
    expect(productPriceDollars({ price_cents: 0 })).toBe(0);
    expect(productPriceDollars({ price_cents: -5 })).toBe(0);
  });
});

describe('receiptBreakdown', () => {
  it('leaves a sale without retail exactly as before', () => {
    const b = receiptBreakdown({ gross_cents: 3000, tip_cents: 500, retail_cents: 0, tax_cents: 0 });
    expect(b).toEqual({
      hasRetail: false,
      servicesCents: 3000,
      retailCents: 0,
      taxCents: 0,
      tipCents: 500,
      totalCents: 3500,
    });
  });

  it('treats missing retail / tax columns as zero', () => {
    const b = receiptBreakdown({ gross_cents: 3000, tip_cents: 0 });
    expect(b.hasRetail).toBe(false);
    expect(b.servicesCents).toBe(3000);
    expect(receiptBreakdown({ gross_cents: 3000, tip_cents: 0, retail_cents: null, tax_cents: null }).totalCents).toBe(
      3000,
    );
  });

  it('carves retail and tax out of gross so the parts add up to the total', () => {
    // $30 service + $24 product + $1.98 tax, $6 tip.
    const b = receiptBreakdown({ gross_cents: 5598, tip_cents: 600, retail_cents: 2400, tax_cents: 198 });
    expect(b.hasRetail).toBe(true);
    expect(b.servicesCents).toBe(3000);
    expect(b.retailCents).toBe(2400);
    expect(b.taxCents).toBe(198);
    expect(b.totalCents).toBe(6198);
    expect(b.servicesCents + b.retailCents + b.taxCents + b.tipCents).toBe(b.totalCents);
  });

  it('handles a retail-only sale', () => {
    const b = receiptBreakdown({ gross_cents: 2400, tip_cents: 0, retail_cents: 2400, tax_cents: 0 });
    expect(b.hasRetail).toBe(true);
    expect(b.servicesCents).toBe(0);
    expect(b.totalCents).toBe(2400);
  });

  it('never produces a negative services figure from a bad row', () => {
    const b = receiptBreakdown({ gross_cents: 1000, tip_cents: 0, retail_cents: 900, tax_cents: 500 });
    expect(b.servicesCents).toBe(0);
    expect(b.servicesCents + b.retailCents + b.taxCents + b.tipCents).toBe(b.totalCents);
  });
});

describe('retailLines', () => {
  it('keeps only the product lines', () => {
    const lines: SaleLine[] = [
      { kind: 'service', description: 'Haircut', quantity: 1, amount_cents: 3000 },
      { kind: 'retail', description: 'Matte clay', quantity: 2, amount_cents: 4800 },
    ];
    expect(retailLines(lines)).toEqual([lines[1]]);
    expect(retailLines(undefined)).toEqual([]);
  });
});
