// Shipping Protection Widget for Cart Drawer
(function () {
  'use strict';

  const SHIPPING_PROTECTION_API = '/apps/api/widget-data';

  
  class ShippingProtectionWidget {
    constructor(container, settings) {
      this.container = container;
      this.settings = settings;
      this.product = null;
      this.isLoading = false;
      this.isAdded = false;
      this.termsAndConditions = null;
      
      this.init();
    }

    async init() {
      await this.fetchProductData();
      this.render();
      this.attachEventListeners();
      
      // Enable shipping protection by default if not already in cart
      if (this.product && !this.isAdded) {
        await this.addToCart();
      }

      console.log('Shipping protection widget initialized');
    }

    async fetchProductData() {
      try {
        // Get shop from current page
        const shop = this.getShopFromPage();
        const apiUrl = shop ? `${SHIPPING_PROTECTION_API}?shop=${shop}` : SHIPPING_PROTECTION_API;
        
        console.log('Fetching shipping protection product from:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          console.error('API response not ok:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('Error response body:', errorText.substring(0, 200));
          return;
        }
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          console.error('Response is not JSON. Content-Type:', contentType);
          console.error('Response body (first 500 chars):', text.substring(0, 500));
          return;
        }
        
        // Parse JSON directly
        const data = await response.json();
        console.log('Parsed API data:', data);
        console.log('Product image from API:', data.product?.image);
        
        // Store terms and conditions
        this.termsAndConditions = data.termsAndConditions || null;
        
        if (data.product && data.product.productId) {
          this.product = data.product;
          
          // Log the image URL we received
          if (this.product.image) {
            console.log('Product image URL:', this.product.image);
          } else {
            console.warn('No product image URL in API response');
          }
          
          // If we already have variantId and price from API, skip fetching product details
          if (!this.product.variantId || !this.product.price) {
            await this.fetchProductDetails();
          } else {
            console.log('Using product data from API, skipping product details fetch');
          }
          
          this.checkIfInCart();
        } else {
          console.log('No product data in response');
        }
      } catch (error) {
        console.error('Error fetching shipping protection product:', error);
        console.error('Error details:', error.message, error.stack);
      }
    }

    getShopFromPage() {
      // Try multiple methods to get shop
      // Method 1: From window.Shopify
      if (window.Shopify && window.Shopify.shop) {
        let shop = window.Shopify.shop;
        // Remove .myshopify.com if present
        if (shop.includes('.myshopify.com')) {
          shop = shop.replace('.myshopify.com', '');
        }
        return shop;
      }
      
      // Method 2: From meta tag
      const shopMeta = document.querySelector('meta[name="shopify-checkout-shop"]');
      if (shopMeta) {
        let shop = shopMeta.content;
        if (shop.includes('.myshopify.com')) {
          shop = shop.replace('.myshopify.com', '');
        }
        return shop;
      }
      
      // Method 3: From hostname
      const hostname = window.location.hostname;
      const shopMatch = hostname.match(/([^.]+)\.myshopify\.com/);
      if (shopMatch) {
        return shopMatch[1];
      }
      
      // Method 4: From data attributes
      const shopData = document.querySelector('[data-shop]');
      if (shopData) {
        let shop = shopData.getAttribute('data-shop');
        if (shop && shop.includes('.myshopify.com')) {
          shop = shop.replace('.myshopify.com', '');
        }
        return shop;
      }
      
      return null;
    }

    async fetchProductDetails() {
      if (!this.product?.productId) {
        console.log('No productId to fetch details for');
        return;
      }
      
      // Only fetch if we're missing variantId or price (critical data)
      // Image is optional - we'll skip fetching if we have the critical data
      const needsVariantId = !this.product.variantId;
      const needsPrice = !this.product.price;
      const needsImage = !this.product.image;
      
      // If we have both variantId and price, skip the fetch entirely
      // The image is optional and we can work without it
      if (!needsVariantId && !needsPrice) {
        console.log('VariantId and price already available from API, skipping product details fetch');
        // Try to get image from productHandle if available
        if (needsImage && this.product.productHandle) {
          // Try to construct a potential image URL (this may not work for all stores)
          // The actual image should ideally come from the API in the future
          console.log('Image not available, but we have productHandle:', this.product.productHandle);
        }
        return;
      }
      
      try {
        const productUrl = `/products/${this.product.productId}.js`;
        console.log('Fetching product details from:', productUrl);
        
        const response = await fetch(productUrl);
        
        if (!response.ok) {
          console.error('Product details response not ok:', response.status);
          // If we have variantId and price from API, we can continue without the fetch
          if (!needsVariantId && !needsPrice) {
            console.warn('Product details fetch failed, but we have required data from API, continuing...');
            return;
          }
          return;
        }
        
        const productData = await response.json();
        console.log('Product details:', productData);
        
        // Only update variantId and price if we don't already have them
        if (needsVariantId || needsPrice) {
          if (productData.variants && productData.variants.length > 0) {
            if (needsVariantId) {
              this.product.variantId = productData.variants[0].id;
            }
            if (needsPrice) {
              this.product.price = productData.variants[0].price;
            }
            console.log('Set variantId:', this.product.variantId, 'price:', this.product.price);
          }
        }
        
        // Get product image if we need it
        if (needsImage) {
          if (productData.featured_image) {
            this.product.image = productData.featured_image;
          } else if (productData.images && productData.images.length > 0) {
            this.product.image = productData.images[0];
          }
          console.log('Set product image:', this.product.image);
        }
      } catch (error) {
        console.error('Error fetching product details:', error);
        // Don't throw - we can continue with the data we have from the API
      }
    }

    async checkIfInCart() {
      try {
        const response = await fetch('/cart.js');
        const cart = await response.json();
        
        if (cart.items && this.product) {
          this.isAdded = cart.items.some(
            item => item.product_id === this.product.productId
          );
          // Update UI but don't auto-add here - let init() handle that
          this.updateUI();
        }
      } catch (error) {
        console.error('Error checking cart:', error);
      }
    }

    injectStyles() {
      // Only inject styles once
      if (document.getElementById('shipping-protection-widget-styles')) {
        return;
      }

      const styles = `
        <style id="shipping-protection-widget-styles">
          .shipping-protection-widget {
            margin: 16px 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          }

          .shipping-protection-widget__container {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
            background: #ffffff;
            border-radius: 8px;
            border: 1px solid #e5e5e5;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          }

          .shipping-protection-widget__content-wrapper {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .shipping-protection-widget__row {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
          }

          .shipping-protection-widget__row--header {
            justify-content: space-between;
          }

          .shipping-protection-widget__icon {
            flex-shrink: 0;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border-radius: 4px;
          }

          .shipping-protection-widget__icon img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }

          .shipping-protection-widget__content {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .shipping-protection-widget__title {
            font-size: 14px;
            font-weight: 600;
            color: #1a1a1a;
            line-height: 1.4;
            flex: 0 1 auto;
            letter-spacing: 0;
          }

          .shipping-protection-widget__price {
            font-size: 14px;
            font-weight: 400;
            color: #1a1a1a;
            line-height: 1.4;
            flex: 0 0 auto;
          }

          .shipping-protection-widget__toggle {
            flex-shrink: 0;
          }

          .shipping-protection-widget__status {
            line-height: 18px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .shipping-protection-widget__status-text {
            font-size: 12px;
            color: #666666;
            letter-spacing: 0;
          }

          .shipping-protection-widget__terms-link {
            font-size: 12px;
            color: #1a1a1a;
            text-decoration: underline;
            display: inline-block;
            cursor: pointer;
            transition: color 0.2s;
            margin-top: 4px;
          }

          .shipping-protection-widget__terms-link:hover {
            color: #0066cc;
          }

          .shipping-protection-widget__modal {
            display: none;
            position: fixed;
            z-index: 10000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
          }

          .shipping-protection-widget__modal--open {
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .shipping-protection-widget__modal-content {
            background-color: #ffffff;
            margin: auto;
            padding: 24px;
            border-radius: 8px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            position: relative;
          }

          .shipping-protection-widget__modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e5e5e5;
          }

          .shipping-protection-widget__modal-title {
            font-size: 20px;
            font-weight: 600;
            color: #1a1a1a;
            margin: 0;
          }

          .shipping-protection-widget__modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666666;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background-color 0.2s;
          }

          .shipping-protection-widget__modal-close:hover {
            background-color: #f5f5f5;
            color: #1a1a1a;
          }

          .shipping-protection-widget__modal-body {
            font-size: 14px;
            line-height: 1.6;
            color: #1a1a1a;
            white-space: pre-line;
          }

          .shipping-protection-widget__modal-body ul,
          .shipping-protection-widget__modal-body ol {
            margin: 12px 0;
            padding-left: 24px;
          }

          .shipping-protection-widget__modal-body li {
            margin: 8px 0;
          }

          .shipping-protection-widget__modal-body p {
            margin: 12px 0;
          }

          .shipping-protection-widget__modal-body strong {
            font-weight: 600;
          }

          .shipping-protection-toggle {
            position: relative;
            display: inline-block;
            width: 38px;
            height: 22px;
            cursor: pointer;
          }

          .shipping-protection-toggle__input {
            opacity: 0;
            width: 0;
            height: 0;
          }

          .shipping-protection-toggle__slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #cccccc;
            transition: 0.3s;
            border-radius: 22px;
          }

          .shipping-protection-toggle__slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 4px;
            bottom: 3px;
            background-color: white;
            transition: 0.3s;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          }

          .shipping-protection-toggle__input:checked + .shipping-protection-toggle__slider {
            background-color: #0066cc;
          }

          .shipping-protection-toggle__input:checked + .shipping-protection-toggle__slider:before {
            transform: translateX(14px);
          }

          .shipping-protection-toggle__input:focus + .shipping-protection-toggle__slider {
            box-shadow: 0 0 1px #0066cc;
          }

          .shipping-protection-widget.loading {
            opacity: 0.6;
            pointer-events: none;
          }

          .shipping-protection-widget.loading .shipping-protection-toggle {
            cursor: not-allowed;
          }

          @media (max-width: 480px) {
            .shipping-protection-widget__container {
              gap: 12px;
            }

            .shipping-protection-widget__content-wrapper {
              gap: 8px;
            }

            .shipping-protection-widget__row {
              gap: 8px;
            }

            .shipping-protection-widget__icon {
              width: 40px;
              height: 40px;
            }

            .shipping-protection-widget__icon img,
            .shipping-protection-widget__icon svg {
              width: 100%;
              height: 100%;
            }

            .shipping-protection-widget__title {
              font-size: 14px;
            }

            .shipping-protection-widget__price {
              font-size: 14px;
            }
          }
        </style>
      `;

      document.head.insertAdjacentHTML('beforeend', styles);
    }

    render() {
      if (!this.product) {
        return;
      }

      // Inject styles
      this.injectStyles();

      // Get product image URL, with fallback
      const imageUrl = this.product.image || '';
      console.log('Rendering widget - imageUrl:', imageUrl);
      
      const fallbackSvg = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L4 7V12C4 16.55 6.36 20.74 10 21.91C11.5 21.42 12.5 20.5 12.5 20.5C12.5 20.5 13.5 21.42 15 21.91C18.64 20.74 21 16.55 21 12V7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/>
            <path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`;
      
      const imageHTML = imageUrl 
        ? `<img src="${imageUrl}" alt="${this.product.productTitle || this.settings.title || 'Shipping protection'}" loading="lazy" class="shipping-protection-widget__product-image">`
        : fallbackSvg;

      const widgetHTML = `
        <div class="shipping-protection-widget" data-shipping-protection-widget>
          <div class="shipping-protection-widget__container">
            <div class="shipping-protection-widget__icon">
              ${imageHTML}
            </div>
            <div class="shipping-protection-widget__content-wrapper">
              <div class="shipping-protection-widget__row shipping-protection-widget__row--header">
                <div class="shipping-protection-widget__content">
                  <span class="shipping-protection-widget__title">${this.product.productTitle || this.settings.title || 'Shipping protection'}</span>
                  <span class="shipping-protection-widget__price">${this.formatPrice(this.product.price)}</span>
                </div>
                <div class="shipping-protection-widget__toggle">
                  <label class="shipping-protection-toggle">
                    <input 
                      type="checkbox" 
                      class="shipping-protection-toggle__input"
                      ${this.isAdded ? 'checked' : ''}
                    >
                    <span class="shipping-protection-toggle__slider"></span>
                  </label>
                </div>
              </div>
              <div class="shipping-protection-widget__row">
                <div class="shipping-protection-widget__status">
                  <span class="shipping-protection-widget__status-text">
                    ${this.isAdded ? 'Order is protected from loss or damage' : 'Order isn\'t protected from loss or damage'}
                  </span>
                  ${this.termsAndConditions ? `<a href="#" class="shipping-protection-widget__terms-link">Terms and Conditions</a>` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      this.container.innerHTML = widgetHTML;
      
      // Attach error handler to image if it exists
      if (imageUrl) {
        const img = this.container.querySelector('.shipping-protection-widget__product-image');
        if (img) {
          img.addEventListener('error', () => {
            console.error('Image failed to load:', img.src);
            img.style.display = 'none';
            const iconContainer = img.parentElement;
            if (iconContainer) {
              iconContainer.innerHTML = fallbackSvg;
            }
          });
        }
      }

      // Terms and conditions link
      const termsLink = this.container.querySelector('.shipping-protection-widget__terms-link');
      if (termsLink) {
        termsLink.addEventListener('click', (e) => {
          e.preventDefault();
          this.showTermsModal();
        });
      }
    }

    attachEventListeners() {
      const toggle = this.container.querySelector('.shipping-protection-toggle__input');
      if (toggle) {
        toggle.addEventListener('change', (e) => {
          if (e.target.checked) {
            this.addToCart();
          } else {
            this.removeFromCart();
          }
        });
      }

      // Listen for cart updates
      document.addEventListener('cart:updated', () => {
        this.checkIfInCart();
      });
    }

    async addToCart() {
      if (this.isLoading || !this.product) return;
      
      this.isLoading = true;
      this.updateLoadingState(true);

      try {
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: this.product.variantId,
            quantity: 1,
          }),
        });

        if (response.ok) {
          this.isAdded = true;
          this.updateUI();
          
          // Trigger cart update event
          document.dispatchEvent(new CustomEvent('cart:updated'));
          
          // Update cart drawer if it exists
          if (typeof window.theme !== 'undefined' && window.theme.cart) {
            window.theme.cart.getCart();
          }
        } else {
          throw new Error('Failed to add to cart');
        }
      } catch (error) {
        console.error('Error adding shipping protection to cart:', error);
        const toggle = this.container.querySelector('.shipping-protection-toggle__input');
        if (toggle) {
          toggle.checked = false;
        }
      } finally {
        this.isLoading = false;
        this.updateLoadingState(false);
      }
    }

    async removeFromCart() {
      if (this.isLoading || !this.product) return;
      
      this.isLoading = true;
      this.updateLoadingState(true);

      try {
        const cartResponse = await fetch('/cart.js');
        const cart = await cartResponse.json();
        
        const item = cart.items.find(
          item => item.product_id === this.product.productId
        );

        if (item) {
          const response = await fetch('/cart/change.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: item.key,
              quantity: 0,
            }),
          });

          if (response.ok) {
            this.isAdded = false;
            this.updateUI();
            
            // Trigger cart update event
            document.dispatchEvent(new CustomEvent('cart:updated'));
            
            // Update cart drawer if it exists
            if (typeof window.theme !== 'undefined' && window.theme.cart) {
              window.theme.cart.getCart();
            }
          } else {
            throw new Error('Failed to remove from cart');
          }
        }
      } catch (error) {
        console.error('Error removing shipping protection from cart:', error);
        const toggle = this.container.querySelector('.shipping-protection-toggle__input');
        if (toggle) {
          toggle.checked = true;
        }
      } finally {
        this.isLoading = false;
        this.updateLoadingState(false);
      }
    }

    updateUI() {
      const statusText = this.container.querySelector('.shipping-protection-widget__status-text');
      const toggle = this.container.querySelector('.shipping-protection-toggle__input');
      const iconContainer = this.container.querySelector('.shipping-protection-widget__icon');
      
      if (statusText) {
        statusText.textContent = this.isAdded
          ? 'Order is protected from loss or damage'
          : 'Order isn\'t protected from loss or damage';
      }
      
      if (toggle) {
        toggle.checked = this.isAdded;
      }
      
      // Update image if it was loaded after initial render
      if (iconContainer && this.product?.image) {
        const existingImg = iconContainer.querySelector('img');
        if (existingImg) {
          existingImg.src = this.product.image;
        } else {
          // Replace SVG with image if image is now available
          const existingSvg = iconContainer.querySelector('svg');
          if (existingSvg) {
            const img = document.createElement('img');
            img.src = this.product.image;
            img.alt = this.settings.title || 'Shipping protection';
            img.loading = 'lazy';
            iconContainer.replaceChild(img, existingSvg);
          }
        }
      }
    }

    updateLoadingState(loading) {
      const widget = this.container.querySelector('[data-shipping-protection-widget]');
      if (widget) {
        if (loading) {
          widget.classList.add('loading');
        } else {
          widget.classList.remove('loading');
        }
      }
    }

    showTermsModal() {
      if (!this.termsAndConditions) {
        return;
      }

      // Create modal if it doesn't exist
      let modal = document.getElementById('shipping-protection-terms-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'shipping-protection-terms-modal';
        modal.className = 'shipping-protection-widget__modal';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'shipping-protection-widget__modal-content';
        
        const modalHeader = document.createElement('div');
        modalHeader.className = 'shipping-protection-widget__modal-header';
        
        const modalTitle = document.createElement('h2');
        modalTitle.className = 'shipping-protection-widget__modal-title';
        modalTitle.textContent = 'Terms and Conditions';
        
        const closeButton = document.createElement('button');
        closeButton.className = 'shipping-protection-widget__modal-close';
        closeButton.innerHTML = '&times;';
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.addEventListener('click', () => {
          this.hideTermsModal();
        });
        
        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);
        
        const modalBody = document.createElement('div');
        modalBody.className = 'shipping-protection-widget__modal-body';
        
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalBody);
        modal.appendChild(modalContent);
        
        // Close on backdrop click
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.hideTermsModal();
          }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && modal.classList.contains('shipping-protection-widget__modal--open')) {
            this.hideTermsModal();
          }
        });
        
        document.body.appendChild(modal);
      }
      
      // Update modal content
      const modalBody = modal.querySelector('.shipping-protection-widget__modal-body');
      if (modalBody) {
        modalBody.textContent = this.termsAndConditions;
      }
      
      // Show modal
      modal.classList.add('shipping-protection-widget__modal--open');
      document.body.style.overflow = 'hidden';
    }

    hideTermsModal() {
      const modal = document.getElementById('shipping-protection-terms-modal');
      if (modal) {
        modal.classList.remove('shipping-protection-widget__modal--open');
        document.body.style.overflow = '';
      }
    }

    formatPrice(price) {
      // Get shop currency from Shopify object or meta tag
      let currency = 'USD';
      if (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) {
        currency = window.Shopify.currency.active;
      } else if (window.Shopify && window.Shopify.shop && window.Shopify.shop.currency) {
        currency = window.Shopify.shop.currency;
      } else {
        const currencyMeta = document.querySelector('meta[name="shopify-checkout-currency"]');
        if (currencyMeta) {
          currency = currencyMeta.content;
        }
      }

      if (typeof price === 'string') {
        // If price is already a string, check if it has a currency symbol
        const hasCurrencySymbol = /[\$€£¥₹]/.test(price);
        if (hasCurrencySymbol) {
          return price;
        }
        // If no currency symbol, parse and format
        const numericPrice = parseFloat(price);
        if (!isNaN(numericPrice)) {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
          }).format(numericPrice);
        }
        return price;
      }
      
      // Price is numeric (in cents), format with currency
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).format(price / 100);
    }
  }

  // Initialize widget when DOM is ready
  function initWidget() {
    const cartDrawer = document.querySelector('[data-cart-drawer]') || 
                      document.querySelector('.cart-drawer') ||
                      document.querySelector('#cart-drawer');
    
    if (!cartDrawer) {
      // Try again after a short delay
      setTimeout(initWidget, 500);
      return;
    }

    // Find or create container for the widget
    let widgetContainer = document.querySelector('[data-shipping-protection-container]');
    
    if (!widgetContainer) {
      // Try to find cart items container and insert after it
      const cartItems = cartDrawer.querySelector('.cart-items') ||
                       cartDrawer.querySelector('[data-cart-items]') ||
                       cartDrawer.querySelector('.cart__items');
      
      if (cartItems) {
        widgetContainer = document.createElement('div');
        widgetContainer.setAttribute('data-shipping-protection-container', '');
        cartItems.parentNode.insertBefore(widgetContainer, cartItems.nextSibling);
      } else {
        // Fallback: append to cart drawer
        widgetContainer = document.createElement('div');
        widgetContainer.setAttribute('data-shipping-protection-container', '');
        cartDrawer.appendChild(widgetContainer);
      }
    }

    // Get settings from theme extension
    const settings = {
      title: 'Shipping protection',
      description: 'Protect your order from loss or damage',
    };

    new ShippingProtectionWidget(widgetContainer, settings);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }

  // Re-initialize when cart drawer opens (for themes that dynamically load cart)
  const observer = new MutationObserver(() => {
    if (!document.querySelector('[data-shipping-protection-container]')) {
      initWidget();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();

