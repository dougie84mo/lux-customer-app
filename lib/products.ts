import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { BusinessProduct, SaleLine, ShopProduct } from './productsLogic';

// Retail (migration 0247): a shop's product catalogue. Browse-only here —
// products are bought in the shop, added to the visit's checkout by the barber.
// Pure helpers (grouping, receipt math) live in ./productsLogic.
export type { BusinessProduct, SaleLine, ShopGroup, ShopProduct } from './productsLogic';

// Public bucket, so no signed URLs.
export const PRODUCT_IMAGE_BUCKET = 'business-product-images';

export const MY_SHOP_PRODUCTS_KEY = ['my-shop-products'];

// Public CDN url for a stored product image path, or null when unset. Absolute
// URLs pass through (same rule as lib/portfolio.ts — seeded data uses them).
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// The Shop tab: products from shops I have favourited or am a client of,
// recommended ones first.
export function useMyShopProducts() {
  return useQuery({
    queryKey: MY_SHOP_PRODUCTS_KEY,
    queryFn: async (): Promise<ShopProduct[]> => {
      const { data, error } = await supabase.rpc('my_shop_products');
      if (error) throw error;
      return (data ?? []) as ShopProduct[];
    },
  });
}

// One shop's shelf, for its business page. Empty unless the shop is public.
export function useBusinessProducts(businessId?: string) {
  return useQuery({
    queryKey: ['business-products', businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessProduct[]> => {
      const { data, error } = await supabase.rpc('business_products_public', {
        p_business_id: businessId!,
      });
      if (error) throw error;
      return (data ?? []) as BusinessProduct[];
    },
  });
}

// Line items of a sale I paid for (sale_line_items itself is staff-only).
export function useSaleLines(saleId?: string, enabled = true) {
  return useQuery({
    queryKey: ['sale-lines', saleId],
    enabled: !!saleId && enabled,
    queryFn: async (): Promise<SaleLine[]> => {
      const { data, error } = await supabase.rpc('my_sale_lines', { p_sale_id: saleId! });
      if (error) throw error;
      return (data ?? []) as SaleLine[];
    },
  });
}
