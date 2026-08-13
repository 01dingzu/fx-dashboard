/**
 * app.js — 主控制器
 */

const App = {
  currentSeries: null,
  currentAsset: null,

  async init() {
    ChartModule.init();
    Products.init();
    await Dashboard.init();
    Products.render(Dashboard.selectedId);
  },

  async loadAssetDetail(assetId, timeRange) {
    if (!assetId) return;

    const asset = Storage.getAssets().find(a => a.id === assetId);
    if (!asset) return;

    this.currentAsset = asset;

    // 更新详情头部
    const headerEl = document.getElementById('detail-base');
    const targetEl = document.getElementById('detail-target');
    if (asset.type === 'fx') {
      const baseInfo = getCurrencyInfo(asset.params.base);
      const targetInfo = getCurrencyInfo(asset.params.target);
      headerEl.innerHTML = `${baseInfo.flag} ${asset.params.base}`;
      targetEl.innerHTML = `${targetInfo.flag} ${asset.params.target}`;
    } else {
      const catalog = ASSET_CATALOG[asset.type];
      headerEl.innerHTML = `${catalog?.icon || ''} ${asset.name}`;
      targetEl.innerHTML = `<span style="color:var(--text-tertiary);font-size:14px">${asset.unit}</span>`;
    }

    // 更新当前值
    const data = Dashboard.latestData[assetId];
    const rateEl = document.getElementById('detail-rate-value');
    const changeEl = document.getElementById('detail-change');

    if (data) {
      rateEl.textContent = Dashboard.formatValue(asset, data.value);
      if (data.changePercent !== null) {
        const sign = data.changePercent >= 0 ? '+' : '';
        const arrow = data.changePercent > 0 ? '▲' : data.changePercent < 0 ? '▼' : '—';
        changeEl.textContent = `${arrow} ${sign}${data.changePercent.toFixed(2)}%`;
        changeEl.className = 'rate-change ' + (data.changePercent > 0 ? 'up' : data.changePercent < 0 ? 'down' : 'flat');
      } else {
        changeEl.textContent = '--';
        changeEl.className = 'rate-change flat';
      }
    } else {
      rateEl.textContent = '加载中...';
      changeEl.textContent = '--';
      changeEl.className = 'rate-change flat';
    }

    // 加载历史数据
    const endDate = Adapters._formatDate(new Date());
    const startDate = Adapters._getDateDaysAgo(timeRange + 10);

    try {
      const history = await Adapters.getHistory(asset, startDate, endDate);

      if (history.series.length === 0) {
        App.toast('暂无历史数据');
        return;
      }

      const targetStartDate = Adapters._getDateDaysAgo(timeRange);
      const series = history.series.filter(d => d.date >= targetStartDate);

      this.currentSeries = series;

      // 叠加理财产品关键线
      const productLines = Products.getLinesForPair(assetId);
      ChartModule.setOverlayLines(productLines);

      // 渲染图表
      const label = asset.type === 'fx'
        ? `${asset.params.base}/${asset.params.target}`
        : asset.code;
      await ChartModule.render(series, label, asset.unit, asset.type);

      // 刷新产品列表
      Products.render(assetId);

      // 渲染分析
      const stats = Analysis.computeStats(series);
      Analysis.renderStats(stats, asset);
      Analysis.renderFactors(stats, asset);
      Analysis.renderNews(asset);

    } catch (err) {
      console.error('加载详情失败:', err);
      App.toast('加载数据失败: ' + err.message);
    }
  },

  // 向后兼容
  async loadPairDetail(pairId, timeRange) {
    return this.loadAssetDetail(pairId, timeRange);
  },

  toast(message, duration = 2500) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
