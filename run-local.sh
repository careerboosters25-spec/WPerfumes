#!/usr/bin/env bash
# run-local.sh — safe local runner for Git Bash (Windows)
# Prompts for PayPal sandbox credentials (secret entry is hidden),
# exports env vars in this shell, tests the OAuth token, then starts python run.py.
# Keep this script local and DO NOT commit it with secrets.

set -euo pipefail

echo
echo "Local runner for WPerfumes (Git Bash)."
echo "You will be prompted for the PayPal Client ID and Secret. The secret input will be hidden."
read -p "PayPal Client ID: " PAYPAL_CLIENT_ID
read -s -p "PayPal Secret (input hidden): " PAYPAL_SECRET
echo
# set environment for this shell only
export PAYPAL_CLIENT_ID
export PAYPAL_SECRET
export FLASK_ENV=development

# Validate presence
if [ -z "$PAYPAL_CLIENT_ID" ] || [ -z "$PAYPAL_SECRET" ]; then
  echo "Error: one or more credentials were left empty. Aborting."
  exit 1
fi

echo
echo "Testing PayPal OAuth token endpoint (sandbox)."
echo "(If this prints JSON with an access_token, credentials are valid.)"
echo

# Curl token request; pretty-print with jq if available
if command -v jq >/dev/null 2>&1; then
  curl -s -u "$PAYPAL_CLIENT_ID:$PAYPAL_SECRET" -d "grant_type=client_credentials" "https://api-m.sandbox.paypal.com/v1/oauth2/token" | jq .
else
  echo "(Install jq to pretty-print JSON; printing raw output below)"
  curl -s -u "$PAYPAL_CLIENT_ID:$PAYPAL_SECRET" -d "grant_type=client_credentials" "https://api-m.sandbox.paypal.com/v1/oauth2/token"
fi

echo
echo "If the previous response contained an access_token => credentials are valid."
echo "If you received 401 Unauthorized, re-check the values and ensure FLASK_ENV=development."
echo
echo "Starting Flask app (python run.py) in THIS shell so it inherits the env vars..."
echo "Press Ctrl+C to stop the server."
python run.py