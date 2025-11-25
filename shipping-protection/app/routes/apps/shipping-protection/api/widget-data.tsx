import type { LoaderFunctionArgs } from "react-router";
import prisma from "../../../../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This is a public API endpoint accessible via app proxy - no authentication required
  try {
    const url = new URL(request.url);
    
    // App proxy requests include shop in query params automatically
    // Format: ?shop=shop-name.myshopify.com
    let shop = url.searchParams.get("shop");
    
    // If shop includes .myshopify.com, extract just the shop name
    if (shop && shop.includes('.myshopify.com')) {
      shop = shop.replace('.myshopify.com', '');
    }
    
    // Fallback: try to get from hostname
    if (!shop) {
      const hostname = request.headers.get("host") || "";
      const shopMatch = hostname.match(/([^.]+)\.myshopify\.com/);
      if (shopMatch) {
        shop = shopMatch[1];
      }
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

