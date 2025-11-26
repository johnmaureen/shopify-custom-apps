import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Fetch products
  const productsResponse = await admin.graphql(
    `#graphql
      query getProducts($first: Int!) {
        products(first: $first) {
          nodes {
            id
            title
            handle
            status
            variants(first: 1) {
              nodes {
                id
                price
              }
            }
          }
        }
      }`,
    {
      variables: {
        first: 50,
      },
    },
  );

  const productsJson = await productsResponse.json();
  
  // Console log for debugging
  console.log("productsResponse:", productsResponse);
  console.log("productsJson:", JSON.stringify(productsJson, null, 2));
  console.log("productsJson.data:", productsJson.data);
  console.log("productsJson.data?.products:", productsJson.data?.products);
  console.log("productsJson.data?.products?.nodes:", productsJson.data?.products?.nodes);
  
  // Extract products from response
  const products = productsJson.data?.products?.nodes || [];
  
  console.log("Extracted products:", products);
  console.log("Products count:", products.length);

  // Fetch current settings
  let settings = await prisma.appSettings.findUnique({
    where: { shop: session.shop },
  });

  // Default product ID
  const DEFAULT_PRODUCT_ID = "gid://shopify/Product/8968086094081";
  
  // Console log for debugging
  console.log("Settings loader - DEFAULT_PRODUCT_ID:", DEFAULT_PRODUCT_ID);
  console.log("Settings loader - settings from DB (before):", settings);
  
  // If no settings exist, create with default product ID
  if (!settings) {
    console.log("Settings loader - No settings found, creating with default product ID");
    settings = await prisma.appSettings.create({
      data: {
        shop: session.shop,
        shippingProtectionProductId: DEFAULT_PRODUCT_ID,
      },
    });
    console.log("Settings loader - Created new settings:", settings);
  }
  
  // Use default if no product ID is set
  const selectedProductId = settings.shippingProtectionProductId || DEFAULT_PRODUCT_ID;
  
  console.log("Settings loader - selectedProductId (final):", selectedProductId);
  console.log("Settings loader - selectedProductId type:", typeof selectedProductId);

  return {
    products,
    selectedProductId,
    termsAndConditions: settings?.termsAndConditions || null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = formData.get("productId") as string | null;
  const termsAndConditions = formData.get("termsAndConditions") as string | null;

  let productHandle: string | null = null;
  let productTitle: string | null = null;
  let productImage: string | null = null;
  let variantId: string | null = null;
  let price: string | null = null;

  // If a product is selected, fetch its details
  if (productId) {
    try {
      // Extract numeric product ID from GraphQL ID
      const productIdMatch = productId.match(/\d+$/);
      const numericProductId = productIdMatch ? productIdMatch[0] : null;

      if (numericProductId) {
        // Fetch product details using GraphQL
        const productResponse = await admin.graphql(
          `#graphql
            query getProduct($id: ID!) {
              product(id: $id) {
                id
                title
                handle
                featuredMedia {
                  ... on MediaImage {
                    image {
                      url
                    }
                  }
                  ... on Video {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                  ... on Model3d {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                  ... on ExternalVideo {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                }
                variants(first: 1) {
                  nodes {
                    id
                    price
                  }
                }
              }
            }`,
          {
            variables: {
              id: productId,
            },
          }
        );

        const productJson = await productResponse.json();
        const product = productJson.data?.product;

        if (product) {
          productHandle = product.handle || null;
          productTitle = product.title || null;
          
          // Extract image URL from featuredMedia (handles different media types)
          if (product.featuredMedia) {
            if (product.featuredMedia.image?.url) {
              // MediaImage type
              productImage = product.featuredMedia.image.url;
            } else if (product.featuredMedia.preview?.image?.url) {
              // Video, Model3d, or ExternalVideo type - use preview image
              productImage = product.featuredMedia.preview.image.url;
            }
          }
          
          if (product.variants?.nodes?.[0]) {
            variantId = product.variants.nodes[0].id || null;
            price = product.variants.nodes[0].price || null;
          }
        }

        console.log("Fetched product details:", {
          productId,
          productHandle,
          productTitle,
          productImage,
          variantId,
          price,
        });
      }
    } catch (error) {
      console.error("Error fetching product details:", error);
      // Continue with saving even if fetching details fails
    }
  }

  // Upsert settings
  await prisma.appSettings.upsert({
    where: { shop: session.shop },
    update: {
      shippingProtectionProductId: productId || null,
      shippingProtectionProductHandle: productHandle || null,
      shippingProtectionProductTitle: productTitle || null,
      shippingProtectionProductImage: productImage || null,
      shippingProtectionVariantId: variantId || null,
      shippingProtectionPrice: price || null,
      termsAndConditions: termsAndConditions || null,
      updatedAt: new Date(),
    },
    create: {
      shop: session.shop,
      shippingProtectionProductId: productId || null,
      shippingProtectionProductHandle: productHandle || null,
      shippingProtectionProductTitle: productTitle || null,
      shippingProtectionProductImage: productImage || null,
      shippingProtectionVariantId: variantId || null,
      shippingProtectionPrice: price || null,
      termsAndConditions: termsAndConditions || null,
    },
  });

  return { success: true };
};

export default function Settings() {
  const { products, selectedProductId, termsAndConditions } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [selectedId, setSelectedId] = useState<string | null>(selectedProductId);
  const [termsText, setTermsText] = useState<string>(termsAndConditions || "");

  // Console log on component mount
  useEffect(() => {
    console.log("Settings component mounted - selectedProductId from loader:", selectedProductId);
    console.log("Settings component mounted - selectedId state:", selectedId);
  }, [selectedProductId, selectedId]);

  useEffect(() => {
    // Client-side console logging
    console.log("Settings component - products:", products);
    console.log("Settings component - products type:", typeof products);
    console.log("Settings component - products length:", products?.length);
    console.log("Settings component - selectedProductId:", selectedProductId);
    console.log("Settings component - selectedProductId value:", selectedProductId);
    console.log("Settings component - DEFAULT_PRODUCT_ID should be: gid://shopify/Product/8968086094081");
    
    // Check if default product ID is in the products list
    const defaultProductId = "gid://shopify/Product/8968086094081";
    const hasDefaultProduct = products?.some((p: { id: string }) => p.id === defaultProductId);
    console.log("Settings component - Default product ID found in products list:", hasDefaultProduct);
  }, [products, selectedProductId]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Settings saved successfully");
    }
  }, [fetcher.data?.success, shopify]);

  const handleSave = () => {
    const formData = new FormData();
    if (selectedId) {
      formData.append("productId", selectedId);
    }
    formData.append("termsAndConditions", termsText);
    fetcher.submit(formData, { method: "POST" });
  };

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  // Ensure products is always an array
  const productsArray = Array.isArray(products) ? products : [];
  
  const selectedProduct = productsArray.find(
    (p: { id: string }) => p.id === selectedId,
  );
  
  // Debug logging before render
  console.log("About to render - products:", products);
  console.log("About to render - products is array:", Array.isArray(products));
  console.log("About to render - products length:", products?.length);
  console.log("About to render - productsArray length:", productsArray.length);

  return (
    <s-page heading="Shipping Protection Settings">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        {...(isLoading ? { loading: true } : {})}
      >
        Save settings
      </s-button>

      <s-section heading="Product Selection">
        <s-paragraph>
          Select a product from your store to use as the Shipping Protection
          product. This product will be displayed in the cart drawer as a
          shipping protection option.
        </s-paragraph>

        <s-stack direction="block" gap="base">
          <div>
            <label htmlFor="product-select" style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
              Shipping Protection Product
            </label>
            <select
              id="product-select"
              value={selectedId || ""}
              onChange={(e) => {
                const value = e.target.value;
                console.log("Select changed to:", value);
                setSelectedId(value || null);
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
              }}
            >
              <option value="">-- Select a product --</option>
              {productsArray.length > 0 ? (
                productsArray.map((product: { id: string; title: string; status: string }) => {
                  console.log("Rendering product option:", product.id, product.title);
                  return (
                    <option key={product.id} value={product.id}>
                      {product.title} {product.status === "ACTIVE" ? "" : "(Draft)"}
                    </option>
                  );
                })
              ) : (
                <option value="" disabled>
                  {products ? `No products found (array length: ${products.length})` : "Loading products..."}
                </option>
              )}
            </select>
          </div>
          
          {/* Debug info */}
          <s-text>
            Products loaded: {Array.isArray(products) ? products.length : "Not an array"}
            {productsArray.length > 0 && ` | First product: ${productsArray[0]?.title || "N/A"}`}
          </s-text>

          {selectedProduct && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="block" gap="base">
                <s-heading>Selected Product</s-heading>
                <s-text>
                  <strong>Title:</strong> {selectedProduct.title}
                </s-text>
                <s-text>
                  <strong>Handle:</strong> {selectedProduct.handle}
                </s-text>
                {selectedProduct.variants?.nodes?.[0] && (
                  <s-text>
                    <strong>Price:</strong>{" "}
                    {selectedProduct.variants.nodes[0].price}
                  </s-text>
                )}
              </s-stack>
            </s-box>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Terms and Conditions">
        <s-paragraph>
          Enter the terms and conditions text that will be displayed in a popup when customers click the "Terms and Conditions" link in the shipping protection widget.
        </s-paragraph>

        <s-stack direction="block" gap="base">
          <div>
            <label htmlFor="terms-textarea" style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
              Terms and Conditions
            </label>
            <textarea
              id="terms-textarea"
              value={termsText}
              onChange={(e) => setTermsText(e.target.value)}
              rows={10}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical",
              }}
              placeholder="Enter terms and conditions text here. You can use bullet points, line breaks, etc."
            />
            <s-text tone="subdued" size="small">
              You can format text with line breaks and bullet points. The text will be displayed in a popup modal.
            </s-text>
          </div>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

