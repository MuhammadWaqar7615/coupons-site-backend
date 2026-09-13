#!/bin/bash
set -e

BASE_URL="http://localhost:4000"
STORE_ID="a28cc9d6-7f8e-4783-8a6a-86b2fce6bcf8"
STORE_SLUG="quis%20rem%20excepteur%20e"
COUPON_ID="76876398-5226-4756-a81d-a6ba7be913f1"
CAT_ID="2aa58abb-bdfc-457e-8da6-bbef51ed5094"
CAT_SLUG="all-stores"
SUBCAT_ID="ffdac6a9-5c03-47e0-8b37-d62da4774237"
SLIDER_ID="3bfc47bf-1879-43d0-b316-e31675f43be2"
BADGE_ID="74df3c13-8e1e-4084-b862-b9dd173698ac"
BANNER_ID="4926b081-c98e-4fa0-a523-a6563567996f"
POST_ID="2beadb15-79ea-4bca-b69e-6128fe57dc53"
SEOPAGE_ID="958e6f9c-3d4d-4ab9-9e45-e98cd3606ff8"
REDIRECT_ID="491a0a83-f136-4f80-817b-76a3550a2d1c"

echo "========================================================"
echo "1. PUBLIC ENDPOINTS TEST"
echo "========================================================"

hit() {
  local desc="$1"
  local url="$2"
  local res=$(curl -s -o /dev/null -w "%{http_code} %{content_type}" "$url")
  echo "  $desc: $res"
}

hit "Root /" "$BASE_URL/"
hit "Health /api/health" "$BASE_URL/api/health"
hit "Health Deep /api/health?deep=1" "$BASE_URL/api/health?deep=1"
hit "Robots.txt" "$BASE_URL/robots.txt"
hit "Sitemap.xml" "$BASE_URL/sitemap.xml"
hit "Stores List" "$BASE_URL/api/stores"
hit "Store by ID" "$BASE_URL/api/stores/$STORE_ID"
hit "Store by Slug" "$BASE_URL/api/stores/$STORE_SLUG"
hit "Store Coupons" "$BASE_URL/api/stores/$STORE_ID/coupons"
hit "Coupon by ID" "$BASE_URL/api/coupons/$COUPON_ID"
hit "Features" "$BASE_URL/api/features"
hit "Search" "$BASE_URL/api/search?q=a"
hit "Categories List" "$BASE_URL/api/categories"
hit "Category by ID" "$BASE_URL/api/categories/$CAT_ID"
hit "Category by Slug" "$BASE_URL/api/categories/$CAT_SLUG"
hit "Subcategories List" "$BASE_URL/api/subcategories"
hit "Subcategory by ID" "$BASE_URL/api/subcategories/$SUBCAT_ID"
hit "Sliders List" "$BASE_URL/api/sliders"
hit "Slider by ID" "$BASE_URL/api/sliders/$SLIDER_ID"
hit "Badges List" "$BASE_URL/api/badges"
hit "Badge by ID" "$BASE_URL/api/badges/$BADGE_ID"
hit "Promo Banners List" "$BASE_URL/api/promo-banners"
hit "Promo Banner by ID" "$BASE_URL/api/promo-banners/$BANNER_ID"
hit "Blog List" "$BASE_URL/api/blog"
hit "Blog by ID" "$BASE_URL/api/blog/$POST_ID"
hit "SEO Global GET" "$BASE_URL/api/seo/global"
hit "SEO Pages GET" "$BASE_URL/api/seo/pages"
hit "SEO Page by ID" "$BASE_URL/api/seo/pages/$SEOPAGE_ID"
hit "SEO Redirects GET" "$BASE_URL/api/seo/redirects"
hit "SEO Redirect by ID" "$BASE_URL/api/seo/redirects/$REDIRECT_ID"
hit "SEO Robots GET (JSON)" "$BASE_URL/api/seo/robots"
hit "SEO Sitemap GET (JSON)" "$BASE_URL/api/seo/sitemap"
hit "SEO Sitemap GET (XML)" "$BASE_URL/api/seo/sitemap?format=xml"

echo ""
echo "========================================================"
echo "2. ADMIN UNAUTHENTICATED CALLS (Must return 401/403, NOT 500)"
echo "========================================================"

hit_admin() {
  local method="$1"
  local desc="$2"
  local url="$3"
  local code=$(curl -s -X "$method" -o /dev/null -w "%{http_code}" "$url")
  echo "  [$method] $desc: HTTP $code"
}

hit_admin "GET" "Coupons List" "$BASE_URL/api/coupons"
hit_admin "POST" "Coupon Create" "$BASE_URL/api/coupons"
hit_admin "PUT" "Coupon Edit" "$BASE_URL/api/coupons/$COUPON_ID"
hit_admin "DELETE" "Coupon Delete" "$BASE_URL/api/coupons/$COUPON_ID"
hit_admin "POST" "Store Create" "$BASE_URL/api/stores"
hit_admin "PUT" "Store Edit" "$BASE_URL/api/stores/$STORE_ID"
hit_admin "DELETE" "Store Delete" "$BASE_URL/api/stores/$STORE_ID"
hit_admin "POST" "Store Bulk Delete" "$BASE_URL/api/stores/bulk-delete"
hit_admin "GET" "Users List" "$BASE_URL/api/users"
hit_admin "POST" "User Create" "$BASE_URL/api/users"
hit_admin "GET" "User Detail" "$BASE_URL/api/users/fake-user-id"
hit_admin "PUT" "User Edit" "$BASE_URL/api/users/fake-user-id"
hit_admin "DELETE" "User Delete" "$BASE_URL/api/users/fake-user-id"
hit_admin "GET" "Translations List" "$BASE_URL/api/translations"
hit_admin "PUT" "Translations Save" "$BASE_URL/api/translations"
hit_admin "GET" "Theme Settings" "$BASE_URL/api/theme"
hit_admin "PUT" "Theme Save" "$BASE_URL/api/theme"
hit_admin "GET" "Site Settings" "$BASE_URL/api/settings"
hit_admin "PUT" "Site Settings Save" "$BASE_URL/api/settings"
hit_admin "GET" "Email Templates List" "$BASE_URL/api/email-templates"
hit_admin "GET" "Email Template Detail" "$BASE_URL/api/email-templates/welcome"
hit_admin "PUT" "Email Template Save" "$BASE_URL/api/email-templates/welcome"
hit_admin "GET" "SEO Dashboard Counts" "$BASE_URL/api/seo/dashboard"
hit_admin "POST" "SEO Global Save" "$BASE_URL/api/seo/global"
hit_admin "POST" "SEO Page Create" "$BASE_URL/api/seo/pages"
hit_admin "PUT" "SEO Page Edit" "$BASE_URL/api/seo/pages/$SEOPAGE_ID"
hit_admin "DELETE" "SEO Page Delete" "$BASE_URL/api/seo/pages/$SEOPAGE_ID"
hit_admin "POST" "SEO Redirect Create" "$BASE_URL/api/seo/redirects"
hit_admin "PUT" "SEO Redirect Edit" "$BASE_URL/api/seo/redirects/$REDIRECT_ID"
hit_admin "DELETE" "SEO Redirect Delete" "$BASE_URL/api/seo/redirects/$REDIRECT_ID"
hit_admin "POST" "SEO Robots Save" "$BASE_URL/api/seo/robots"
hit_admin "POST" "SEO Sitemap Save" "$BASE_URL/api/seo/sitemap"
hit_admin "POST" "Media Upload" "$BASE_URL/api/upload"

echo ""
echo "========================================================"
echo "3. AUTHENTICATION & ADMIN SESSION SMOKE TEST"
echo "========================================================"

COOKIES_FILE="/tmp/unified_backend_cookies.txt"
rm -f "$COOKIES_FILE"

echo "Attempting admin login with credentials..."
LOGIN_RES=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@admin.com","password":"testdbpasswordisthis"}' \
  -c "$COOKIES_FILE" -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$LOGIN_RES" | grep "HTTP_STATUS:" | cut -d: -f2)
LOGIN_BODY=$(echo "$LOGIN_RES" | grep -v "HTTP_STATUS:")

if [ "$HTTP_STATUS" -ne 200 ]; then
  # Try secondary password from .env
  LOGIN_RES=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@admin.com","password":"123456"}' \
    -c "$COOKIES_FILE" -w "\nHTTP_STATUS:%{http_code}")
  HTTP_STATUS=$(echo "$LOGIN_RES" | grep "HTTP_STATUS:" | cut -d: -f2)
  LOGIN_BODY=$(echo "$LOGIN_RES" | grep -v "HTTP_STATUS:")
fi

echo "Login status: HTTP $HTTP_STATUS"
echo "Login response: $LOGIN_BODY"
echo "Cookies captured:"
cat "$COOKIES_FILE"

echo ""
echo "Testing authenticated admin routes with session cookie:"

hit_auth() {
  local desc="$1"
  local url="$2"
  local code=$(curl -s -b "$COOKIES_FILE" -o /dev/null -w "%{http_code}" "$url")
  echo "  $desc: HTTP $code"
}

hit_auth "Authenticated /api/users" "$BASE_URL/api/users"
hit_auth "Authenticated /api/coupons" "$BASE_URL/api/coupons"
hit_auth "Authenticated /api/seo/dashboard" "$BASE_URL/api/seo/dashboard"
hit_auth "Authenticated /api/translations" "$BASE_URL/api/translations"
hit_auth "Authenticated /api/theme" "$BASE_URL/api/theme"
hit_auth "Authenticated /api/settings" "$BASE_URL/api/settings"
hit_auth "Authenticated /api/email-templates" "$BASE_URL/api/email-templates"

echo ""
echo "Testing Logout..."
LOGOUT_RES=$(curl -s -X POST "$BASE_URL/api/auth/logout" \
  -H "Accept: application/json" \
  -b "$COOKIES_FILE" -c "$COOKIES_FILE" -w "\nHTTP_STATUS:%{http_code}")
echo "Logout response: $LOGOUT_RES"

echo "All tests finished!"
