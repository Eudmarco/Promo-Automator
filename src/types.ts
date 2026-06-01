export interface PromoData {
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
  };
}
