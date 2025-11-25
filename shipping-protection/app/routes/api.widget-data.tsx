import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This is a public API endpoint - no authentication required
  try {
    // Get shop from query parameter or from request headers
    const url = new URL(request.url);
    let shop = url.searchParams.get("shop");
    
    // If no shop in query, try to get from hostname
    if (!shop) {
      const hostname = request.headers.get("host") || "";
      // Extract shop from hostname (e.g., quickstart-xxx.myshopify.com)
      const shopMatch = hostname.match(/([^.]+)\.myshopify\.com/);
      if (shopMatch) {
        shop = shopMatch[1];
      }
    }
    
    // If still no shop, try to get from referer
    if (!shop) {
      const referer = request.headers.get("referer");
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          const hostname = refererUrl.hostname;
          const shopMatch = hostname.match(/([^.]+)\.myshopify\.com/);
          if (shopMatch) {
            shop = shopMatch[1];
          }
        } catch (e) {
          // Ignore URL parse errors
        }
      }
    }

    // If shop includes .myshopify.com, extract just the shop name
    if (shop && shop.includes('.myshopify.com')) {
      shop = shop.replace('.myshopify.com', '');
    }

    console.log("Widget API - shop:", shop);

    if (!shop) {
      console.log("Widget API - No shop found, returning null");
      return Response.json({ product: null }, { status: 200 });
    }

    // Fetch settings for this shop
    const settings = await prisma.appSettings.findUnique({
      where: { shop },
    });

    console.log("Widget API - settings:", settings);

    if (!settings?.shippingProtectionProductId) {
      console.log("Widget API - No product ID in settings");
      return Response.json({ product: null }, { status: 200 });
    }

    // Extract product ID from GraphQL ID format (gid://shopify/Product/123456)
    const productIdMatch = settings.shippingProtectionProductId.match(/\d+$/);
    const productId = productIdMatch ? productIdMatch[0] : null;

    console.log("Widget API - extracted productId:", productId);

    if (!productId) {
      return Response.json({ product: null }, { status: 200 });
    }

    // Return product data in format expected by widget
    return Response.json({
      product: {
        productId: parseInt(productId),
        variantId: null, // Will be fetched by widget from product
        price: null, // Will be fetched by widget from product
      },
    });
  } catch (error) {
    console.error("Widget API - Error:", error);
    return Response.json({ product: null, error: "Internal server error" }, { status: 500 });
  }
};

