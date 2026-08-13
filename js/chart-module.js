/**
 * chart-module.js — 走势图
 * Chart.js 折线图 + MA5/MA20 均线
 */

const ChartModule = {
  chart: null,
  showMA: true,
  overlayLines: [],

  init() {
    this.showMA = Storage.getSettings().showMA !== false;
  },

  setOverlayLines(lines) {
    this.overlayLines = lines || [];
  },

  async render(series, label, unit, assetType) {
    const canvas = document.getElementById('fx-chart');
    const ctx = canvas.getContext('2d');

    if (this.chart) {
      this.chart.destroy();
    }

    if (!series || series.length === 0) {
      this.chart = null;
      return;
    }

    const labels = series.map(d => {
      const date = new Date(d.date);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    const rates = series.map(d => d.value != null ? d.value : d.rate);

    // 计算均线
    const ma5 = this.calculateMA(rates, 5);
    const ma20 = this.calculateMA(rates, 20);

    // 判断整体涨跌
    const isUp = rates[rates.length - 1] >= rates[0];
    const lineColor = isUp ? '#ef4444' : '#22c55e'; // 涨红跌绿

    const datasets = [
      {
        label: label || '汇率',
        data: rates,
        borderColor: lineColor,
        backgroundColor: this.hexToRgba(lineColor, 0.08),
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: lineColor,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
      }
    ];

    if (this.showMA) {
      datasets.push({
        label: 'MA5',
        data: ma5,
        borderColor: '#f59e0b',
        borderWidth: 1.5,
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderDash: [4, 4],
      });

      datasets.push({
        label: 'MA20',
        data: ma20,
        borderColor: '#3b82f6',
        borderWidth: 1.5,
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderDash: [4, 4],
      });
    }

    // 叠加理财产品关键线
    if (this.overlayLines.length > 0) {
      for (const line of this.overlayLines) {
        datasets.push({
          label: line.label,
          data: new Array(rates.length).fill(line.value),
          borderColor: line.color,
          borderWidth: line.width || 1.5,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderDash: line.dash || [],
          tension: 0,
        });
      }
    }

    this.chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: this.showMA,
            position: 'top',
            align: 'end',
            labels: {
              color: '#94a3b8',
              font: { size: 11 },
              boxWidth: 20,
              boxHeight: 2,
              padding: 12,
            }
          },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            cornerRadius: 8,
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                return series[idx]?.date || items[0].label;
              },
              label: (item) => {
                const value = item.parsed.y;
                if (value == null) return null;
                if (assetType === 'fx') return `${item.dataset.label}: ${value.toFixed(4)}`;
                if (assetType === 'metal') return `${item.dataset.label}: $${value.toFixed(2)}`;
                if (assetType === 'bond') return `${item.dataset.label}: ${value.toFixed(2)}%`;
                if (assetType === 'index') return `${item.dataset.label}: ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                return `${item.dataset.label}: ${value.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(51, 65, 85, 0.4)',
              drawBorder: false,
            },
            ticks: {
              color: '#64748b',
              font: { size: 11 },
              maxRotation: 0,
              autoSkipPadding: 20,
            }
          },
          y: {
            grid: {
              color: 'rgba(51, 65, 85, 0.4)',
              drawBorder: false,
            },
            ticks: {
              color: '#64748b',
              font: { size: 11 },
              callback: (value) => {
                if (assetType === 'fx') return value.toFixed(4);
                if (assetType === 'metal') return '$' + value.toFixed(2);
                if (assetType === 'bond') return value.toFixed(2) + '%';
                if (assetType === 'index') return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                return value.toFixed(2);
              },
            },
            position: 'right',
          }
        }
      }
    });
  },

  calculateMA(data, period) {
    const result = new Array(data.length).fill(null);
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result[i] = sum / period;
    }
    return result;
  },

  toggleMA(show) {
    this.showMA = show;
    // 重新渲染需要外部调用
  },

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
};
