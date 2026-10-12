/**
 * data-adapters.js — 多数据源适配器
 * 统一接口: getLatest(asset) / getHistory(asset, from, to)
 *
 * 数据源:
 * - SAFE: 人民币汇率中间价 (静态JSON, 中国外汇交易中心, CNY对主源)
 * - Frankfurter: 汇率 (CORS, 实时+历史, 非CNY对主源 / CNY对备源)
 * - gold-api.com: 贵金属现价 (CORS, 实时, 主源)
 * - Twelve Data: 贵金属现价 (CORS, 实时, 备用源)
 * - 静态 JSON: 国债收益率 + 贵金属历史 + 股市指数 (同源, 每日更新)
 */

const ASSET_CATALOG = {
  fx: {
    label: '汇率',
    icon: '💱',
    items: [
      { code: 'USD/CNY', name: '美元/人民币', base: 'USD', target: 'CNY' },
      { code: 'EUR/CNY', name: '欧元/人民币', base: 'EUR', target: 'CNY' },
      { code: 'USD/JPY', name: '美元/日元', base: 'USD', target: 'JPY' },
      { code: 'GBP/CNY', name: '英镑/人民币', base: 'GBP', target: 'CNY' },
      { code: 'HKD/CNY', name: '港币/人民币', base: 'HKD', target: 'CNY' },
      { code: 'JPY/CNY', name: '日元/人民币', base: 'JPY', target: 'CNY' },
      { code: 'AUD/CNY', name: '澳元/人民币', base: 'AUD', target: 'CNY' },
      { code: 'NZD/CNY', name: '新西兰元/人民币', base: 'NZD', target: 'CNY' },
      { code: 'SGD/CNY', name: '新加坡元/人民币', base: 'SGD', target: 'CNY' },
      { code: 'CHF/CNY', name: '瑞郎/人民币', base: 'CHF', target: 'CNY' },
      { code: 'CAD/CNY', name: '加元/人民币', base: 'CAD', target: 'CNY' },
      { code: 'KRW/CNY', name: '韩元/人民币', base: 'KRW', target: 'CNY' },
      { code: 'THB/CNY', name: '泰铢/人民币', base: 'THB', target: 'CNY' },
      { code: 'RUB/CNY', name: '卢布/人民币', base: 'RUB', target: 'CNY' },
      { code: 'MYR/CNY', name: '林吉特/人民币', base: 'MYR', target: 'CNY' },
      { code: 'ZAR/CNY', name: '兰特/人民币', base: 'ZAR', target: 'CNY' },
      { code: 'EUR/USD', name: '欧元/美元', base: 'EUR', target: 'USD' },
      { code: 'GBP/USD', name: '英镑/美元', base: 'GBP', target: 'USD' },
      { code: 'USD/HKD', name: '美元/港币', base: 'USD', target: 'HKD' },
      { code: 'AUD/USD', name: '澳元/美元', base: 'AUD', target: 'USD' },
      { code: 'USD/CHF', name: '美元/瑞郎', base: 'USD', target: 'CHF' },
      { code: 'USD/KRW', name: '美元/韩元', base: 'USD', target: 'KRW' },
      { code: 'USD/SGD', name: '美元/新元', base: 'USD', target: 'SGD' },
    ]
  },
  metal: {
    label: '贵金属',
    icon: '🥇',
    items: [
      { code: 'XAU/USD', name: '黄金', symbol: 'XAU', unit: 'USD/oz' },
      { code: 'XAG/USD', name: '白银', symbol: 'XAG', unit: 'USD/oz' },
      { code: 'XPT/USD', name: '铂金', symbol: 'XPT', unit: 'USD/oz' },
      { code: 'XPD/USD', name: '钯金', symbol: 'XPD', unit: 'USD/oz' },
    ]
  },
  bond: {
    label: '国债收益率',
    icon: '📊',
    items: [
      { code: 'US10Y', name: '美国10年期国债', seriesId: 'DGS10', unit: '%' },
      { code: 'US2Y', name: '美国2年期国债', seriesId: 'DGS2', unit: '%' },
      { code: 'US30Y', name: '美国30年期国债', seriesId: 'DGS30', unit: '%' },
    ]
  },
  index: {
    label: '股市指数',
    icon: '📈',
    items: [
      // 美国
      { code: 'GSPC',  name: '标普500',          indexCode: 'gspc',  region: '美国', unit: 'pts' },
      { code: 'IXIC',  name: '纳斯达克综合',     indexCode: 'ixic',  region: '美国', unit: 'pts' },
      { code: 'DJI',   name: '道琼斯工业',       indexCode: 'dji',   region: '美国', unit: 'pts' },
      { code: 'RUT',   name: '罗素2000',         indexCode: 'rut',   region: '美国', unit: 'pts' },
      // 中国
      { code: 'SSEC',  name: '上证综指',         indexCode: 'ssec',  region: '中国', unit: 'pts' },
      { code: 'SZSE',  name: '深证成指',         indexCode: 'szse',  region: '中国', unit: 'pts' },
      { code: 'CSI300',name: '沪深300',          indexCode: 'csi300',region: '中国', unit: 'pts' },
      { code: 'HSI',   name: '恒生指数',         indexCode: 'hsi',   region: '中国', unit: 'pts' },
      // 欧洲
      { code: 'FTSE',  name: '富时100',          indexCode: 'ftse',  region: '欧洲', unit: 'pts' },
      { code: 'GDAXI', name: '德国DAX',          indexCode: 'gdaxi', region: '欧洲', unit: 'pts' },
      { code: 'FCHI',  name: '法国CAC 40',       indexCode: 'fchi',  region: '欧洲', unit: 'pts' },
      // 亚太
      { code: 'N225',  name: '日经225',          indexCode: 'n225',  region: '亚太', unit: 'pts' },
      { code: 'KS11',  name: '韩国KOSPI',        indexCode: 'ks11',  region: '亚太', unit: 'pts' },
      // 其他
      { code: 'VIX',   name: 'VIX波动率',        indexCode: 'vix',   region: '其他', unit: '' },
    ]
  }
};

function createAsset(type, item) {
  const id = type === 'fx'
    ? `fx_${item.base}_${item.target}`
    : `${type}_${item.code.replace('/', '_')}`;

  const dataSource = type === 'fx' ? 'frankfurter'
    : type === 'metal' ? 'goldapi'
    : type === 'bond' ? 'fred'
    : type === 'index' ? 'static'
    : 'frankfurter';

  const params = type === 'fx'
    ? { base: item.base, target: item.target }
    : type === 'metal'
      ? { symbol: item.symbol }
      : type === 'bond'
        ? { seriesId: item.seriesId }
        : type === 'index'
          ? { indexCode: item.indexCode, region: item.region }
          : {};

  const asset = {
    id,
    type,
    name: item.name,
    code: item.code,
    unit: item.unit || (type === 'fx' ? item.target : ''),
    dataSource,
    params,
    order: 0,
    addedAt: Date.now(),
  };
  return asset;
}

const Adapters = {
  cache: new Map(),
  cacheTimeout: 5 * 60 * 1000,

  /** 取数失败原因（assetId -> 简短说明）。界面据此显示「获取失败·重试」而不是假装还在加载 */
  failReasons: {},

  _noteFail(assetId, reason) {
    if (assetId) this.failReasons[assetId] = reason;
    else console.warn('[adapters]', reason);
  },

  /** 带超时的 fetch：没有它，一个挂住的请求会让卡片永远停在「加载中」 */
  _fetchWithTimeout(url, opts = {}, ms = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  },

  /**
   * 并发合并（in-flight dedupe）。
   * 「先查缓存 → await fetch → 再写缓存」在并发首屏下会被击穿：N 个标的同抢一份文件，
   * 每个调用者都看到缓存为空，于是发 N 次同样的请求（实测人民币对的 114KB 文件被拉 5 次）。
   * 慢网络下这几次重复请求会互相抢带宽、一起踩超时——表现就是「整个看板没数据」。
   */
  _inflight: new Map(),
  _coalesce(key, fn) {
    const running = this._inflight.get(key);
    if (running) return running;
    const p = Promise.resolve().then(fn).finally(() => {
      // 只清掉自己这一条：重试时若已换上新请求，别把它误删
      if (this._inflight.get(key) === p) this._inflight.delete(key);
    });
    this._inflight.set(key, p);
    return p;
  },

  /** 清空全部内存缓存（含 SAFE 中间价缓存），刷新/重试按钮用 */
  clearCache() {
    this.cache.clear();
    this._inflight.clear();
    this._safeRatesCache = null;
  },

  _cacheKey(...args) { return args.join('|'); },
  _getCache(key) {
    const item = this.cache.get(key);
    if (item && Date.now() - item.time < this.cacheTimeout) return item.data;
    return null;
  },
  _setCache(key, data) {
    this.cache.set(key, { data, time: Date.now() });
  },

  _formatDate(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  _getDateDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return this._formatDate(d);
  },

  // ===== SAFE 人民币汇率中间价 (静态JSON, CNY对主源) =====
  _safeRatesCache: null,

  async _safeLoadRates() {
    if (this._safeRatesCache) return this._safeRatesCache;
    // 人民币对的行情全靠这一份文件，取不到就是汇率区整体没数据 →
    // 和 _loadStaticJson 一样做「失败后带 cache-busting 再试一次」。
    // 外面套 _coalesce：首屏 5 个人民币对并发进来只发 1 次请求。
    return this._coalesce('safe_rmb_rates', async () => {
      for (let i = 0; i < 2; i++) {
        try {
          const url = i === 0 ? 'data/safe-rmb-rates.json' : `data/safe-rmb-rates.json?_t=${Date.now()}`;
          const resp = await this._fetchWithTimeout(url, i > 0 ? { cache: 'no-store' } : {});
          if (!resp.ok) continue;
          const data = await resp.json();
          this._safeRatesCache = data;
          return data;
        } catch { /* 换下一次尝试 */ }
      }
      return null;
    });
  },

  _safeGetRate(entry, base, target) {
    // SAFE 数据中所有汇率都是 "1外币 = X人民币"
    if (base === 'CNY' && entry[target] != null) {
      return 1 / entry[target];  // 1 CNY = 1/X 外币
    }
    if (target === 'CNY' && entry[base] != null) {
      return entry[base];  // 1 外币 = X CNY
    }
    return null;
  },

  // ===== Frankfurter (汇率, 非CNY对主源 / CNY对备源) =====
  async _frankfurterLatest(asset) {
    const { base, target } = asset.params;

    // CNY 对优先使用 SAFE 中间价
    if (base === 'CNY' || target === 'CNY') {
      const safeData = await this._safeLoadRates();
      if (safeData && safeData.length >= 1) {
        const last = safeData[safeData.length - 1];
        const rate = this._safeGetRate(last, base, target);
        if (rate != null) {
          let prevValue = null;
          let change = null;
          let changePercent = null;
          if (safeData.length >= 2) {
            const prev = safeData[safeData.length - 2];
            prevValue = this._safeGetRate(prev, base, target);
            if (prevValue != null && prevValue !== 0) {
              change = rate - prevValue;
              changePercent = (change / prevValue) * 100;
            }
          }
          return { value: rate, date: last.date, prevValue, change, changePercent };
        }
      }
      console.log('SAFE data unavailable for', base + '/' + target, ', falling back to Frankfurter');
    }

    // 非 CNY 对或 SAFE 不可用时，使用 Frankfurter API
    try {
      const resp = await this._fetchWithTimeout(`https://api.frankfurter.dev/v1/latest?from=${base}&to=${target}`);
      const data = await resp.json();
      const rate = data?.rates?.[target];
      if (rate == null) {
        this._noteFail(asset.id, `Frankfurter 未返回 ${base}/${target}`);
        return null;
      }

      // 获取前日汇率计算涨跌
      const prevDate = this._getDateDaysAgo(2);
      let prevRate = null;
      try {
        const prevResp = await this._fetchWithTimeout(`https://api.frankfurter.dev/v1/${prevDate}?from=${base}&to=${target}`);
        const prevData = await prevResp.json();
        prevRate = prevData?.rates?.[target] || null;
      } catch {}

      const change = prevRate != null ? rate - prevRate : null;
      const changePercent = prevRate != null && prevRate !== 0 ? (change / prevRate) * 100 : null;

      return { value: rate, date: data.date, prevValue: prevRate, change, changePercent };
    } catch (e) {
      this._noteFail(asset.id, `Frankfurter 请求失败: ${(e && e.message) || e}`);
      return null;
    }
  },

  async _frankfurterHistory(asset, fromDate, toDate) {
    const { base, target } = asset.params;

    // CNY 对优先使用 SAFE 中间价
    if (base === 'CNY' || target === 'CNY') {
      const safeData = await this._safeLoadRates();
      if (safeData) {
        const series = safeData
          .filter(e => e.date >= fromDate && e.date <= toDate)
          .map(e => {
            const rate = this._safeGetRate(e, base, target);
            return rate != null ? { date: e.date, value: rate } : null;
          })
          .filter(Boolean)
          .sort((a, b) => a.date.localeCompare(b.date));
        if (series.length > 0) {
          return { series };
        }
      }
    }

    // 非 CNY 对或 SAFE 不可用时，使用 Frankfurter API
    try {
      const resp = await this._fetchWithTimeout(`https://api.frankfurter.dev/v1/${fromDate}..${toDate}?from=${base}&to=${target}`);
      const data = await resp.json();
      const series = [];
      if (data?.rates) {
        for (const [date, rates] of Object.entries(data.rates)) {
          if (rates[target] != null) {
            series.push({ date, value: rates[target] });
          }
        }
      }
      return { series: series.sort((a, b) => a.date.localeCompare(b.date)) };
    } catch {
      return { series: [] };
    }
  },

  // ===== gold-api.com (贵金属现价, 主源) + Twelve Data (备用源) =====

  // Twelve Data 金属符号映射
  _tdSymbolMap: {
    'XAU': 'XAU/USD',
    'XAG': 'XAG/USD',
    'XPT': 'XPT/USD',
    'XPD': 'XPD/USD',
  },

  // Twelve Data API key (免费版, 800次/天)
  _tdApiKey: '4f4e965acd514b20b30af066c1830ffa',

  async _twelveDataPrice(symbol) {
    /** 从 Twelve Data 获取贵金属现价 (备用源) */
    const tdSymbol = this._tdSymbolMap[symbol];
    if (!tdSymbol) return null;
    try {
      const resp = await fetch(`https://api.twelvedata.com/price?symbol=${tdSymbol}&apikey=${this._tdApiKey}`);
      const data = await resp.json();
      if (data?.price != null) {
        console.log(`Twelve Data ${symbol}: $${data.price} (备用源)`);
        return parseFloat(data.price);
      }
      console.warn(`Twelve Data ${symbol}: ${data?.message || 'no price'}`);
    } catch(e) {
      console.warn(`Twelve Data ${symbol} 请求失败:`, e.message);
    }
    return null;
  },

  async _goldApiLatest(asset) {
    const { symbol } = asset.params;
    
    // --- 主源: gold-api.com ---
    try {
      const resp = await fetch(`https://api.gold-api.com/price/${symbol}`);
      if (!resp.ok) {
        console.warn(`gold-api ${symbol}: HTTP ${resp.status}`);
      } else {
        const data = await resp.json();
        if (data?.price != null) {
          // 尝试加载历史文件获取前日价格
          const history = await this._loadStaticJson(`data/metals-${symbol.toLowerCase()}.json`, asset.id);
          let prevValue = null;
          if (history && history.length >= 2) {
            prevValue = history[history.length - 2].value;
          } else if (history && history.length === 1) {
            prevValue = history[0].value;
          }

          const change = prevValue != null ? data.price - prevValue : null;
          const changePercent = prevValue != null && prevValue !== 0 ? (change / prevValue) * 100 : null;

          return {
            value: data.price,
            date: data.updatedAt ? data.updatedAt.split('T')[0] : this._formatDate(new Date()),
            prevValue,
            change,
            changePercent,
          };
        }
      }
    } catch(e) {
      console.warn(`gold-api ${symbol} 请求失败:`, e.message);
    }

    // --- 备用源: Twelve Data ---
    console.log(`gold-api ${symbol} 失败, 尝试 Twelve Data...`);
    const tdPrice = await this._twelveDataPrice(symbol);
    if (tdPrice != null) {
      const history = await this._loadStaticJson(`data/metals-${symbol.toLowerCase()}.json`, asset.id);
      let prevValue = null;
      if (history && history.length >= 2) {
        prevValue = history[history.length - 2].value;
      }
      const change = prevValue != null ? tdPrice - prevValue : null;
      const changePercent = prevValue != null && prevValue !== 0 ? (change / prevValue) * 100 : null;
      return { value: tdPrice, date: this._formatDate(new Date()), prevValue, change, changePercent };
    }

    // --- 最终回退: 静态 JSON ---
    console.log(`Twelve Data ${symbol} 也失败, 回退到静态 JSON`);
    const staticData = await this._loadStaticJson('data/metals-current.json', asset.id);
    if (staticData && staticData[symbol]) {
      const price = staticData[symbol].price;
      const date = staticData[symbol].updatedAt?.split('T')[0] || this._formatDate(new Date());
      
      const history = await this._loadStaticJson(`data/metals-${symbol.toLowerCase()}.json`, asset.id);
      let prevValue = null;
      if (history && history.length >= 2) {
        prevValue = history[history.length - 2].value;
      }
      const change = prevValue != null ? price - prevValue : null;
      const changePercent = prevValue != null && prevValue !== 0 ? (change / prevValue) * 100 : null;
      
      return { value: price, date, prevValue, change, changePercent };
    }
    
    console.error(`${symbol}: 所有数据源均失败`);
    this._noteFail(asset.id, `${symbol} 三个数据源均失败`);
    return null;
  },

  async _goldApiHistory(asset, fromDate, toDate) {
    const { symbol } = asset.params;
    const history = await this._loadStaticJson(`data/metals-${symbol.toLowerCase()}.json`, asset.id);
    if (!history) return { series: [] };
    const series = history
      .filter(s => s.date >= fromDate && s.date <= toDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return { series };
  },

  // ===== FRED 静态 JSON (国债收益率) =====
  _fredFileMap: {
    'DGS10': 'data/treasury-us-10y.json',
    'DGS2': 'data/treasury-us-2y.json',
    'DGS30': 'data/treasury-us-30y.json',
  },

  async _fredLatest(asset) {
    const { seriesId } = asset.params;
    const filename = this._fredFileMap[seriesId];
    if (!filename) return null;

    const history = await this._loadStaticJson(filename, asset.id);
    if (!history || history.length === 0) {
      if (history) this._noteFail(asset.id, `${filename} 内容为空`);
      return null;
    }

    const last = history[history.length - 1];
    let prevValue = null;
    if (history.length >= 2) {
      prevValue = history[history.length - 2].value;
    }

    const change = prevValue != null ? last.value - prevValue : null;
    const changePercent = prevValue != null && prevValue !== 0 ? (change / prevValue) * 100 : null;

    return { value: last.value, date: last.date, prevValue, change, changePercent };
  },

  async _fredHistory(asset, fromDate, toDate) {
    const { seriesId } = asset.params;
    const filename = this._fredFileMap[seriesId];
    if (!filename) return { series: [] };

    const history = await this._loadStaticJson(filename, asset.id);
    if (!history) return { series: [] };

    const series = history
      .filter(s => s.date >= fromDate && s.date <= toDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return { series };
  },

  // ===== 静态 JSON 指数 (纯静态, 每日更新) =====
  async _indexLatest(asset) {
    const { indexCode } = asset.params;
    const filename = `data/index-${indexCode}.json`;
    const history = await this._loadStaticJson(filename, asset.id);
    if (!history || history.length === 0) {
      if (history) this._noteFail(asset.id, `${filename} 内容为空`);
      return null;
    }

    const last = history[history.length - 1];
    let prevValue = null;
    if (history.length >= 2) {
      prevValue = history[history.length - 2].value;
    }

    const change = prevValue != null ? last.value - prevValue : null;
    const changePercent = prevValue != null && prevValue !== 0 ? (change / prevValue) * 100 : null;

    return { value: last.value, date: last.date, prevValue, change, changePercent };
  },

  async _indexHistory(asset, fromDate, toDate) {
    const { indexCode } = asset.params;
    const filename = `data/index-${indexCode}.json`;
    const history = await this._loadStaticJson(filename, asset.id);
    if (!history) return { series: [] };

    const series = history
      .filter(s => s.date >= fromDate && s.date <= toDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return { series };
  },

  // ===== 静态 JSON 加载 =====
  /**
   * 静态数据（data/*.json）读取，带一次自动重试。
   *
   * 为什么需要重试：这些文件每天由 Actions 更新并触发 Pages 重新发布，
   * 刚发布完的一小段时间里 CDN 边缘可能对新路径返回 404（实测过 data/*.json
   * 连续 404、几分钟后自行恢复 200）。旧写法遇到一次失败就返回 null，
   * 卡片会永久停在「加载中...」，看起来就是「整个看板没数据」。
   * 这里失败后带 cache-busting 参数再取一次，绕过被缓存的 404。
   */
  async _loadStaticJson(path, assetId = null) {
    const key = `static_${path}`;
    const cached = this._getCache(key);
    if (cached) return cached;

    // 同一文件被多个标的共用时（如 metals-current.json）合并成一次请求；
    // 失败原因放在结果里回传，这样每个调用标的都能登记自己的失败态。
    let reason = '';
    const res = await this._coalesce(key, async () => {
      const attempts = [path, `${path}${path.includes('?') ? '&' : '?'}_t=${Date.now()}`];
      for (let i = 0; i < attempts.length; i++) {
        try {
          const resp = await this._fetchWithTimeout(attempts[i], i > 0 ? { cache: 'no-store' } : {});
          if (!resp.ok) { reason = `HTTP ${resp.status}`; continue; }
          const data = await resp.json();
          this._setCache(key, data);
          return { data, reason: '' };
        } catch (e) {
          reason = e && e.name === 'AbortError' ? '请求超时' : String((e && e.message) || e);
        }
      }
      return { data: null, reason };
    });

    if (res.data === null) this._noteFail(assetId, `${path} ${res.reason || reason || '未知错误'}`);
    return res.data;
  },

  // ===== 统一接口 =====
  async getLatest(asset) {
    const key = this._cacheKey('latest', asset.id);
    const cached = this._getCache(key);
    if (cached) return cached;

    let result = null;
    switch (asset.dataSource) {
      case 'frankfurter':
        result = await this._frankfurterLatest(asset);
        break;
      case 'goldapi':
        result = await this._goldApiLatest(asset);
        break;
      case 'fred':
        result = await this._fredLatest(asset);
        break;
      case 'static':
        result = await this._indexLatest(asset);
        break;
    }
    if (result) this._setCache(key, result);
    return result;
  },

  async getHistory(asset, fromDate, toDate) {
    const key = this._cacheKey('history', asset.id, fromDate, toDate);
    const cached = this._getCache(key);
    if (cached) return cached;

    let result = { series: [] };
    switch (asset.dataSource) {
      case 'frankfurter':
        result = await this._frankfurterHistory(asset, fromDate, toDate);
        break;
      case 'goldapi':
        result = await this._goldApiHistory(asset, fromDate, toDate);
        break;
      case 'fred':
        result = await this._fredHistory(asset, fromDate, toDate);
        break;
      case 'static':
        result = await this._indexHistory(asset, fromDate, toDate);
        break;
    }
    this._setCache(key, result);
    return result;
  },

  // 批量获取多个标的的最新值
  async getAllLatest(assets) {
    const results = {};
    this.failReasons = {};
    await Promise.all(assets.map(async (asset) => {
      try {
        results[asset.id] = await this.getLatest(asset);
        // 取到 null 也算失败：界面要能区分「还在加载」和「取不到」，
        // 否则失败会被一直画成「加载中...」，看起来就是整个看板没数据。
        if (!results[asset.id]) this.failReasons[asset.id] = this.failReasons[asset.id] || '数据源无返回';
      } catch(e) {
        console.error(`获取 ${asset.name} 数据失败:`, e);
        results[asset.id] = null;
        this.failReasons[asset.id] = `获取失败: ${e.message}`;
      }
    }));
    return results;
  },
};
