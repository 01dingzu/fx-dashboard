/**
 * api.js — Frankfurter API 封装
 * 免费、无需 key、CORS 友好
 * 文档: https://www.frankfurter.app/docs/
 */

const API = {
  BASE_URL: 'https://api.frankfurter.dev/v1',
  cache: new Map(),
  cacheTimeout: 5 * 60 * 1000, // 5分钟缓存

  _cacheKey(...args) {
    return args.join('|');
  },

  _getCache(key) {
    const item = this.cache.get(key);
    if (item && Date.now() - item.time < this.cacheTimeout) {
      return item.data;
    }
    return null;
  },

  _setCache(key, data) {
    this.cache.set(key, { data, time: Date.now() });
  },

  async _fetch(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }
    return response.json();
  },

  /**
   * 获取支持的货币列表
   */
  async getCurrencies() {
    const key = 'currencies';
    const cached = this._getCache(key);
    if (cached) return cached;

    const data = await this._fetch(`${this.BASE_URL}/currencies`);
    this._setCache(key, data);
    return data;
  },

  /**
   * 获取最新汇率
   * @param {string} base - 基准货币
   * @param {string[]} targets - 目标货币数组
   */
  async getLatest(base, targets) {
    const targetStr = targets.join(',');
    const key = this._cacheKey('latest', base, targetStr);
    const cached = this._getCache(key);
    if (cached) return cached;

    const data = await this._fetch(
      `${this.BASE_URL}/latest?from=${base}&to=${targetStr}`
    );
    this._setCache(key, data);
    return data;
  },

  /**
   * 获取历史时间序列
   * @param {string} base
   * @param {string} target
   * @param {string} startDate - YYYY-MM-DD
   * @param {string} endDate - YYYY-MM-DD
   */
  async getHistory(base, target, startDate, endDate) {
    const key = this._cacheKey('history', base, target, startDate, endDate);
    const cached = this._getCache(key);
    if (cached) return cached;

    const data = await this._fetch(
      `${this.BASE_URL}/${startDate}..${endDate}?from=${base}&to=${target}`
    );

    // 转换为 [{date, rate}] 数组
    const series = [];
    if (data && data.rates) {
      const dates = Object.keys(data.rates).sort();
      for (const date of dates) {
        const rate = data.rates[date][target];
        if (rate != null) {
          series.push({ date, rate });
        }
      }
    }

    const result = { base, target, series, startDate, endDate };
    this._setCache(key, result);
    return result;
  },

  /**
   * 获取某一天的历史汇率（用于日涨跌计算）
   */
  async getRateOnDate(base, target, dateStr) {
    const key = this._cacheKey('date', base, target, dateStr);
    const cached = this._getCache(key);
    if (cached) return cached;

    try {
      const data = await this._fetch(
        `${this.BASE_URL}/${dateStr}?from=${base}&to=${target}`
      );
      const rate = data?.rates?.[target] || null;
      this._setCache(key, rate);
      return rate;
    } catch {
      return null;
    }
  },

  /**
   * 获取多目标货币的历史汇率（批量）
   * 返回 { date: { target: rate } } 格式
   */
  async getMultiHistory(base, targets, startDate, endDate) {
    const targetStr = targets.join(',');
    const key = this._cacheKey('multi', base, targetStr, startDate, endDate);
    const cached = this._getCache(key);
    if (cached) return cached;

    const data = await this._fetch(
      `${this.BASE_URL}/${startDate}..${endDate}?from=${base}&to=${targetStr}`
    );

    const result = {};
    if (data && data.rates) {
      for (const [date, rates] of Object.entries(data.rates)) {
        result[date] = rates;
      }
    }

    this._setCache(key, result);
    return result;
  },

  /**
   * 获取前一个交易日的日期
   */
  getPreviousBusinessDay(date = new Date()) {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    // 跳过周末
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() - 1);
    }
    return this.formatDate(d);
  },

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  formatDate(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  /**
   * 获取 N 天前的日期
   */
  getDateDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return this.formatDate(d);
  }
};
