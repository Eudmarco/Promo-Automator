export interface PromoData {
  headline: string;
  socialLayout: string;
  videoScript: string;
  extractedInfo: {
    name: string;
    originalPrice: string | null;
    promoPrice: string | null;
    discount: string | null;
    link: string;
    shipping: string | null;
    imageUrl: string | null;
    rating: string | null;
    coupon: string | null;
    savings: string | null;
  };
}
