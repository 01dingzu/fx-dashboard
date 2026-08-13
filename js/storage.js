/**
 * storage.js — 配置存储
 * 支持通用标的（汇率/贵金属/国债）和向后兼容的货币对
 */

const STORAGE_KEY = 'fx_workbench_pairs';
const ASSETS_KEY = 'fx_workbench_assets_v2';
const SETTINGS_KEY = 'fx_workbench_settings';
const PRODUCTS_KEY = 'fx_workbench_products';

const Storage = {
  // ===== 通用标的 =====
  getAssets() {
    try {
      const data = localStorage.getItem(ASSETS_KEY);
      if (data) return JSON.parse(data);
      // 迁移旧的 pairs 数据
      return this._migratePairs();
    } catch {
      return [];
    }
  },

  _migratePairs() {
    const pairs = this.getPairs();
    if (pairs.length === 0) return [];
    const assets = pairs.map((p, i) => ({
      id: `fx_${p.base}_${p.target}`,
      type: 'fx',
      name: `${p.base}/${p.target}`,
      code: `${p.base}/${p.target}`,
      unit: p.target,
      dataSource: 'frankfurter',
      params: { base: p.base, target: p.target },
      order: i,
      addedAt: p.addedAt || Date.now(),
    }));
    this.saveAssets(assets);
    return assets;
  },

  saveAssets(assets) {
    localStorage.setItem(ASSETS_KEY, JSON.stringify(assets));
  },

  addAsset(asset) {
    const assets = this.getAssets();
    if (assets.some(a => a.id === asset.id)) {
      return { success: false, message: '该标的已存在' };
    }
    asset.order = assets.length;
    asset.addedAt = Date.now();
    assets.push(asset);
    this.saveAssets(assets);
    return { success: true };
  },

  removeAsset(id) {
    const assets = this.getAssets().filter(a => a.id !== id);
    this.saveAssets(assets);
  },

  reorderAssets(newOrder) {
    const assets = this.getAssets();
    const map = {};
    assets.forEach(a => { map[a.id] = a; });
    const reordered = newOrder.map(id => map[id]).filter(Boolean);
    reordered.forEach((a, i) => { a.order = i; });
    this.saveAssets(reordered);
  },

  moveAsset(id, direction) {
    const assets = this.getAssets();
    const idx = assets.findIndex(a => a.id === id);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= assets.length) return;
    [assets[idx], assets[newIdx]] = [assets[newIdx], assets[idx]];
    assets.forEach((a, i) => { a.order = i; });
    this.saveAssets(assets);
  },

  // ===== 向后兼容: 旧货币对接口 =====
  getPairs() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  savePairs(pairs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pairs));
  },

  // ===== 设置 =====
  getSettings() {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      const defaults = { selectedAssetId: null, selectedPairId: null, timeRange: 30, showMA: true, collapsedGroups: [] };
      return data ? { ...defaults, ...JSON.parse(data) } : defaults;
    } catch {
      return { selectedAssetId: null, selectedPairId: null, timeRange: 30, showMA: true, collapsedGroups: [] };
    }
  },

  saveSettings(settings) {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  },

  getSelectedAssetId() {
    const s = this.getSettings();
    return s.selectedAssetId || s.selectedPairId;
  },

  setSelectedAssetId(id) {
    this.saveSettings({ selectedAssetId: id, selectedPairId: id });
  },

  // 旧接口兼容
  getSelectedPairId() { return this.getSelectedAssetId(); },
  setSelectedPairId(id) { this.setSelectedAssetId(id); },

  // ===== 理财产品 =====
  getProducts() {
    try {
      const data = localStorage.getItem(PRODUCTS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveProducts(products) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  },

  addProduct(product) {
    const products = this.getProducts();
    product.id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    product.createdAt = Date.now();
    products.push(product);
    this.saveProducts(products);
    return product;
  },

  updateProduct(id, updates) {
    const products = this.getProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx >= 0) {
      products[idx] = { ...products[idx], ...updates };
      this.saveProducts(products);
      return products[idx];
    }
    return null;
  },

  removeProduct(id) {
    const products = this.getProducts().filter(p => p.id !== id);
    this.saveProducts(products);
  }
};
