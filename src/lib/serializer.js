/**
 * Centralized serialization shims for load-bearing MongoDB compatibility.
 * Ensures _id: record.id, lowercase enums, nested relations, and joins are preserved.
 */

export function serializeStore(store) {
  if (!store) return null;

  const categories = Array.isArray(store.categories)
    ? store.categories.map((c) => {
        if (c.categoryId !== undefined) return c.categoryId;
        if (c.category !== undefined) return c.category.id;
        return c.id || c;
      })
    : [];

  const subcategories = Array.isArray(store.subcategories)
    ? store.subcategories.map((sc) => {
        if (sc.subcategoryId !== undefined) return sc.subcategoryId;
        if (sc.subcategory !== undefined) return sc.subcategory.id;
        return sc.id || sc;
      })
    : [];

  const coupons = Array.isArray(store.coupons)
    ? store.coupons.map((c) => ({
        ...c,
        _id: c.id,
        type: c.type ? c.type.toLowerCase() : "code",
      }))
    : undefined;

  return {
    ...store,
    _id: store.id,
    categories,
    subcategories,
    ...(coupons !== undefined ? { coupons } : {}),
  };
}

export function serializeCoupon(c) {
  if (!c) return null;
  return {
    ...c,
    _id: c.id,
    type: c.type ? c.type.toLowerCase() : "code",
    homepageSection: c.homepageSection ? c.homepageSection.toLowerCase() : "featured",
    store: c.store ? { ...c.store, _id: c.store.id } : null,
    storeId: c.store ? { ...c.store, _id: c.store.id } : c.storeId,
  };
}

export function serializeCategory(c) {
  if (!c) return null;
  const subcategories = Array.isArray(c.subcategories)
    ? c.subcategories.map((sub) => ({
        ...sub,
        _id: sub.id,
        status: sub.status ? sub.status.toLowerCase() : "enabled",
      }))
    : [];

  return {
    ...c,
    _id: c.id,
    status: c.status ? c.status.toLowerCase() : "enabled",
    subcategories,
    subs: subcategories,
  };
}

export function serializeSubcategory(s) {
  if (!s) return null;
  return {
    ...s,
    _id: s.id,
    status: s.status ? s.status.toLowerCase() : "enabled",
    parentCategory: s.parentCategory
      ? { ...s.parentCategory, _id: s.parentCategory.id }
      : s.parentCategoryId,
    parentCategoryId: s.parentCategoryId,
  };
}

export function serializePost(p) {
  if (!p) return null;
  return {
    ...p,
    _id: p.id,
    status: p.status ? p.status.toLowerCase() : "enabled",
  };
}

export function serializeSlider(s) {
  if (!s) return null;
  return {
    ...s,
    _id: s.id,
    status: s.status ? s.status.toLowerCase() : "enabled",
  };
}

export function serializeBanner(b) {
  if (!b) return null;
  return {
    ...b,
    _id: b.id,
    status: b.status ? b.status.toLowerCase() : "enabled",
  };
}

export function serializeMainBanner(b) {
  if (!b) return null;
  return {
    ...b,
    _id: b.id,
    status: b.status ? b.status.toLowerCase() : "enabled",
  };
}

export function serializeBadge(b) {
  if (!b) return null;
  return {
    ...b,
    _id: b.id,
  };
}

export function serializeUser(u) {
  if (!u) return null;
  let role = "subscribor";
  if (u.role === "ADMIN") role = "administration";
  else if (u.role === "EDITOR") role = "editor";
  else if (u.role === "SUBSCRIBER") role = "subscribor";

  // Strict security requirement: Never leak passwordHash or password
  const { passwordHash, password, ...safeUser } = u;

  return {
    ...safeUser,
    _id: u.id,
    role,
    status: u.status ? u.status.toLowerCase() : "enabled",
  };
}
