import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This is a public API endpoint accessible via app proxy
  try {
    // Use authenticate.public.appProxy to handle app proxy requests
    // This validates the request and provides shop information
    let shop: string | null = null;
    
    try {
      const { session } = await authenticate.public.appProxy(request);
      shop = session?.shop || null;
    } catch (authError) {
      // If appProxy auth fails, try to get shop from query params
      const url = new URL(request.url);
      shop = url.searchParams.get("shop");
      
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
    }

    if (!shop) {
      return Response.json({ product: null }, { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch settings for this shop
    // @ts-expect-error - Prisma client types may not be up to date, but this works at runtime
    const settings = await prisma.appSettings.findUnique({
      where: { shop },
    });

    if (!settings?.shippingProtectionProductId) {
      return Response.json({ product: null }, { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract product ID from GraphQL ID format (gid://shopify/Product/123456)
    const productIdMatch = settings.shippingProtectionProductId.match(/\d+$/);
    const productId = productIdMatch ? productIdMatch[0] : null;


    if (!productId) {
      return Response.json({ product: null }, { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract variant ID from GraphQL ID format if present
    let numericVariantId = null;
    const variantId = (settings as any)?.shippingProtectionVariantId;
    if (variantId) {
      const variantIdMatch = variantId.match(/\d+$/);
      numericVariantId = variantIdMatch ? parseInt(variantIdMatch[0]) : null;
    }

    // Return product data in format expected by widget
    // Use optional chaining in case columns don't exist yet
    return Response.json({
      product: {
        productId: parseInt(productId),
        productHandle: (settings as any)?.shippingProtectionProductHandle || null,
        productTitle: (settings as any)?.shippingProtectionProductTitle || null,
        image: (settings as any)?.shippingProtectionProductImage || null,
        variantId: numericVariantId,
        price: (settings as any)?.shippingProtectionPrice || null,
      },
      termsAndConditions: (settings as any)?.termsAndConditions || null,
      termsModalTitle: (settings as any)?.termsModalTitle || null,
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("Widget API Error:", error);
    return Response.json({ product: null, error: "Internal server error" }, { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// No default export - this is a resource route that only returns JSON
// React Router will return the Response from the loader directly without rendering

