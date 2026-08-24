/**
 * products.js — 挂钩汇率理财产品监控
 * 支持: 区间累积型 / 敲出型 / 鲨鱼鳍 / 双币理财 / 自定义
 */

const Products = {
  products: [],
  currentPairId: null,

  // 产品类型定义
  TYPE_LABELS: {
    range_accumulate: '区间累积型',
    knockout: '敲出型',
    shark_fin: '鲨鱼鳍',
    dual_currency: '双币理财',
    custom: '自定义'
  },

  // Excel 列定义（header = 表头，key = 产品字段名）
  EXCEL_COLUMNS: [
    { header: '产品名称', key: 'name' },
    { header: '产品类型', key: 'type' },
    { header: '基准货币', key: 'base' },
    { header: '目标货币', key: 'target' },
    { header: '投资金额', key: 'amount' },
    { header: '金额币种', key: 'currency' },
    { header: '买入汇率', key: 'entryRate' },
    { header: '起息日', key: 'startDate' },
    { header: '到期日', key: 'endDate' },
    { header: '区间下界', key: 'rangeLower' },
    { header: '区间上界', key: 'rangeUpper' },
    { header: '区间内年化(%)', key: 'highCoupon' },
    { header: '区间外年化(%)', key: 'lowCoupon' },
    { header: '敲出线', key: 'knockoutLevel' },
    { header: '敲出方向', key: 'knockoutDirection' },
    { header: '敲出后年化(%)', key: 'knockoutCoupon' },
    { header: '未敲出/保底年化(%)', key: 'baseCoupon' },
    { header: '保底下限', key: 'floorRate' },
    { header: '封顶上限', key: 'capRate' },
    { header: '封顶年化(%)', key: 'capCoupon' },
    { header: '参与率', key: 'participationRate' },
    { header: '行权汇率', key: 'strikeRate' },
    { header: '存入币种', key: 'depositCurrency' },
    { header: '对手币种', key: 'altCurrency' },
    { header: '年化收益(%)', key: 'coupon' },
    { header: '监控下界', key: 'customLower' },
    { header: '监控上界', key: 'customUpper' },
    { header: '目标年化(%)', key: 'customYield' },
  ],

  // 中文类型 → key 反查
  TYPE_REVERSE: {},

  TYPE_ICONS: {
    range_accumulate: '📊',
    knockout: '🚧',
    shark_fin: '🦈',
    dual_currency: '💱',
    custom: '⚙️'
  },

  init() {
    // 构建 TYPE_REVERSE 反查表
    for (const [k, v] of Object.entries(this.TYPE_LABELS)) {
      this.TYPE_REVERSE[v] = k;
    }
    this.bindEvents();
  },

  bindEvents() {
    // 添加理财产品按钮
    const addBtn = document.getElementById('add-product-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.showAddProductModal());
    }

    // 关闭模态框
    const closeBtn = document.getElementById('close-product-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideAddProductModal());
    }
    const overlay = document.getElementById('product-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => this.hideAddProductModal());
    }

    // 确认添加
    const confirmBtn = document.getElementById('confirm-add-product');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.handleAddProduct());
    }

    // 产品类型切换 — 显示对应参数表单
    const typeSelect = document.getElementById('product-type');
    if (typeSelect) {
      typeSelect.addEventListener('change', (e) => this.switchProductType(e.target.value));
    }

    // 侧边栏 tab 切换
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const paneId = tab.dataset.pane;
        document.getElementById(paneId).classList.add('active');
      });
    });

    // 导出 Excel
    const exportBtn = document.getElementById('export-products-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportToExcel());
    }

    // 导入 Excel
    const importBtn = document.getElementById('import-products-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        document.getElementById('product-file-input').click();
      });
    }
    const fileInput = document.getElementById('product-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.importFromExcel(e));
    }
  },

  // ===== 渲染产品列表 =====
  render(currentPairId) {
    this.currentPairId = currentPairId;
    this.products = Storage.getProducts();
    const list = document.getElementById('product-list');
    const countEl = document.getElementById('product-count');
    if (!list) return;

    if (countEl) countEl.textContent = this.products.length;

    if (this.products.length === 0) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:13px;">点击"添加产品"录入理财产品</div>';
      return;
    }

    list.innerHTML = this.products.map(p => {
      const status = this.calcStatus(p, Dashboard.latestData);
      const typeIcon = this.TYPE_ICONS[p.type] || '📦';
      const typeLabel = this.TYPE_LABELS[p.type] || p.type;

      return `
        <div class="product-card ${status.zoneClass}" data-id="${p.id}">
          <div class="product-card-header">
            <span class="product-card-icon">${typeIcon}</span>
            <div class="product-card-info">
              <div class="product-card-name">${this.escape(p.name)}</div>
              <div class="product-card-meta">${typeLabel} · ${p.base}/${p.target}</div>
            </div>
          </div>
          <div class="product-card-body">
            <div class="product-card-rate">
              <span class="product-card-rate-label">当前汇率</span>
              <span class="product-card-rate-value">${status.currentRate != null ? status.currentRate.toFixed(4) : '--'}</span>
            </div>
            <div class="product-card-yield">
              <span class="product-card-yield-label">预估年化</span>
              <span class="product-card-yield-value ${status.yieldClass}">${status.estimatedYield != null ? status.estimatedYield.toFixed(2) + '%' : '--'}</span>
            </div>
          </div>
          <div class="product-card-zone">
            <span class="zone-badge ${status.zoneClass}">${status.zoneLabel}</span>
            ${status.daysLeft != null ? `<span class="product-card-days">剩余 ${status.daysLeft} 天</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // 点击查看详情
    list.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        this.showProductDetail(id);
      });
    });
  },

  // ===== 收益计算引擎 =====
  calcStatus(product, ratesMap) {
    const assetId = `fx_${product.base}_${product.target}`;
    const rateData = ratesMap ? (ratesMap[assetId] || ratesMap[`${product.base}_${product.target}`]) : null;
    const currentRate = rateData ? (rateData.value != null ? rateData.value : rateData.rate) : null;

    let estimatedYield = null;
    let zone = 'unknown';
    let zoneLabel = '无数据';
    let zoneClass = 'zone-unknown';

    // 到期天数
    let daysLeft = null;
    if (product.endDate) {
      const end = new Date(product.endDate);
      const now = new Date();
      daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    }

    if (currentRate == null) {
      return { currentRate, estimatedYield, zone, zoneLabel, zoneClass, daysLeft, yieldClass: '' };
    }

    switch (product.type) {
      case 'range_accumulate':
        return this.calcRangeAccumulate(product, currentRate, daysLeft);
      case 'knockout':
        return this.calcKnockout(product, currentRate, daysLeft);
      case 'shark_fin':
        return this.calcSharkFin(product, currentRate, daysLeft);
      case 'dual_currency':
        return this.calcDualCurrency(product, currentRate, daysLeft);
      case 'custom':
        return this.calcCustom(product, currentRate, daysLeft);
      default:
        return { currentRate, estimatedYield, zone, zoneLabel, zoneClass, daysLeft, yieldClass: '' };
    }
  },

  // 区间累积型
  calcRangeAccumulate(product, rate, daysLeft) {
    const lower = parseFloat(product.rangeLower);
    const upper = parseFloat(product.rangeUpper);
    const highCoupon = parseFloat(product.highCoupon) / 100;
    const lowCoupon = parseFloat(product.lowCoupon) / 100;

    if (isNaN(lower) || isNaN(upper)) {
      return { currentRate: rate, estimatedYield: null, zone: 'unknown', zoneLabel: '参数缺失', zoneClass: 'zone-unknown', daysLeft, yieldClass: '' };
    }

    const inRange = rate >= lower && rate <= upper;
    const estYield = inRange ? highCoupon * 100 : lowCoupon * 100;

    let zone, zoneLabel, zoneClass;
    if (inRange) {
      zone = 'safe';
      zoneLabel = '安全区';
      zoneClass = 'zone-safe';
    } else if (rate < lower) {
      const dist = ((lower - rate) / rate * 100);
      zone = 'danger';
      zoneLabel = `低于下界 ${dist.toFixed(2)}%`;
      zoneClass = dist < 1 ? 'zone-warning' : 'zone-danger';
    } else {
      const dist = ((rate - upper) / rate * 100);
      zone = 'danger';
      zoneLabel = `高于上界 ${dist.toFixed(2)}%`;
      zoneClass = dist < 1 ? 'zone-warning' : 'zone-danger';
    }

    return {
      currentRate: rate,
      estimatedYield: estYield,
      zone, zoneLabel, zoneClass, daysLeft,
      yieldClass: inRange ? 'yield-high' : 'yield-low'
    };
  },

  // 敲出型
  calcKnockout(product, rate, daysLeft) {
    const knockoutLevel = parseFloat(product.knockoutLevel);
    const knockoutCoupon = parseFloat(product.knockoutCoupon) / 100;
    const baseCoupon = parseFloat(product.baseCoupon || product.highCoupon || 0) / 100;
    const direction = product.knockoutDirection || 'up'; // up: 上方敲出, down: 下方敲出, both: 双向

    if (isNaN(knockoutLevel)) {
      return { currentRate: rate, estimatedYield: null, zone: 'unknown', zoneLabel: '参数缺失', zoneClass: 'zone-unknown', daysLeft, yieldClass: '' };
    }

    let knockedOut = false;
    if (direction === 'up' && rate >= knockoutLevel) knockedOut = true;
    if (direction === 'down' && rate <= knockoutLevel) knockedOut = true;
    if (direction === 'both' && (rate >= knockoutLevel || rate <= parseFloat(product.knockoutLower))) knockedOut = true;

    if (knockedOut) {
      return {
        currentRate: rate,
        estimatedYield: knockoutCoupon * 100,
        zone: 'knocked',
        zoneLabel: '已敲出',
        zoneClass: 'zone-danger',
        daysLeft,
        yieldClass: 'yield-low'
      };
    }

    // 未敲出 — 距离敲出线多远
    const dist = Math.abs((rate - knockoutLevel) / rate * 100);
    const estYield = baseCoupon * 100;

    let zone, zoneLabel, zoneClass;
    if (dist > 5) {
      zone = 'safe';
      zoneLabel = `距敲出线 ${dist.toFixed(2)}%`;
      zoneClass = 'zone-safe';
    } else if (dist > 2) {
      zone = 'warning';
      zoneLabel = `距敲出线 ${dist.toFixed(2)}%`;
      zoneClass = 'zone-warning';
    } else {
      zone = 'danger';
      zoneLabel = `接近敲出 ${dist.toFixed(2)}%`;
      zoneClass = 'zone-danger';
    }

    return {
      currentRate: rate,
      estimatedYield: estYield,
      zone, zoneLabel, zoneClass, daysLeft,
      yieldClass: 'yield-high'
    };
  },

  // 鲨鱼鳍
  calcSharkFin(product, rate, daysLeft) {
    const floor = parseFloat(product.floorRate);
    const cap = parseFloat(product.capRate);
    const participationRate = parseFloat(product.participationRate || 1);
    const baseCoupon = parseFloat(product.baseCoupon || 0) / 100;
    const capCoupon = parseFloat(product.capCoupon || 0) / 100;

    if (isNaN(floor) || isNaN(cap)) {
      return { currentRate: rate, estimatedYield: null, zone: 'unknown', zoneLabel: '参数缺失', zoneClass: 'zone-unknown', daysLeft, yieldClass: '' };
    }

    let estYield, zone, zoneLabel, zoneClass;

    if (rate < floor) {
      // 低于下限 — 保底收益
      estYield = baseCoupon * 100;
      zone = 'danger';
      zoneLabel = '低于保底';
      zoneClass = 'zone-danger';
    } else if (rate >= cap) {
      // 触及上限 — 封顶收益
      estYield = capCoupon * 100;
      zone = 'capped';
      zoneLabel = '已触顶';
      zoneClass = 'zone-warning';
    } else {
      // 在区间内 — 浮动收益
      const progress = (rate - floor) / (cap - floor);
      estYield = (baseCoupon + (capCoupon - baseCoupon) * progress * participationRate) * 100;
      zone = 'safe';
      zoneLabel = '浮动收益区';
      zoneClass = 'zone-safe';
    }

    return {
      currentRate: rate,
      estimatedYield: estYield,
      zone, zoneLabel, zoneClass, daysLeft,
      yieldClass: zone === 'safe' ? 'yield-high' : 'yield-low'
    };
  },

  // 双币理财
  calcDualCurrency(product, rate, daysLeft) {
    const strike = parseFloat(product.strikeRate);
    const depositCurrency = product.depositCurrency || 'CNY';
    const altCurrency = product.altCurrency || 'USD';
    const coupon = parseFloat(product.coupon || 0) / 100;

    if (isNaN(strike)) {
      return { currentRate: rate, estimatedYield: null, zone: 'unknown', zoneLabel: '参数缺失', zoneClass: 'zone-unknown', daysLeft, yieldClass: '' };
    }

    // 判断到期交付哪种货币
    // 如果存入 CNY，汇率 >= strike 则以 USD 交付（相当于按 strike 换汇）
    const deliverAlt = rate >= strike;
    const estYield = coupon * 100;

    let zone, zoneLabel, zoneClass;
    if (deliverAlt) {
      const dist = ((rate - strike) / strike * 100);
      zone = 'warning';
      zoneLabel = `将以 ${altCurrency} 交付`;
      zoneClass = dist < 1 ? 'zone-warning' : 'zone-safe';
    } else {
      const dist = ((strike - rate) / rate * 100);
      zone = 'safe';
      zoneLabel = `将以 ${depositCurrency} 交付`;
      zoneClass = dist < 1 ? 'zone-warning' : 'zone-safe';
    }

    return {
      currentRate: rate,
      estimatedYield: estYield,
      zone, zoneLabel, zoneClass, daysLeft,
      yieldClass: 'yield-high'
    };
  },

  // 自定义
  calcCustom(product, rate, daysLeft) {
    const lower = parseFloat(product.customLower);
    const upper = parseFloat(product.customUpper);
    const targetYield = parseFloat(product.customYield || 0);

    if (isNaN(lower) || isNaN(upper)) {
      return { currentRate: rate, estimatedYield: targetYield, zone: 'unknown', zoneLabel: '自定义监控', zoneClass: 'zone-unknown', daysLeft, yieldClass: '' };
    }

    const inRange = rate >= lower && rate <= upper;
    let zone, zoneLabel, zoneClass;
    if (inRange) {
      zone = 'safe';
      zoneLabel = '目标区间内';
      zoneClass = 'zone-safe';
    } else if (rate < lower) {
      zone = 'danger';
      zoneLabel = `低于目标 ${((lower - rate) / rate * 100).toFixed(2)}%`;
      zoneClass = 'zone-danger';
    } else {
      zone = 'danger';
      zoneLabel = `高于目标 ${((rate - upper) / rate * 100).toFixed(2)}%`;
      zoneClass = 'zone-danger';
    }

    return {
      currentRate: rate,
      estimatedYield: inRange ? targetYield : null,
      zone, zoneLabel, zoneClass, daysLeft,
      yieldClass: inRange ? 'yield-high' : 'yield-low'
    };
  },

  // ===== 产品详情 =====
  showProductDetail(id) {
    const product = this.products.find(p => p.id === id);
    if (!product) return;

    const status = this.calcStatus(product, Dashboard.latestData);
    const typeLabel = this.TYPE_LABELS[product.type] || product.type;
    const typeIcon = this.TYPE_ICONS[product.type] || '📦';
    const baseInfo = getCurrencyInfo(product.base);
    const targetInfo = getCurrencyInfo(product.target);

    // 生成参数表
    const params = this.getProductParams(product);

    // 生成关键线（用于图表叠加）
    const lines = this.getProductLines(product);

    const detail = document.getElementById('product-detail');
    if (!detail) return;

    detail.innerHTML = `
      <div class="product-detail-card">
        <div class="product-detail-header">
          <div>
            <span class="product-detail-icon">${typeIcon}</span>
            <span class="product-detail-name">${this.escape(product.name)}</span>
          </div>
          <span class="zone-badge ${status.zoneClass}">${status.zoneLabel}</span>
        </div>

        <div class="product-detail-grid">
          <div class="product-stat">
            <div class="product-stat-label">产品类型</div>
            <div class="product-stat-value">${typeLabel}</div>
          </div>
          <div class="product-stat">
            <div class="product-stat-label">挂钩货币对</div>
            <div class="product-stat-value">${baseInfo.flag} ${product.base} / ${targetInfo.flag} ${product.target}</div>
          </div>
          <div class="product-stat">
            <div class="product-stat-label">投资金额</div>
            <div class="product-stat-value">${product.amount ? parseFloat(product.amount).toLocaleString() + ' ' + (product.currency || 'CNY') : '--'}</div>
          </div>
          <div class="product-stat">
            <div class="product-stat-label">买入汇率</div>
            <div class="product-stat-value">${product.entryRate || '--'}</div>
          </div>
          <div class="product-stat">
            <div class="product-stat-label">当前汇率</div>
            <div class="product-stat-value ${status.currentRate != null && product.entryRate && status.currentRate >= product.entryRate ? 'up' : 'down'}">${status.currentRate != null ? status.currentRate.toFixed(4) : '--'}</div>
          </div>
          <div class="product-stat">
            <div class="product-stat-label">预估年化收益</div>
            <div class="product-stat-value ${status.yieldClass}">${status.estimatedYield != null ? status.estimatedYield.toFixed(2) + '%' : '--'}</div>
          </div>
          <div class="product-stat">
            <div class="product-stat-label">起息日</div>
            <div class="product-stat-value">${product.startDate || '--'}</div>
          </div>
          <div class="product-stat">
            <div class="product-stat-label">到期日</div>
            <div class="product-stat-value">${product.endDate || '--'} ${status.daysLeft != null ? `(${status.daysLeft > 0 ? '剩' + status.daysLeft + '天' : '已到期'})` : ''}</div>
          </div>
        </div>

        ${params.length > 0 ? `
          <div class="product-params">
            <h4>产品参数</h4>
            <table class="params-table">
              ${params.map(p => `<tr><td>${p.label}</td><td>${p.value}</td></tr>`).join('')}
            </table>
          </div>
        ` : ''}

        ${lines.length > 0 ? `
          <div class="product-lines-legend">
            <h4>图表关键线</h4>
            <div class="lines-legend-list">
              ${lines.map(l => `<div class="line-legend-item"><span class="line-color-dot" style="background:${l.color}"></span>${l.label}</div>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="product-detail-actions">
          <button class="btn-danger-small" onclick="Products.deleteProduct('${product.id}')">删除产品</button>
        </div>
      </div>
    `;
  },

  getProductParams(product) {
    const params = [];
    switch (product.type) {
      case 'range_accumulate':
        if (product.rangeLower) params.push({ label: '区间下界', value: product.rangeLower });
        if (product.rangeUpper) params.push({ label: '区间上界', value: product.rangeUpper });
        if (product.highCoupon) params.push({ label: '区间内年化', value: product.highCoupon + '%' });
        if (product.lowCoupon) params.push({ label: '区间外年化', value: product.lowCoupon + '%' });
        break;
      case 'knockout':
        if (product.knockoutLevel) params.push({ label: '敲出线', value: product.knockoutLevel });
        if (product.knockoutDirection) params.push({ label: '敲出方向', value: { up: '向上敲出', down: '向下敲出', both: '双向敲出' }[product.knockoutDirection] || product.knockoutDirection });
        if (product.knockoutCoupon) params.push({ label: '敲出后年化', value: product.knockoutCoupon + '%' });
        if (product.baseCoupon) params.push({ label: '未敲出年化', value: product.baseCoupon + '%' });
        break;
      case 'shark_fin':
        if (product.floorRate) params.push({ label: '保底下限', value: product.floorRate });
        if (product.capRate) params.push({ label: '封顶上限', value: product.capRate });
        if (product.baseCoupon) params.push({ label: '保底年化', value: product.baseCoupon + '%' });
        if (product.capCoupon) params.push({ label: '封顶年化', value: product.capCoupon + '%' });
        if (product.participationRate) params.push({ label: '参与率', value: product.participationRate });
        break;
      case 'dual_currency':
        if (product.strikeRate) params.push({ label: '行权汇率', value: product.strikeRate });
        if (product.depositCurrency) params.push({ label: '存入币种', value: product.depositCurrency });
        if (product.altCurrency) params.push({ label: '对手币种', value: product.altCurrency });
        if (product.coupon) params.push({ label: '年化收益', value: product.coupon + '%' });
        break;
      case 'custom':
        if (product.customLower) params.push({ label: '监控下界', value: product.customLower });
        if (product.customUpper) params.push({ label: '监控上界', value: product.customUpper });
        if (product.customYield) params.push({ label: '目标年化', value: product.customYield + '%' });
        break;
    }
    return params;
  },

  // 获取产品关键线（用于图表叠加）
  getProductLines(product) {
    const lines = [];
    switch (product.type) {
      case 'range_accumulate':
        if (product.rangeLower) lines.push({ value: parseFloat(product.rangeLower), color: '#22c55e', label: `区间下界 ${product.rangeLower}`, dash: [6, 4] });
        if (product.rangeUpper) lines.push({ value: parseFloat(product.rangeUpper), color: '#ef4444', label: `区间上界 ${product.rangeUpper}`, dash: [6, 4] });
        break;
      case 'knockout':
        if (product.knockoutLevel) lines.push({ value: parseFloat(product.knockoutLevel), color: '#ef4444', label: `敲出线 ${product.knockoutLevel}`, dash: [2, 4] });
        break;
      case 'shark_fin':
        if (product.floorRate) lines.push({ value: parseFloat(product.floorRate), color: '#22c55e', label: `保底下限 ${product.floorRate}`, dash: [6, 4] });
        if (product.capRate) lines.push({ value: parseFloat(product.capRate), color: '#f59e0b', label: `封顶上限 ${product.capRate}`, dash: [6, 4] });
        break;
      case 'dual_currency':
        if (product.strikeRate) lines.push({ value: parseFloat(product.strikeRate), color: '#8b5cf6', label: `行权汇率 ${product.strikeRate}`, dash: [2, 4] });
        break;
      case 'custom':
        if (product.customLower) lines.push({ value: parseFloat(product.customLower), color: '#22c55e', label: `下界 ${product.customLower}`, dash: [6, 4] });
        if (product.customUpper) lines.push({ value: parseFloat(product.customUpper), color: '#ef4444', label: `上界 ${product.customUpper}`, dash: [6, 4] });
        break;
    }
    if (product.entryRate) {
      lines.push({ value: parseFloat(product.entryRate), color: '#3b82f6', label: `买入汇率 ${product.entryRate}`, dash: [], width: 1.5 });
    }
    return lines;
  },

  // 获取当前选中标的关联的产品线
  getLinesForPair(pairId) {
    // pairId 可能是 fx_USD_CNY 格式，也可能是旧的 USD_CNY 格式
    const products = Storage.getProducts().filter(p => {
      const assetId = `fx_${p.base}_${p.target}`;
      return assetId === pairId || `${p.base}_${p.target}` === pairId;
    });
    let allLines = [];
    for (const p of products) {
      allLines = allLines.concat(this.getProductLines(p));
    }
    // 去重（同 value 同 color 的合并）
    return allLines;
  },

  // ===== 添加产品模态框 =====
  showAddProductModal() {
    // 填充汇率标的下拉（用已有的观察列表中的FX类型）
    const pairSelect = document.getElementById('product-pair');
    const fxAssets = Storage.getAssets().filter(a => a.type === 'fx');
    if (fxAssets.length > 0) {
      pairSelect.innerHTML = fxAssets.map(a => {
        const baseInfo = getCurrencyInfo(a.params.base);
        const targetInfo = getCurrencyInfo(a.params.target);
        return `<option value="${a.params.base}|${a.params.target}">${baseInfo.flag} ${a.params.base} / ${targetInfo.flag} ${a.params.target}</option>`;
      }).join('');
      // 如果有当前选中的标的，默认选它
      if (Dashboard.selectedId) {
        const asset = fxAssets.find(a => a.id === Dashboard.selectedId);
        if (asset) pairSelect.value = `${asset.params.base}|${asset.params.target}`;
      }
    } else {
      pairSelect.innerHTML = '<option value="">请先添加汇率标的</option>';
    }

    // 重置表单
    document.getElementById('product-name').value = '';
    document.getElementById('product-type').value = 'range_accumulate';
    this.switchProductType('range_accumulate');

    document.getElementById('product-modal-overlay').classList.add('show');
    document.getElementById('product-modal').classList.add('show');
  },

  hideAddProductModal() {
    document.getElementById('product-modal-overlay').classList.remove('show');
    document.getElementById('product-modal').classList.remove('show');
  },

  switchProductType(type) {
    document.querySelectorAll('.product-type-fields').forEach(el => {
      el.style.display = 'none';
    });
    const target = document.getElementById(`fields-${type}`);
    if (target) target.style.display = 'block';

    // 自动填充产品名称建议
    const nameInput = document.getElementById('product-name');
    if (!nameInput.value) {
      nameInput.placeholder = `${this.TYPE_LABELS[type]}理财产品`;
    }
  },

  handleAddProduct() {
    const name = document.getElementById('product-name').value.trim() || `${this.TYPE_LABELS[document.getElementById('product-type').value]}理财产品`;
    const type = document.getElementById('product-type').value;
    const pairValue = document.getElementById('product-pair').value;

    if (!pairValue) {
      App.toast('请先在观察列表添加货币对');
      return;
    }

    const [base, target] = pairValue.split('|');
    const amount = document.getElementById('product-amount').value;
    const currency = document.getElementById('product-currency').value;
    const entryRate = document.getElementById('product-entry-rate').value;
    const startDate = document.getElementById('product-start-date').value;
    const endDate = document.getElementById('product-end-date').value;

    const product = {
      name, type, base, target,
      amount: amount || null,
      currency: currency || 'CNY',
      entryRate: entryRate || null,
      startDate: startDate || null,
      endDate: endDate || null
    };

    // 按类型收集参数
    switch (type) {
      case 'range_accumulate':
        product.rangeLower = document.getElementById('ra-lower').value;
        product.rangeUpper = document.getElementById('ra-upper').value;
        product.highCoupon = document.getElementById('ra-high-coupon').value;
        product.lowCoupon = document.getElementById('ra-low-coupon').value;
        break;
      case 'knockout':
        product.knockoutLevel = document.getElementById('ko-level').value;
        product.knockoutDirection = document.getElementById('ko-direction').value;
        product.knockoutCoupon = document.getElementById('ko-coupon').value;
        product.baseCoupon = document.getElementById('ko-base-coupon').value;
        break;
      case 'shark_fin':
        product.floorRate = document.getElementById('sf-floor').value;
        product.capRate = document.getElementById('sf-cap').value;
        product.baseCoupon = document.getElementById('sf-base-coupon').value;
        product.capCoupon = document.getElementById('sf-cap-coupon').value;
        product.participationRate = document.getElementById('sf-participation').value;
        break;
      case 'dual_currency':
        product.strikeRate = document.getElementById('dc-strike').value;
        product.depositCurrency = document.getElementById('dc-deposit').value;
        product.altCurrency = document.getElementById('dc-alt').value;
        product.coupon = document.getElementById('dc-coupon').value;
        break;
      case 'custom':
        product.customLower = document.getElementById('cu-lower').value;
        product.customUpper = document.getElementById('cu-upper').value;
        product.customYield = document.getElementById('cu-yield').value;
        break;
    }

    Storage.addProduct(product);
    this.hideAddProductModal();
    this.render(this.currentPairId);
    App.toast('产品已添加');
  },

  deleteProduct(id) {
    if (!confirm('确定删除这个产品吗？')) return;
    Storage.removeProduct(id);
    this.render(this.currentPairId);
    document.getElementById('product-detail').innerHTML = '';
    App.toast('产品已删除');
  },

  // ===== Excel 导出 =====
  exportToExcel() {
    const products = Storage.getProducts();
    if (products.length === 0) {
      App.toast('没有产品可导出');
      return;
    }

    // 构建 AOA (array of arrays) 数据
    const headers = this.EXCEL_COLUMNS.map(c => c.header);
    const rows = products.map(p => {
      return this.EXCEL_COLUMNS.map(c => {
        let val = p[c.key];
        if (val == null || val === '') return '';
        // 数字字段保持数值类型
        const numKeys = ['amount', 'entryRate', 'rangeLower', 'rangeUpper', 'highCoupon',
          'lowCoupon', 'knockoutLevel', 'knockoutCoupon', 'baseCoupon', 'floorRate',
          'capRate', 'capCoupon', 'participationRate', 'strikeRate', 'coupon',
          'customLower', 'customUpper', 'customYield'];
        if (numKeys.includes(c.key) && val !== '') {
          const n = parseFloat(val);
          if (!isNaN(n)) return n;
        }
        // 产品类型：key → 中文
        if (c.key === 'type') {
          return this.TYPE_LABELS[val] || val;
        }
        return val;
      });
    });

    const aoa = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // 设置列宽
    ws['!cols'] = this.EXCEL_COLUMNS.map(c => ({ wch: Math.max(c.header.length * 2, 12) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '理财产品');

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `理财产品_${date}.xlsx`);
    App.toast(`已导出 ${products.length} 个产品`);
  },

  // ===== Excel 导入 =====
  async importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = ''; // 重置，允许重复选同一文件

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // 读取为 JSON 对象数组（用表头做 key）
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rawRows.length === 0) {
        App.toast('Excel 中没有数据');
        return;
      }

      // 构建表头 → key 的映射（支持中英文表头）
      const headerMap = {};
      const firstRow = rawRows[0];
      for (const header of Object.keys(firstRow)) {
        // 精确匹配
        const col = this.EXCEL_COLUMNS.find(c => c.header === header);
        if (col) {
          headerMap[header] = col.key;
          continue;
        }
        // 模糊匹配（去掉空格、括号内容）
        const cleanHeader = header.replace(/[\s\(（].*$/, '').trim();
        const col2 = this.EXCEL_COLUMNS.find(c => {
          const ch = c.header.replace(/[\s\(（].*$/, '').trim();
          return ch === cleanHeader;
        });
        if (col2) headerMap[header] = col2.key;
      }

      const existing = Storage.getProducts();
      const existingKeys = new Set(existing.map(p => `${p.name}|${p.type}|${p.base}|${p.target}`));

      let imported = 0;
      let skipped = 0;
      const errors = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const product = {};

        for (const [header, value] of Object.entries(row)) {
          const key = headerMap[header];
          if (!key) continue;
          // 产品类型：中文 → key
          if (key === 'type') {
            const typeKey = this.TYPE_REVERSE[value] || value;
            product[key] = typeKey;
          } else if (value instanceof Date) {
            // 日期 → YYYY-MM-DD
            product[key] = value.toISOString().slice(0, 10);
          } else if (value === '' || value == null) {
            product[key] = null;
          } else {
            product[key] = String(value).trim();
          }
        }

        // 基本校验
        if (!product.name || !product.type || !product.base || !product.target) {
          errors.push(`第 ${i + 2} 行：缺少必填字段（名称/类型/基准货币/目标货币）`);
          skipped++;
          continue;
        }

        // 类型校验
        if (!this.TYPE_LABELS[product.type]) {
          errors.push(`第 ${i + 2} 行：未知产品类型 "${product.type}"`);
          skipped++;
          continue;
        }

        // 去重检测
        const dupKey = `${product.name}|${product.type}|${product.base}|${product.target}`;
        if (existingKeys.has(dupKey)) {
          skipped++;
          continue;
        }
        existingKeys.add(dupKey);

        // 生成 id 并添加
        product.id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${imported}`;
        product.createdAt = Date.now();
        existing.push(product);
        imported++;
      }

      if (imported > 0) {
        Storage.saveProducts(existing);
        this.render(this.currentPairId);
      }

      let msg = `导入 ${imported} 个产品`;
      if (skipped > 0) msg += `，跳过 ${skipped} 个（重复或格式不符）`;
      App.toast(msg);
      if (errors.length > 0) {
        console.warn('导入错误详情:', errors);
      }
    } catch (e) {
      console.error('导入失败:', e);
      App.toast('导入失败: ' + e.message);
    }
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
