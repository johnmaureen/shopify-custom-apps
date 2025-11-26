#!/bin/bash
# Script to remove the dist directory from the extension
# Run with: bash remove-dist.sh

EXTENSION_DIR="/Users/mau/Documents/Github/shopify-custom-apps/shipping-protection/extensions/shipping-protection-widget/dist"

if [ -d "$EXTENSION_DIR" ]; then
  echo "Removing dist directory..."
  sudo rm -rf "$EXTENSION_DIR"
  echo "Dist directory removed successfully!"
  ls -la "$(dirname "$EXTENSION_DIR")"
else
  echo "Dist directory not found."
fi


