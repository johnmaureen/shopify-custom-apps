// Shipping Protection Widget for Cart Drawer
(function () {
  'use strict';

  const SHIPPING_PROTECTION_API = '/apps/shipping-protection/api/widget-data';
  
  class ShippingProtectionWidget {
    constructor(container, settings) {
      this.container = container;
      this.settings = settings;
      this.product = null;
      this.isLoading = false;
      this.isAdded = false;
      
      this.init();
    }

    async init() {
      await this.fetchProductData();
      this.render();
      this.attachEventListeners();
    }

    async fetchProductData() {
      try {
        // Get shop from current page
        const shop = this.getShopFromPage();
        const apiUrl = shop ? `${SHIPPING_PROTECTION_API}?shop=${shop}` : SHIPPING_PROTECTION_API;
        
        console.log('Fetching shipping protection product from:', apiUrl);
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          console.error('API response not ok:', response.status, response.statusText);
          return;
        }
        
        const text = await response.text();
        console.log('API response text:', text);
        
        if (!text || text.trim() === '') {
          console.log('Empty response from API');
          return;
        }
        
        const data = JSON.parse(text);
        console.log('Parsed API data:', data);
        
        if (data.product && data.product.productId) {
          this.product = data.product;
          // Fetch product details to get variant ID and price
          await this.fetchProductDetails();
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
      
      try {
        const productUrl = `/products/${this.product.productId}.js`;
        console.log('Fetching product details from:', productUrl);
        
        const response = await fetch(productUrl);
        
        if (!response.ok) {
          console.error('Product details response not ok:', response.status);
          return;
        }
        
        const productData = await response.json();
        console.log('Product details:', productData);
        
        if (productData.variants && productData.variants.length > 0) {
          this.product.variantId = productData.variants[0].id;
          this.product.price = productData.variants[0].price;
          console.log('Set variantId:', this.product.variantId, 'price:', this.product.price);
        }
      } catch (error) {
        console.error('Error fetching product details:', error);
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
          this.updateUI();
        }
      } catch (error) {
        console.error('Error checking cart:', error);
      }
    }

    render() {
      if (!this.product) {
        return;
      }

      const widgetHTML = `
        <div class="shipping-protection-widget" data-shipping-protection-widget>
          <div class="shipping-protection-widget__container">
            <div class="shipping-protection-widget__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L4 7V12C4 16.55 6.36 20.74 10 21.91C11.5 21.42 12.5 20.5 12.5 20.5C12.5 20.5 13.5 21.42 15 21.91C18.64 20.74 21 16.55 21 12V7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                <path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="shipping-protection-widget__content">
              <div class="shipping-protection-widget__header">
                <span class="shipping-protection-widget__title">${this.settings.title || 'Shipping protection'}</span>
                <span class="shipping-protection-widget__price">${this.formatPrice(this.product.price)}</span>
              </div>
              <div class="shipping-protection-widget__status">
                <span class="shipping-protection-widget__status-text">
                  ${this.isAdded ? 'Order is protected from loss or damage' : 'Order isn\'t protected from loss or damage'}
                </span>
              </div>
              <a href="#" class="shipping-protection-widget__terms">Terms and Conditions</a>
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
        </div>
      `;

      this.container.innerHTML = widgetHTML;
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
      
      if (statusText) {
        statusText.textContent = this.isAdded
          ? 'Order is protected from loss or damage'
          : 'Order isn\'t protected from loss or damage';
      }
      
      if (toggle) {
        toggle.checked = this.isAdded;
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

    formatPrice(price) {
      if (typeof price === 'string') {
        return price;
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
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
  const observer = new MutationObserver((mutations) => {
    if (!document.querySelector('[data-shipping-protection-container]')) {
      initWidget();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();

