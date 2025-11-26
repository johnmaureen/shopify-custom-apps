import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

// Catch-all route for /apps/api/* paths
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  console.error("=== App Proxy Route Hit ===");
  console.error("Full URL:", request.url);
  console.error("Pathname:", pathname);
  console.error("Params:", params);
  
  // Only handle widget-data endpoint
  if (!pathname.includes('widget-data')) {
    return new Response("Not Found", { status: 404 });
  }
  
  try {
    let shop: string | null = null;
    
    try {
      const { session } = await authenticate.public.appProxy(request);
      shop = session?.shop || null;
      console.error("Shop from appProxy:", shop);
    } catch (authError) {
      console.error("AppProxy auth failed, trying query params:", authError);
      shop = url.searchParams.get("shop");
      
      if (shop && shop.includes('.myshopify.com')) {
        shop = shop.replace('.myshopify.com', '');
      }
      
      if (!shop) {
        const hostname = request.headers.get("host") || "";
        const shopMatch = hostname.match(/([^.]+)\.myshopify\.com/);
        if (shopMatch) {
          shop = shopMatch[1];
        }
      }
    }

    console.error("Final shop:", shop);

    if (!shop) {
      return Response.json({ product: null }, { status: 200 });
    }

    // @ts-expect-error - Prisma client types may not be up to date
    const settings = await prisma.appSettings.findUnique({
      where: { shop },
    });

    if (!settings?.shippingProtectionProductId) {
      return Response.json({ product: null }, { status: 200 });
    }

    const productIdMatch = settings.shippingProtectionProductId.match(/\d+$/);
    const productId = productIdMatch ? productIdMatch[0] : null;

    if (!productId) {
      return Response.json({ product: null }, { status: 200 });
    }

    return Response.json({
      product: {
        productId: parseInt(productId),
        variantId: null,
        price: null,
      },
    });
  } catch (error) {
    console.error("Widget API - Error:", error);
    return Response.json({ product: null, error: "Internal server error" }, { status: 500 });
  }
};

export default function AppProxy() {
  return null;
}


