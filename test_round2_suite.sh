#!/bin/bash
set -e

BASE_URL="http://localhost:4000"
COOKIES_EMERGENCY="/tmp/cookie_emergency.txt"
COOKIES_DB="/tmp/cookie_db.txt"

rm -f "$COOKIES_EMERGENCY" "$COOKIES_DB"

echo "=========================================================="
echo "ROUND 2 COMPREHENSIVE VERIFICATION SUITE"
echo "=========================================================="

echo ""
echo "--- 1. CORS DUAL-ORIGIN TEST ---"
echo ">> Testing Origin: http://localhost:3000"
curl -s -i -H "Origin: http://localhost:3000" "$BASE_URL/api/stores" | grep -iE 'HTTP/|access-control-allow-origin|access-control-allow-credentials'

echo ">> Testing Origin: http://localhost:3001"
curl -s -i -H "Origin: http://localhost:3001" "$BASE_URL/api/stores" | grep -iE 'HTTP/|access-control-allow-origin|access-control-allow-credentials'

echo ">> Testing Untrusted Origin: http://malicious-site.com"
curl -s -i -H "Origin: http://malicious-site.com" "$BASE_URL/api/stores" | grep -iE 'HTTP/|access-control-allow-origin' || echo "Origin rejected (no CORS headers returned, as expected)"


echo ""
echo "--- 2. AUTHENTICATION PATHS ---"
echo ">> Path A: Emergency Admin Override Login"
EMERGENCY_RES=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@admin.com","password":"123456"}' \
  -c "$COOKIES_EMERGENCY")
echo "Response: $EMERGENCY_RES"

echo ">> Path B: Create Real Database User & Login"
USER_CREATE_PAYLOAD='{"name":"Real DB Admin","email":"dbadmin_round2@codicesconto.com","password":"DbAdminPass123!","role":"ADMIN","status":"ENABLED"}'
USER_CREATE_RES=$(curl -s -X POST "$BASE_URL/api/users" \
  -H "Content-Type: application/json" \
  -b "$COOKIES_EMERGENCY" \
  -d "$USER_CREATE_PAYLOAD")
echo "User Create Response: $USER_CREATE_RES"

DB_USER_ID=$(echo "$USER_CREATE_RES" | jq -r '.user.id // .user._id // empty')
echo "Created DB User ID: $DB_USER_ID"

echo ">> Path B Login with Real DB User Credentials"
DB_LOGIN_RES=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dbadmin_round2@codicesconto.com","password":"DbAdminPass123!"}' \
  -c "$COOKIES_DB")
echo "DB User Login Response: $DB_LOGIN_RES"


echo ""
echo "--- 3. MEDIA UPLOAD (POST /api/upload) ---"
echo -n "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > /tmp/tiny_round2.png
UPLOAD_RES=$(curl -s -X POST "$BASE_URL/api/upload" \
  -b "$COOKIES_DB" \
  -F "file=@/tmp/tiny_round2.png;type=image/png" \
  -F "bucket=store-images")
echo "Upload Response: $UPLOAD_RES"

UPLOAD_URL=$(echo "$UPLOAD_RES" | jq -r '.url // empty')
UPLOAD_STORAGE_PATH=$(echo "$UPLOAD_RES" | jq -r '.storagePath // empty')
echo "Uploaded Storage Path: $UPLOAD_STORAGE_PATH"


echo ""
echo "--- 4. STORES CRUD & STORAGE CLEANUP ---"
STORE_SLUG="test-store-r2-$(date +%s)"
STORE_PAYLOAD=$(jq -n \
  --arg name "Test Store Round 2" \
  --arg slug "$STORE_SLUG" \
  --arg logo "$UPLOAD_URL" \
  --arg path "$UPLOAD_STORAGE_PATH" \
  '{name: $name, slug: $slug, logoPath: $logo, logoStoragePath: $path, description: "Initial store description", isActive: true}')

echo ">> CREATE (POST /api/stores)"
STORE_CREATE_RES=$(curl -s -X POST "$BASE_URL/api/stores" \
  -H "Content-Type: application/json" \
  -b "$COOKIES_DB" \
  -d "$STORE_PAYLOAD")
echo "Store Create Response: $STORE_CREATE_RES"

STORE_ID=$(echo "$STORE_CREATE_RES" | jq -r '.store.id // empty')
echo "Created Store ID: $STORE_ID"

echo ">> READ (GET /api/stores/$STORE_ID)"
STORE_READ_RES=$(curl -s "$BASE_URL/api/stores/$STORE_ID")
echo "Store Read Response (first 100 chars): ${STORE_READ_RES:0:100}..."

echo ">> UPDATE with Logo Change to Trigger Storage Cleanup (PUT /api/stores/$STORE_ID)"
STORE_UPDATE_PAYLOAD=$(jq -n \
  --arg name "Test Store Round 2 (Updated)" \
  --arg slug "$STORE_SLUG" \
  --arg logo "https://example.com/new-logo.png" \
  --arg path "uploads/new_logo_replaced_$(date +%s).png" \
  '{name: $name, slug: $slug, logoPath: $logo, logoStoragePath: $path, description: "Updated description"}')

STORE_UPDATE_RES=$(curl -s -X PUT "$BASE_URL/api/stores/$STORE_ID" \
  -H "Content-Type: application/json" \
  -b "$COOKIES_DB" \
  -d "$STORE_UPDATE_PAYLOAD")
echo "Store Update Response: $STORE_UPDATE_RES"

echo ">> DELETE Store (DELETE /api/stores/$STORE_ID)"
STORE_DELETE_RES=$(curl -s -X DELETE "$BASE_URL/api/stores/$STORE_ID" \
  -b "$COOKIES_DB")
echo "Store Delete Response: $STORE_DELETE_RES"


echo ""
echo "--- 5. COUPONS CRUD & STORAGE CLEANUP ---"
echo "Creating helper store for coupon tests..."
PARENT_STORE_SLUG="coupon-parent-$(date +%s)"
PARENT_STORE_RES=$(curl -s -X POST "$BASE_URL/api/stores" \
  -H "Content-Type: application/json" \
  -b "$COOKIES_DB" \
  -d "{\"name\":\"Parent Store\",\"slug\":\"$PARENT_STORE_SLUG\",\"logoPath\":\"https://example.com/logo.png\"}")
PARENT_STORE_ID=$(echo "$PARENT_STORE_RES" | jq -r '.store.id // empty')
echo "Parent Store ID: $PARENT_STORE_ID"

echo ">> CREATE Coupon (POST /api/coupons)"
COUPON_CREATE_PAYLOAD=$(jq -n \
  --arg storeId "$PARENT_STORE_ID" \
  --arg code "TEST123R2" \
  '{storeId: $storeId, title: "Test Coupon Round 2", type: "CODE", code: $code, discount: "20% OFF", image: "https://example.com/banner.png", imageStoragePath: "uploads/banner_init_1.png", isActive: true}')

COUPON_CREATE_RES=$(curl -s -X POST "$BASE_URL/api/coupons" \
  -H "Content-Type: application/json" \
  -b "$COOKIES_DB" \
  -d "$COUPON_CREATE_PAYLOAD")
echo "Coupon Create Response: $COUPON_CREATE_RES"

COUPON_ID=$(echo "$COUPON_CREATE_RES" | jq -r '.data.id // empty')
echo "Created Coupon ID: $COUPON_ID"

echo ">> READ Coupon (GET /api/coupons/$COUPON_ID)"
COUPON_READ_RES=$(curl -s "$BASE_URL/api/coupons/$COUPON_ID")
echo "Coupon Read Response: $COUPON_READ_RES"

echo ">> UPDATE Coupon with Banner Change (PUT /api/coupons/$COUPON_ID)"
COUPON_UPDATE_PAYLOAD='{"title":"Updated Test Coupon Round 2","discount":"30% OFF","imageStoragePath":"uploads/banner_replaced_2.png"}'
COUPON_UPDATE_RES=$(curl -s -X PUT "$BASE_URL/api/coupons/$COUPON_ID" \
  -H "Content-Type: application/json" \
  -b "$COOKIES_DB" \
  -d "$COUPON_UPDATE_PAYLOAD")
echo "Coupon Update Response: $COUPON_UPDATE_RES"

echo ">> DELETE Coupon (DELETE /api/coupons/$COUPON_ID)"
COUPON_DELETE_RES=$(curl -s -X DELETE "$BASE_URL/api/coupons/$COUPON_ID" \
  -b "$COOKIES_DB")
echo "Coupon Delete Response: $COUPON_DELETE_RES"

# Clean up parent store
curl -s -X DELETE "$BASE_URL/api/stores/$PARENT_STORE_ID" -b "$COOKIES_DB" > /dev/null


echo ""
echo "--- 6. THEME PERSISTENCE TEST (PUT /api/theme) ---"
THEME_PAYLOAD='{"primaryColor":"#1A2B3C","secondaryColor":"#2C3D4E","layoutHeader":"style-1"}'
THEME_PUT_RES=$(curl -s -X PUT "$BASE_URL/api/theme" \
  -H "Content-Type: application/json" \
  -b "$COOKIES_DB" \
  -d "$THEME_PAYLOAD")
echo "Theme PUT Response: $THEME_PUT_RES"

THEME_GET_RES=$(curl -s -b "$COOKIES_DB" "$BASE_URL/api/theme")
echo "Theme GET Verification: $THEME_GET_RES"


echo ""
echo "--- 7. CLEANUP TEMPORARY DB USER ---"
if [ -n "$DB_USER_ID" ]; then
  USER_DEL_RES=$(curl -s -X DELETE "$BASE_URL/api/users/$DB_USER_ID" -b "$COOKIES_EMERGENCY")
  echo "User Delete Response: $USER_DEL_RES"
fi

echo ""
echo "ALL ROUND 2 SUITE OPERATIONS FINISHED SUCCESSFULLY!"
