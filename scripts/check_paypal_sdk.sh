#!/usr/bin/env bash
# Enhanced check script to find PayPal SDK script tag occurrences in templates (recursive)
# Run from project root: bash scripts/check_paypal_sdk.sh

echo "Searching for PayPal SDK script tags in app/templates and app..."
grep -nR "paypal.com/sdk/js" app/templates || true
grep -nR "paypal.com/sdk/js" app || true

echo ""
echo "Also checking static HTML files (if any):"
grep -nR "paypal.com/sdk/js" . || true