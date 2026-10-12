/**
 * dashboard.js — 观察台看板
 * 支持多标的类型: 汇率/贵金属/国债
 */

/** 转义后塞进 HTML 属性（错误信息里可能带引号/尖括号，直接拼会破坏标签） */
function escAttr(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const Dashboard = {
  assets: [],
  latestData: {},
  selectedId: null,
  currencyList: {},
  /** 首屏取数是否已回来。用来区分「还在加载」与「取不到」 */
  dataLoaded: false,

  async init() {
    this.bindEvents();

    this.assets = Storage.getAssets();

    // 首次使用或升级: 确保每种类型都有默认标的
    const hasFx = this.assets.some(a => a.type === 'fx');
    const hasMetal = this.assets.some(a => a.type === 'metal');
    const hasBond = this.assets.some(a => a.type === 'bond');
    const hasIndex = this.assets.some(a => a.type === 'index');

    if (!hasFx) {
      for (const item of ASSET_CATALOG.fx.items.slice(0, 6)) {
        Storage.addAsset(createAsset('fx', item));
      }
    }
    if (!hasMetal) {
      for (const item of ASSET_CATALOG.metal.items.slice(0, 2)) {
        Storage.addAsset(createAsset('metal', item));
      }
    }
    if (!hasBond) {
      for (const item of ASSET_CATALOG.bond.items.slice(0, 2)) {
        Storage.addAsset(createAsset('bond', item));
      }
    }
    if (!hasIndex) {
      // 默认播种 4 个常用指数: 标普500、上证综指、恒生指数、日经225
      const defaultCodes = ['GSPC', 'SSEC', 'HSI', 'N225'];
      for (const code of defaultCodes) {
        const item = ASSET_CATALOG.index.items.find(i => i.code === code);
        if (item) Storage.addAsset(createAsset('index', item));
      }
    }

    if (!hasFx || !hasMetal || !hasBond || !hasIndex) {
      this.assets = Storage.getAssets();
    }

    const settings = Storage.getSettings();
    this.selectedId = settings.selectedAssetId || settings.selectedPairId;
    if (!this.selectedId && this.assets.length > 0) {
      this.selectedId = this.assets[0].id;
    }

    try {
      this.currencyList = await API.getCurrencies();
    } catch {
      this.currencyList = {};
    }

    await this.render();
  },

  bindEvents() {
    document.getElementById('refresh-btn').addEventListener('click', () => {
      Adapters.clearCache();
      API.cache.clear();
      this.render();
      App.toast('数据已刷新');
    });

    document.getElementById('data-status-retry')?.addEventListener('click', () => this.retryAll());

    document.getElementById('add-pair-btn').addEventListener('click', () => {
      this.showAddModal();
    });

    document.getElementById('close-add-modal').addEventListener('click', () => this.hideAddModal());
    document.getElementById('add-pair-overlay').addEventListener('click', () => this.hideAddModal());
    document.getElementById('confirm-add-pair').addEventListener('click', () => this.handleAdd());

    // 添加面板类型切换
    document.querySelectorAll('.add-type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.add-type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const type = tab.dataset.type;
        document.querySelectorAll('.add-type-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`add-content-${type}`).classList.add('active');
      });
    });

    document.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const range = parseInt(btn.dataset.range);
        Storage.saveSettings({ timeRange: range });
        App.loadAssetDetail(this.selectedId, range);
      });
    });

    document.getElementById('show-ma').addEventListener('change', (e) => {
      Storage.saveSettings({ showMA: e.target.checked });
      ChartModule.toggleMA(e.target.checked);
    });

    document.querySelectorAll('.analysis-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.analysis-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      });
    });
  },

  async render() {
    this.assets = Storage.getAssets();
    document.getElementById('pair-count').textContent = this.assets.length;

    this.dataLoaded = false;   // 先按「加载中」渲染，取数回来后再区分成功/失败
    this.renderAssetList();
    await this.loadAllLatest();

    if (typeof Products !== 'undefined') {
      Products.render(this.selectedId);
    }

    const emptyState = document.getElementById('empty-state');
    const pairDetail = document.getElementById('pair-detail');

    if (this.assets.length === 0) {
      emptyState.classList.add('show');
      pairDetail.style.display = 'none';
    } else {
      emptyState.classList.remove('show');
      pairDetail.style.display = '';
      if (!this.assets.some(a => a.id === this.selectedId)) {
        this.selectedId = this.assets[0].id;
      }
      const settings = Storage.getSettings();
      document.querySelectorAll('.range-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.range) === settings.timeRange);
      });
      document.getElementById('show-ma').checked = settings.showMA !== false;
      await App.loadAssetDetail(this.selectedId, settings.timeRange);
    }
  },

  // 格式化数值
  formatValue(asset, value) {
    if (value == null) return '--';
    if (asset.type === 'fx') return value.toFixed(4);
    if (asset.type === 'metal') return '$' + value.toFixed(2);
    if (asset.type === 'bond') return value.toFixed(2) + '%';
    if (asset.type === 'index') return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return value.toString();
  },

  getAssetIcon(asset) {
    if (asset.type === 'fx') {
      const baseInfo = getCurrencyInfo(asset.params.base);
      const targetInfo = getCurrencyInfo(asset.params.target);
      return `${baseInfo.flag} ${asset.params.base}<span style="color:var(--text-tertiary)">/</span>${targetInfo.flag} ${asset.params.target}`;
    }
    const catalog = ASSET_CATALOG[asset.type];
    return `${catalog?.icon || ''} ${asset.name}`;
  },

  renderAssetList() {
    const list = document.getElementById('pair-list');
    if (this.assets.length === 0) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:13px;">点击"添加"选择标的</div>';
      return;
    }

    // 按类型分组
    const groups = {};
    const groupOrder = ['fx', 'metal', 'bond', 'index'];
    for (const asset of this.assets) {
      if (!groups[asset.type]) groups[asset.type] = [];
      groups[asset.type].push(asset);
    }

    // 获取折叠状态
    const settings = Storage.getSettings();
    const collapsedGroups = settings.collapsedGroups || [];

    let html = '';
    for (const type of groupOrder) {
      if (!groups[type]) continue;
      const catalog = ASSET_CATALOG[type];
      const items = groups[type];
      const isCollapsed = collapsedGroups.includes(type);

      html += `<div class="asset-group" data-type="${type}">`;
      html += `<div class="asset-group-header" data-toggle="${type}">`;
      html += `<span class="asset-group-arrow">${isCollapsed ? '▶' : '▼'}</span>`;
      html += `<span class="asset-group-label">${catalog.icon} ${catalog.label}</span>`;
      html += `<span class="asset-group-count">${items.length}</span>`;
      html += `</div>`;
      html += `<div class="asset-group-items${isCollapsed ? ' collapsed' : ''}" data-group="${type}">`;

      items.forEach((asset, index) => {
        const data = this.latestData[asset.id];
        const isActive = asset.id === this.selectedId;
        // 取数已回来却仍没有数据 = 失败。旧版把这种情况也画成「加载中...」，
        // 于是一次网络抖动/发布窗口就变成「整个看板没数据」，且永不恢复。
        const failed = !data && this.dataLoaded;
        const reason = failed ? (Adapters.failReasons[asset.id] || '数据源无返回') : '';

        let valueText = failed ? '获取失败' : '加载中...';
        let changeText = '';
        let changeClass = 'flat';

        if (data) {
          valueText = this.formatValue(asset, data.value);
          if (data.changePercent !== null) {
            const sign = data.changePercent >= 0 ? '+' : '';
            changeText = `${sign}${data.changePercent.toFixed(2)}%`;
            changeClass = data.changePercent > 0 ? 'up' : data.changePercent < 0 ? 'down' : 'flat';
          }
        }

        html += `
          <div class="pair-card ${isActive ? 'active' : ''}${failed ? ' failed' : ''}" data-id="${asset.id}" draggable="true"${reason ? ` title="取数失败：${escAttr(reason)}"` : ''}>
            <div class="pair-card-drag" title="拖拽排序">
              <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                <circle cx="2" cy="2" r="1.2"/><circle cx="8" cy="2" r="1.2"/>
                <circle cx="2" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/>
                <circle cx="2" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/>
              </svg>
            </div>
            <div class="pair-card-info">
              <div class="pair-card-title">${this.getAssetIcon(asset)}</div>
              <div class="pair-card-rate">${valueText}</div>
            </div>
            <div class="pair-card-change ${changeClass}">${changeText}</div>
            ${failed ? `<button class="pair-card-retry" data-retry="${asset.id}" title="重新获取这个标的">↻</button>` : ''}
            <button class="pair-card-delete" data-delete="${asset.id}" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        `;
      });

      html += `</div></div>`;
    }

    list.innerHTML = html;

    // 绑定事件
    list.querySelectorAll('.pair-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.pair-card-delete') || e.target.closest('.pair-card-drag')
          || e.target.closest('.pair-card-retry')) return;
        this.selectAsset(card.dataset.id);
      });
    });

    list.querySelectorAll('.pair-card-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeAsset(btn.dataset.delete);
      });
    });

    // 取数失败的标的：单独重试，不用整页刷新
    list.querySelectorAll('.pair-card-retry').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.reloadAsset(btn.dataset.retry);
      });
    });

    // 分组折叠
    list.querySelectorAll('.asset-group-header').forEach(header => {
      header.addEventListener('click', () => {
        const type = header.dataset.toggle;
        const items = list.querySelector(`[data-group="${type}"]`);
        const arrow = header.querySelector('.asset-group-arrow');
        items.classList.toggle('collapsed');
        const isCollapsed = items.classList.contains('collapsed');
        arrow.textContent = isCollapsed ? '▶' : '▼';

        // 持久化折叠状态
        const s = Storage.getSettings();
        let cg = s.collapsedGroups || [];
        if (isCollapsed && !cg.includes(type)) {
          cg.push(type);
        } else if (!isCollapsed) {
          cg = cg.filter(t => t !== type);
        }
        Storage.saveSettings({ collapsedGroups: cg });
      });
    });

    this.bindDragAndDrop(list);
  },

  bindDragAndDrop(list) {
    let draggedId = null;

    list.querySelectorAll('.pair-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        draggedId = card.dataset.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedId);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        list.querySelectorAll('.pair-card').forEach(c => c.classList.remove('drag-over-top', 'drag-over-bottom'));
        draggedId = null;
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (card.dataset.id === draggedId) return;
        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        card.classList.remove('drag-over-top', 'drag-over-bottom');
        card.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedId || card.dataset.id === draggedId) return;
        const rect = card.getBoundingClientRect();
        const dropBefore = e.clientY < rect.top + rect.height / 2;
        const currentAssets = Storage.getAssets();
        const ids = currentAssets.map(a => a.id);
        const fromIdx = ids.indexOf(draggedId);
        const toIdx = ids.indexOf(card.dataset.id);
        ids.splice(fromIdx, 1);
        let insertIdx = ids.indexOf(card.dataset.id);
        if (!dropBefore) insertIdx += 1;
        ids.splice(insertIdx, 0, draggedId);
        Storage.reorderAssets(ids);
        this.assets = Storage.getAssets();
        this.renderAssetList();
      });
    });
  },

  selectAsset(id) {
    this.selectedId = id;
    Storage.setSelectedAssetId(id);
    this.renderAssetList();
    const settings = Storage.getSettings();
    App.loadAssetDetail(id, settings.timeRange);
  },

  async removeAsset(id) {
    const asset = this.assets.find(a => a.id === id);
    if (!asset) return;
    if (confirm(`确定删除 ${asset.name} 吗？`)) {
      Storage.removeAsset(id);
      if (this.selectedId === id) this.selectedId = null;
      await this.render();
      App.toast('已删除');
    }
  },

  async loadAllLatest() {
    if (this.assets.length === 0) {
      this.dataLoaded = true;
      this.renderDataStatusBar();
      return;
    }
    this.latestData = await Adapters.getAllLatest(this.assets);
    this.dataLoaded = true;
    this.renderAssetList();

    // 更新最后更新时间
    const latestEntry = Object.values(this.latestData).find(d => d?.date);
    if (latestEntry) {
      document.getElementById('last-update').textContent = `数据日期: ${latestEntry.date}`;
    }
    this.renderDataStatusBar();
  },

  /** 单个标的重新取数（失败卡片上的 ↻） */
  async reloadAsset(id) {
    const asset = this.assets.find(a => a.id === id);
    if (!asset) return;
    Adapters.clearCache();
    try {
      const fresh = await Adapters.getLatest(asset);
      this.latestData[id] = fresh;
      if (!fresh) this.latestData[id] = null;
    } catch (e) {
      console.error(`重试 ${asset.name} 失败:`, e);
      this.latestData[id] = null;
    }
    this.renderAssetList();
    this.renderDataStatusBar();
    if (id === this.selectedId) await App.loadAssetDetail(id, Storage.getSettings().timeRange);
  },

  /** 全部重新取数（状态条上的「重新获取」） */
  async retryAll() {
    Adapters.clearCache();
    API.cache.clear();
    this.dataLoaded = false;
    this.renderAssetList();
    await this.loadAllLatest();
    App.toast('已重新获取');
    if (this.selectedId) await App.loadAssetDetail(this.selectedId, Storage.getSettings().timeRange);
  },

  /**
   * 取数状态条：有标的取不到时出现，写明原因并给一键重试。
   * 以前失败是静默的（卡片停在「加载中...」），用户看不出是没数据还是没加载完。
   */
  renderDataStatusBar() {
    const bar = document.getElementById('data-status');
    if (!bar) return;
    const failed = this.assets.filter(a => !this.latestData[a.id]);
    const show = this.dataLoaded && failed.length > 0;
    bar.hidden = !show;
    if (!show) return;

    const names = failed.slice(0, 4).map(a => a.name || a.code).join('、');
    const tail = failed.length > 4 ? ` 等 ${failed.length} 个` : '';
    document.getElementById('data-status-text').textContent =
      `${failed.length} 个标的取数失败：${names}${tail}。数据文件每天更新，刚发布时可能短暂读不到，点右侧重试通常即可恢复。`;
  },

  // ===== 添加面板 =====
  showAddModal() {
    // FX 面板
    this.populateCurrencySelects();
    this.renderQuickPairs();

    // 贵金属面板
    this.renderMetalOptions();

    // 国债面板
    this.renderBondOptions();

    // 指数面板
    this.renderIndexOptions();

    document.getElementById('add-pair-overlay').classList.add('show');
    document.getElementById('add-pair-modal').classList.add('show');
  },

  hideAddModal() {
    document.getElementById('add-pair-overlay').classList.remove('show');
    document.getElementById('add-pair-modal').classList.remove('show');
  },

  populateCurrencySelects() {
    const baseSelect = document.getElementById('base-currency');
    const targetSelect = document.getElementById('target-currency');
    let entries = Object.entries(this.currencyList);
    if (entries.length === 0) {
      entries = Object.entries(CURRENCY_INFO).map(([code, info]) => [code, info.name]);
    }
    const options = entries.map(([code, name]) => {
      const info = getCurrencyInfo(code);
      return `<option value="${code}">${info.flag} ${code} — ${name}</option>`;
    }).join('');
    baseSelect.innerHTML = options;
    targetSelect.innerHTML = options;
    if (!baseSelect.value) baseSelect.value = 'USD';
    if (!targetSelect.value) targetSelect.value = 'CNY';
  },

  renderQuickPairs() {
    const list = document.getElementById('quick-pair-list');
    if (!list) return;
    list.innerHTML = QUICK_PAIRS.map(p => {
      const baseInfo = getCurrencyInfo(p.base);
      const targetInfo = getCurrencyInfo(p.target);
      return `<button class="quick-pair-btn" data-base="${p.base}" data-target="${p.target}">
        ${baseInfo.flag}${targetInfo.flag} ${p.label}
      </button>`;
    }).join('');
    list.querySelectorAll('.quick-pair-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('base-currency').value = btn.dataset.base;
        document.getElementById('target-currency').value = btn.dataset.target;
      });
    });
  },

  renderMetalOptions() {
    const list = document.getElementById('metal-option-list');
    if (!list) return;
    const existing = this.assets.filter(a => a.type === 'metal').map(a => a.params.symbol);
    list.innerHTML = ASSET_CATALOG.metal.items.map(item => {
      const exists = existing.includes(item.symbol);
      return `<button class="quick-pair-btn" data-symbol="${item.symbol}" ${exists ? 'disabled' : ''}>
        ${ASSET_CATALOG.metal.icon} ${item.name} (${item.code})
      </button>`;
    }).join('');
    list.querySelectorAll('.quick-pair-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = ASSET_CATALOG.metal.items.find(i => i.symbol === btn.dataset.symbol);
        if (item) {
          const asset = createAsset('metal', item);
          const result = Storage.addAsset(asset);
          if (result.success) {
            this.hideAddModal();
            this.selectedId = asset.id;
            Storage.setSelectedAssetId(asset.id);
            this.render();
            App.toast(`已添加 ${item.name}`);
          }
        }
      });
    });
  },

  renderBondOptions() {
    const list = document.getElementById('bond-option-list');
    if (!list) return;
    const existing = this.assets.filter(a => a.type === 'bond').map(a => a.params.seriesId);
    list.innerHTML = ASSET_CATALOG.bond.items.map(item => {
      const exists = existing.includes(item.seriesId);
      return `<button class="quick-pair-btn" data-series="${item.seriesId}" ${exists ? 'disabled' : ''}>
        ${ASSET_CATALOG.bond.icon} ${item.name} (${item.code})
      </button>`;
    }).join('');
    list.querySelectorAll('.quick-pair-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = ASSET_CATALOG.bond.items.find(i => i.seriesId === btn.dataset.series);
        if (item) {
          const asset = createAsset('bond', item);
          const result = Storage.addAsset(asset);
          if (result.success) {
            this.hideAddModal();
            this.selectedId = asset.id;
            Storage.setSelectedAssetId(asset.id);
            this.render();
            App.toast(`已添加 ${item.name}`);
          }
        }
      });
    });
  },

  renderIndexOptions() {
    const list = document.getElementById('index-option-list');
    if (!list) return;
    const existing = this.assets.filter(a => a.type === 'index').map(a => a.params.indexCode);
    
    // 按地区分组
    const regions = {};
    for (const item of ASSET_CATALOG.index.items) {
      if (!regions[item.region]) regions[item.region] = [];
      regions[item.region].push(item);
    }

    let html = '';
    for (const [region, items] of Object.entries(regions)) {
      html += `<div class="index-region-group">`;
      html += `<div class="index-region-label">${region}</div>`;
      html += `<div class="index-region-items">`;
      for (const item of items) {
        const exists = existing.includes(item.indexCode);
        html += `<button class="quick-pair-btn" data-index="${item.indexCode}" ${exists ? 'disabled' : ''}>
          ${ASSET_CATALOG.index.icon} ${item.name}
        </button>`;
      }
      html += `</div></div>`;
    }
    list.innerHTML = html;

    list.querySelectorAll('.quick-pair-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = ASSET_CATALOG.index.items.find(i => i.indexCode === btn.dataset.index);
        if (item) {
          const asset = createAsset('index', item);
          const result = Storage.addAsset(asset);
          if (result.success) {
            this.hideAddModal();
            this.selectedId = asset.id;
            Storage.setSelectedAssetId(asset.id);
            this.render();
            App.toast(`已添加 ${item.name}`);
          }
        }
      });
    });
  },

  handleAdd() {
    // FX 添加（从 select）
    const base = document.getElementById('base-currency').value;
    const target = document.getElementById('target-currency').value;
    if (!base || !target) { App.toast('请选择货币'); return; }
    if (base === target) { App.toast('基准货币和目标货币不能相同'); return; }
    const item = { code: `${base}/${target}`, name: `${base}/${target}`, base, target };
    const asset = createAsset('fx', item);
    const result = Storage.addAsset(asset);
    if (result.success) {
      this.hideAddModal();
      this.selectedId = asset.id;
      Storage.setSelectedAssetId(asset.id);
      this.render();
      App.toast(`已添加 ${base}/${target}`);
    } else {
      App.toast(result.message);
    }
  }
};
