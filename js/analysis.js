/**
 * analysis.js — 多标的变动分析
 * 量化统计 + 因素分析 + 资讯链接
 * 支持: 汇率 / 贵金属 / 国债收益率 / 股市指数
 */

// 贵金属因素知识库
const METAL_INFO = {
  XAU: {
    name: '黄金',
    factors: [
      { text: '美联储利率政策与实际利率走势——黄金不生息，实际利率是核心定价锚', impact: 'high' },
      { text: '美元指数 (DXY) 强弱——黄金以美元计价，美元走强通常压制金价', impact: 'high' },
      { text: '全球避险情绪——地缘冲突、金融危机时资金涌入黄金避险', impact: 'high' },
      { text: '全球央行购金需求——近年央行持续增持黄金储备', impact: 'medium' },
      { text: '通胀预期——黄金被视为抗通胀资产', impact: 'medium' },
      { text: '黄金ETF持仓变动（SPDR GLD等）——反映机构投资者情绪', impact: 'medium' },
      { text: '印度和中国实物消费需求（婚庆、节日季）', impact: 'low' },
    ],
    newsSearch: '黄金价格 gold price',
  },
  XAG: {
    name: '白银',
    factors: [
      { text: '黄金价格走势——白银与黄金高度正相关，但波动更大', impact: 'high' },
      { text: '金银比 (Gold/Silver Ratio) 变动——比值偏离均值时白银可能独立行情', impact: 'high' },
      { text: '工业需求——白银广泛用于光伏、电子、医疗，工业属性强于黄金', impact: 'high' },
      { text: '全球经济增长——工业需求与经济周期正相关', impact: 'medium' },
      { text: '美元指数与实际利率——与黄金逻辑类似', impact: 'medium' },
      { text: '白银ETF持仓变动（SLV等）', impact: 'low' },
    ],
    newsSearch: '白银价格 silver price',
  },
  XPT: {
    name: '铂金',
    factors: [
      { text: '汽车催化剂需求——铂金主要用于柴油车催化转化器', impact: 'high' },
      { text: '全球汽车产销数据，尤其欧洲柴油车市场份额', impact: 'high' },
      { text: '南非供应——全球约70%铂金产自南非，矿场扰动影响大', impact: 'medium' },
      { text: '首饰需求——铂金首饰在中国、日本有市场', impact: 'medium' },
      { text: '氢能源产业——铂金是氢燃料电池催化剂，长期需求增长点', impact: 'low' },
    ],
    newsSearch: '铂金价格 platinum price',
  },
  XPD: {
    name: '钯金',
    factors: [
      { text: '汽油车催化剂需求——钯金主要用于汽油车尾气催化', impact: 'high' },
      { text: '全球汽车产销数据，尤其中国和北美汽油车市场', impact: 'high' },
      { text: '俄罗斯供应——俄罗斯是全球主要钯金生产国，制裁影响大', impact: 'high' },
      { text: '电动汽车渗透率——EV不需要尾气催化剂，长期需求承压', impact: 'medium' },
      { text: 'ETF与投机持仓——钯金市场规模小，投机性波动大', impact: 'medium' },
    ],
    newsSearch: '钯金价格 palladium price',
  },
};

// 国债因素知识库
const BOND_INFO = {
  DGS10: {
    name: '美国10年期国债',
    maturity: '10年',
    factors: [
      { text: '美联储联邦基金利率——短端利率锚定长端利率下限', impact: 'high' },
      { text: '通胀预期——10年期国债收益率 = 实际利率 + 通胀预期，通胀升温推升收益率', impact: 'high' },
      { text: '美国经济数据——GDP、非农就业、零售销售强劲时收益率上行', impact: 'high' },
      { text: '美联储缩表 (QT)——减少国债购买，推升收益率', impact: 'medium' },
      { text: '美国财政赤字与国债供给——赤字扩大、国债发行量增加时收益率上行', impact: 'medium' },
      { text: '全球避险需求——危机时资金涌入美债，推低收益率', impact: 'medium' },
      { text: '期限溢价 (Term Premium)——投资者要求的长端额外补偿', impact: 'low' },
    ],
    newsSearch: '美国10年期国债收益率 10 year treasury yield',
  },
  DGS2: {
    name: '美国2年期国债',
    maturity: '2年',
    factors: [
      { text: '美联储联邦基金利率——2年期国债与政策利率高度同步', impact: 'high' },
      { text: '美联储议息会议前瞻指引——市场对未来利率路径的预期', impact: 'high' },
      { text: '通胀数据（CPI、PCE）——高通胀强化加息预期，推升收益率', impact: 'high' },
      { text: '就业数据——强劲就业市场支撑加息，推升短端收益率', impact: 'medium' },
      { text: '2年-10年利差 (2s10s)——利差倒挂是经典经济衰退信号', impact: 'medium' },
    ],
    newsSearch: '美国2年期国债收益率 2 year treasury yield',
  },
  DGS30: {
    name: '美国30年期国债',
    maturity: '30年',
    factors: [
      { text: '长期通胀预期——30年期国债对长期通胀最敏感', impact: 'high' },
      { text: '美国财政可持续性——长期国债供给压力', impact: 'high' },
      { text: '美联储资产负债表政策 (QT/QE)', impact: 'medium' },
      { text: '人口结构与长期经济增长预期', impact: 'medium' },
      { text: '全球长期资本需求——养老金、保险公司的久期配置需求', impact: 'medium' },
      { text: '10年-30年利差——反映市场对超长期风险的定价', impact: 'low' },
    ],
    newsSearch: '美国30年期国债收益率 30 year treasury yield',
  },
};

// 股市指数因素知识库
const INDEX_INFO = {
  GSPC: {
    name: '标普500',
    region: '美国',
    factors: [
      { text: '美联储货币政策——利率路径直接影响股市估值，加息周期压制估值，降息周期提振估值', impact: 'high' },
      { text: '美国经济数据——GDP增长、就业、消费数据强劲时股市上涨', impact: 'high' },
      { text: '企业盈利——标普500成分股季度财报，EPS增长是股价核心驱动', impact: 'high' },
      { text: '通胀数据——高通胀强化加息预期，压制股市；通胀回落则利好', impact: 'high' },
      { text: '科技七巨头 (Mag 7) 表现——苹果、微软、英伟达等权重股对指数影响巨大', impact: 'medium' },
      { text: '市场情绪与波动率 (VIX)——恐慌指数上升时股市通常下跌', impact: 'medium' },
      { text: '美元强弱——美元走强压制跨国公司海外收入，可能拖累指数', impact: 'low' },
    ],
    newsSearch: '标普500 S&P 500 股市',
  },
  IXIC: {
    name: '纳斯达克综合',
    region: '美国',
    factors: [
      { text: '美联储利率政策——科技股对利率更敏感，高利率压制成长股估值', impact: 'high' },
      { text: 'AI与科技产业趋势——人工智能、云计算、半导体周期是核心驱动力', impact: 'high' },
      { text: '科技巨头财报——英伟达、苹果、微软、谷歌、Meta等权重股业绩', impact: 'high' },
      { text: '美债收益率——10年期收益率上升时成长股估值承压', impact: 'high' },
      { text: '风险偏好——纳斯达克波动率高于标普500，风险偏好下降时跌幅更大', impact: 'medium' },
      { text: '半导体周期——全球芯片需求与库存周期', impact: 'medium' },
    ],
    newsSearch: '纳斯达克 Nasdaq 科技股',
  },
  DJI: {
    name: '道琼斯工业',
    region: '美国',
    factors: [
      { text: '美国经济周期——道琼斯以传统工业、金融、消费蓝筹为主，与经济周期高度相关', impact: 'high' },
      { text: '美联储利率政策——金融板块受益于高利率，但整体估值受压制', impact: 'high' },
      { text: '企业盈利——30只蓝筹股的季度财报', impact: 'high' },
      { text: '国际贸易与关税政策——成分股多为跨国公司，受贸易政策影响', impact: 'medium' },
      { text: '油价——能源板块（雪佛龙等）受油价影响', impact: 'medium' },
    ],
    newsSearch: '道琼斯 Dow Jones 蓝筹股',
  },
  RUT: {
    name: '罗素2000',
    region: '美国',
    factors: [
      { text: '美国经济基本面——小盘股更依赖国内经济，对经济周期敏感', impact: 'high' },
      { text: '美联储利率政策——小企业融资成本对利率更敏感', impact: 'high' },
      { text: '信贷市场——高收益债利差扩大时小盘股承压', impact: 'medium' },
      { text: '美元走势——美元走强不利于小企业出口竞争力', impact: 'medium' },
      { text: '市场风险偏好——小盘股波动大，风险偏好下降时跌幅通常大于大盘', impact: 'medium' },
    ],
    newsSearch: '罗素2000 Russell 2000 小盘股',
  },
  SSEC: {
    name: '上证综指',
    region: '中国',
    factors: [
      { text: '中国央行货币政策——LPR调整、降准降息直接提振股市', impact: 'high' },
      { text: '中国经济数据——GDP、PMI、社融、出口等宏观数据', impact: 'high' },
      { text: '政策面——国务院/证监会政策、产业政策、房地产调控', impact: 'high' },
      { text: '北向资金流动——外资通过沪深港通流入流出', impact: 'medium' },
      { text: '房地产市场——房地产是中国经济支柱，楼市低迷拖累股市', impact: 'medium' },
      { text: '人民币汇率——贬值压力下外资流出', impact: 'medium' },
      { text: '市场情绪与成交量——A股散户占比高，情绪波动大', impact: 'low' },
    ],
    newsSearch: '上证综指 A股 股市',
  },
  SZSE: {
    name: '深证成指',
    region: '中国',
    factors: [
      { text: '中国央行货币政策——LPR、降准降息', impact: 'high' },
      { text: '科技与新能源产业——深市以科技、新能源、医药为主，产业趋势影响大', impact: 'high' },
      { text: '中国经济数据——宏观数据与政策面', impact: 'high' },
      { text: '创业板/科创板表现——成长股估值与风险偏好', impact: 'medium' },
      { text: '北向资金与机构资金流向', impact: 'medium' },
    ],
    newsSearch: '深证成指 深市 A股',
  },
  CSI300: {
    name: '沪深300',
    region: '中国',
    factors: [
      { text: '中国央行货币政策——利率与流动性', impact: 'high' },
      { text: '中国经济基本面——GDP、PMI、社融数据', impact: 'high' },
      { text: '大盘蓝筹盈利——沪深300成分股为两市最大市值蓝筹', impact: 'high' },
      { text: '外资流动——北向资金是重要边际定价力量', impact: 'medium' },
      { text: '行业轮动——金融、消费、科技板块轮动影响指数', impact: 'medium' },
      { text: '政策面——资本市场改革、央企估值重塑', impact: 'medium' },
    ],
    newsSearch: '沪深300 CSI 300 蓝筹股',
  },
  HSI: {
    name: '恒生指数',
    region: '中国',
    factors: [
      { text: '中国内地经济——恒指权重股多为内地企业（腾讯、阿里、美团等），受内地经济影响大', impact: 'high' },
      { text: '美联储利率政策——港元挂钩美元，港美利差影响资金流动', impact: 'high' },
      { text: '中国政策面——互联网监管、房地产政策等', impact: 'high' },
      { text: '南向资金——内地资金通过港股通流入', impact: 'medium' },
      { text: '港美联系汇率——港元弱方兑换保证触发时金管局干预', impact: 'medium' },
      { text: '地缘政治——中美关系、国际资本对香港市场信心', impact: 'medium' },
    ],
    newsSearch: '恒生指数 港股 Hang Seng',
  },
  FTSE: {
    name: '富时100',
    region: '欧洲',
    factors: [
      { text: '英国央行利率政策——Bank of England利率决议', impact: 'high' },
      { text: '英国经济数据——GDP、通胀、就业', impact: 'high' },
      { text: '大宗商品价格——富时100中石油、矿业公司权重大（壳牌、BP、力拓等）', impact: 'high' },
      { text: '英镑汇率——英镑走强压制跨国公司盈利换算', impact: 'medium' },
      { text: '全球经济——英国大盘股多为跨国公司，全球需求影响大', impact: 'medium' },
    ],
    newsSearch: '富时100 FTSE 100 英国股市',
  },
  GDAXI: {
    name: '德国DAX',
    region: '欧洲',
    factors: [
      { text: '欧洲央行 (ECB) 货币政策——利率路径影响估值', impact: 'high' },
      { text: '德国经济数据——IFO商业景气指数、制造业PMI、出口数据', impact: 'high' },
      { text: '全球贸易——德国是出口大国，汽车、机械、化工出口依赖度高', impact: 'high' },
      { text: '能源价格——俄乌冲突后能源成本对德国工业影响大', impact: 'medium' },
      { text: '汽车产业——大众、宝马、奔驰等权重股', impact: 'medium' },
      { text: '欧元汇率——欧元走强压制出口商竞争力', impact: 'medium' },
    ],
    newsSearch: '德国DAX DAX 德国股市',
  },
  FCHI: {
    name: '法国CAC 40',
    region: '欧洲',
    factors: [
      { text: '欧洲央行 (ECB) 货币政策', impact: 'high' },
      { text: '法国与欧元区经济数据', impact: 'high' },
      { text: '奢侈品板块——LVMH、开云、爱马仕等权重股，受全球消费影响', impact: 'high' },
      { text: '能源与航空——道达尔、空客等权重股', impact: 'medium' },
      { text: '欧元汇率', impact: 'medium' },
    ],
    newsSearch: '法国CAC 40 CAC 法国股市',
  },
  N225: {
    name: '日经225',
    region: '亚太',
    factors: [
      { text: '日本央行货币政策——利率、YCC政策、日元干预', impact: 'high' },
      { text: '日元汇率——日元走强压制出口企业盈利（丰田、索尼等）', impact: 'high' },
      { text: '全球经济——日本出口依赖度高，中美欧经济影响大', impact: 'high' },
      { text: '企业治理改革——东京交易所推动PBR改革，提升股东回报', impact: 'medium' },
      { text: '半导体与科技周期——东京电子、SCREEN控股等', impact: 'medium' },
      { text: '外资流向——海外投资者是日股重要参与者', impact: 'medium' },
    ],
    newsSearch: '日经225 Nikkei 日本股市',
  },
  KS11: {
    name: '韩国KOSPI',
    region: '亚太',
    factors: [
      { text: '韩国央行货币政策', impact: 'high' },
      { text: '半导体周期——三星电子、SK海力士是核心权重股', impact: 'high' },
      { text: '全球经济与贸易——韩国是出口导向型经济', impact: 'high' },
      { text: '韩元汇率——走强压制出口企业', impact: 'medium' },
      { text: '地缘政治——朝鲜半岛局势', impact: 'medium' },
      { text: '中美科技竞争——韩国半导体企业处于产业链关键位置', impact: 'medium' },
    ],
    newsSearch: '韩国KOSPI 韩国股市',
  },
  VIX: {
    name: 'VIX波动率',
    region: '其他',
    factors: [
      { text: '市场恐慌情绪——VIX是市场恐慌指数，股市大跌时VIX飙升', impact: 'high' },
      { text: '标普500走势——VIX与标普500通常负相关', impact: 'high' },
      { text: '期权市场定价——VIX由标普500期权隐含波动率计算', impact: 'high' },
      { text: '宏观风险事件——地缘冲突、金融危机、疫情等突发事件', impact: 'medium' },
      { text: '美联储政策不确定性——政策转向期VIX通常上升', impact: 'medium' },
      { text: '期权到期与gamma对冲——月末/季末期权到期影响VIX', impact: 'low' },
    ],
    newsSearch: 'VIX 波动率 恐慌指数',
  },
};

const Analysis = {

  /**
   * 计算量化统计指标
   */
  computeStats(series) {
    if (!series || series.length < 2) return null;

    const getValue = (d) => d.value != null ? d.value : d.rate;
    const rates = series.map(d => getValue(d));
    const first = rates[0];
    const last = rates[rates.length - 1];
    const change = last - first;
    const changePercent = (change / first) * 100;

    const high = Math.max(...rates);
    const low = Math.min(...rates);
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;

    // 日变动率
    const dailyReturns = [];
    for (let i = 1; i < rates.length; i++) {
      dailyReturns.push((rates[i] - rates[i - 1]) / rates[i - 1]);
    }

    // 波动率（日收益率标准差，年化）
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / dailyReturns.length;
    const dailyVol = Math.sqrt(variance);
    const annualizedVol = dailyVol * Math.sqrt(252) * 100;

    // 最大单日涨幅/跌幅
    let maxDailyGain = 0;
    let maxDailyLoss = 0;
    let maxGainDate = '';
    let maxLossDate = '';
    for (let i = 1; i < series.length; i++) {
      const v1 = getValue(series[i - 1]);
      const v2 = getValue(series[i]);
      const ret = (v2 - v1) / v1 * 100;
      if (ret > maxDailyGain) {
        maxDailyGain = ret;
        maxGainDate = series[i].date;
      }
      if (ret < maxDailyLoss) {
        maxDailyLoss = ret;
        maxLossDate = series[i].date;
      }
    }

    // 趋势斜率（线性回归）
    const n = rates.length;
    const xs = rates.map((_, i) => i);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = rates.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * rates[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const slopePercent = (slope / avg) * 100;

    let trend = '震荡';
    if (slopePercent > 0.02) trend = '上升';
    else if (slopePercent < -0.02) trend = '下降';

    const amplitude = ((high - low) / low) * 100;

    return {
      first, last, change, changePercent,
      high, low, avg,
      dailyVol, annualizedVol,
      maxDailyGain, maxDailyLoss, maxGainDate, maxLossDate,
      slope, slopePercent, trend,
      amplitude,
      dataPoints: n,
      startDate: series[0].date,
      endDate: series[series.length - 1].date
    };
  },

  /**
   * 根据资产类型格式化数值
   */
  formatStatValue(asset, value, decimals) {
    if (value == null) return '--';
    if (asset.type === 'index') {
      return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    const d = decimals != null ? decimals : (asset.type === 'fx' ? 4 : 2);
    return value.toFixed(d);
  },

  /**
   * 渲染量化统计
   */
  renderStats(stats, asset) {
    const grid = document.getElementById('stats-grid');
    if (!stats) {
      grid.innerHTML = '<p style="color:var(--text-secondary);grid-column:1/-1;">数据不足</p>';
      return;
    }

    const isUp = stats.changePercent >= 0;
    const changeClass = isUp ? 'up' : 'down';
    const changeSign = isUp ? '+' : '';
    const trendIcon = stats.trend === '上升' ? '📈' : stats.trend === '下降' ? '📉' : '➡️';

    // 根据资产类型定制显示
    let highSub, lowSub, avgSub;
    if (asset.type === 'fx') {
      const baseCode = asset.params.base;
      const targetCode = asset.params.target;
      highSub = `1 ${baseCode} = ${this.formatStatValue(asset, stats.high)} ${targetCode}`;
      lowSub = `1 ${baseCode} = ${this.formatStatValue(asset, stats.low)} ${targetCode}`;
      avgSub = `${stats.dataPoints} 个交易日数据`;
    } else if (asset.type === 'metal') {
      highSub = `$${stats.high.toFixed(2)}/oz`;
      lowSub = `$${stats.low.toFixed(2)}/oz`;
      avgSub = `${stats.dataPoints} 个交易日数据`;
    } else if (asset.type === 'bond') {
      highSub = `${stats.high.toFixed(2)}%`;
      lowSub = `${stats.low.toFixed(2)}%`;
      avgSub = `${stats.dataPoints} 个交易日数据`;
    } else if (asset.type === 'index') {
      highSub = `${stats.high.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pts`;
      lowSub = `${stats.low.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pts`;
      avgSub = `${stats.dataPoints} 个交易日数据`;
    } else {
      highSub = `${stats.dataPoints} 个交易日数据`;
      lowSub = '';
      avgSub = '';
    }

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">区间涨跌幅</div>
        <div class="stat-value ${changeClass}">${changeSign}${stats.changePercent.toFixed(2)}%</div>
        <div class="stat-sub">${stats.startDate} ~ ${stats.endDate}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">趋势</div>
        <div class="stat-value">${trendIcon} ${stats.trend}</div>
        <div class="stat-sub">日均斜率 ${stats.slopePercent.toFixed(4)}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">最高</div>
        <div class="stat-value">${this.formatStatValue(asset, stats.high)}</div>
        <div class="stat-sub">${highSub}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">最低</div>
        <div class="stat-value">${this.formatStatValue(asset, stats.low)}</div>
        <div class="stat-sub">${lowSub}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">区间均值</div>
        <div class="stat-value">${this.formatStatValue(asset, stats.avg)}</div>
        <div class="stat-sub">${avgSub}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">区间振幅</div>
        <div class="stat-value">${stats.amplitude.toFixed(2)}%</div>
        <div class="stat-sub">(最高 - 最低) / 最低</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">年化波动率</div>
        <div class="stat-value">${stats.annualizedVol.toFixed(2)}%</div>
        <div class="stat-sub">日波动率 ${(stats.dailyVol * 100).toFixed(3)}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">最大日涨幅</div>
        <div class="stat-value up">+${stats.maxDailyGain.toFixed(2)}%</div>
        <div class="stat-sub">${stats.maxGainDate || '-'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">最大日跌幅</div>
        <div class="stat-value down">${stats.maxDailyLoss.toFixed(2)}%</div>
        <div class="stat-sub">${stats.maxLossDate || '-'}</div>
      </div>
    `;
  },

  /**
   * 渲染变动因素分析
   */
  renderFactors(stats, asset) {
    const container = document.getElementById('factors-content');

    if (!stats) {
      container.innerHTML = '<p style="color:var(--text-secondary);">数据不足，无法分析</p>';
      return;
    }

    const isUp = stats.changePercent >= 0;
    const absChange = Math.abs(stats.changePercent);

    // 变动幅度分类
    let magnitude, magnitudeDesc;
    if (absChange < 1) {
      magnitude = '小幅';
      magnitudeDesc = '变动幅度较小，主要受短期资金流动和技术面因素影响';
    } else if (absChange < 3) {
      magnitude = '中等';
      magnitudeDesc = '变动幅度中等，可能反映了经济数据或政策预期的变化';
    } else if (absChange < 5) {
      magnitude = '较大';
      magnitudeDesc = '变动幅度较大，通常与重大政策变化或突发事件有关';
    } else {
      magnitude = '显著';
      magnitudeDesc = '变动幅度显著，可能涉及央行政策转向、地缘政治事件等重大因素';
    }

    // 方向描述
    let direction, assetLabel;
    if (asset.type === 'fx') {
      direction = isUp ? '升值' : '贬值';
      assetLabel = asset.name;
    } else if (asset.type === 'metal') {
      direction = isUp ? '上涨' : '下跌';
      assetLabel = asset.name;
    } else if (asset.type === 'bond') {
      direction = isUp ? '上行' : '下行';
      assetLabel = asset.name + '收益率';
    } else if (asset.type === 'index') {
      direction = isUp ? '上涨' : '下跌';
      assetLabel = asset.name;
    } else {
      direction = isUp ? '上升' : '下降';
      assetLabel = asset.name;
    }

    // 生成摘要
    const summary = `
      在 ${stats.startDate} 至 ${stats.endDate} 期间，
      ${assetLabel} ${direction} ${absChange.toFixed(2)}%，
      属于<span style="color:var(--accent);font-weight:600">${magnitude}</span>波动。
      ${magnitudeDesc}。
      趋势呈<span style="color:${isUp ? 'var(--up)' : 'var(--down)'};font-weight:600">${stats.trend}</span>态势，
      年化波动率 ${stats.annualizedVol.toFixed(2)}%，
      区间振幅 ${stats.amplitude.toFixed(2)}%。
    `;

    // 获取因素列表
    let allFactors = [];
    if (asset.type === 'fx') {
      const baseInfo = getCurrencyInfo(asset.params.base);
      const targetInfo = getCurrencyInfo(asset.params.target);
      allFactors = [
        ...baseInfo.factors.map(f => ({ ...f, source: baseInfo.name })),
        ...targetInfo.factors
          .filter(f => !baseInfo.factors.some(bf => bf.text === f.text))
          .map(f => ({ ...f, source: targetInfo.name }))
      ];
    } else if (asset.type === 'metal') {
      const info = METAL_INFO[asset.params.symbol];
      allFactors = info ? info.factors : [];
    } else if (asset.type === 'bond') {
      const info = BOND_INFO[asset.params.seriesId];
      allFactors = info ? info.factors : [];
    } else if (asset.type === 'index') {
      const info = INDEX_INFO[asset.params.indexCode?.toUpperCase()];
      allFactors = info ? info.factors : [];
    }

    // 按影响程度排序
    const order = { high: 0, medium: 1, low: 2 };
    allFactors.sort((a, b) => order[a.impact] - order[b.impact]);

    // 因素分组
    const factorGroups = this.groupFactors(allFactors);

    container.innerHTML = `
      <div class="factor-summary">
        <div class="factor-summary-title">变动概述</div>
        <div class="factor-summary-text">${summary}</div>
      </div>
      ${factorGroups.map(g => `
        <div class="factor-group">
          <div class="factor-group-header">
            <div class="factor-group-icon" style="background:${g.color}22;color:${g.color}">${g.icon}</div>
            <div class="factor-group-title">${g.title}</div>
          </div>
          <ul class="factor-group-items">
            ${g.items.map(f => `
              <li>
                ${f.text}
                <span class="factor-impact ${f.impact}">${f.impact === 'high' ? '高影响' : f.impact === 'medium' ? '中影响' : '低影响'}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('')}
    `;
  },

  /**
   * 将因素分组（通用，不依赖具体资产类型）
   */
  groupFactors(allFactors) {
    // 利率因素
    const rateFactors = allFactors.filter(f =>
      f.text.includes('利率') || f.text.includes('利差') || f.text.includes('LPR') ||
      f.text.includes('政策') || f.text.includes('YCC') || f.text.includes('美联储') ||
      f.text.includes('联邦基金') || f.text.includes('加息') || f.text.includes('缩表') ||
      f.text.includes('QT') || f.text.includes('QE') || f.text.includes('实际利率')
    );

    // 经济数据因素
    const econFactors = allFactors.filter(f =>
      f.text.includes('经济') || f.text.includes('数据') || f.text.includes('GDP') ||
      f.text.includes('CPI') || f.text.includes('通胀') || f.text.includes('PMI') ||
      f.text.includes('就业') || f.text.includes('贸易') || f.text.includes('出口') ||
      f.text.includes('零售') || f.text.includes('非农') || f.text.includes('财政') ||
      f.text.includes('人口')
    );

    // 市场情绪与资金流动因素
    const sentimentFactors = allFactors.filter(f =>
      f.text.includes('避险') || f.text.includes('情绪') || f.text.includes('资金') ||
      f.text.includes('资本') || f.text.includes('套息') || f.text.includes('持仓') ||
      f.text.includes('ETF') || f.text.includes('投机') || f.text.includes('配置') ||
      f.text.includes('期限溢价') || f.text.includes('Term Premium') ||
      f.text.includes('风险偏好') || f.text.includes('波动率') || f.text.includes('VIX') ||
      f.text.includes('恐慌') || f.text.includes('期权') || f.text.includes('gamma') ||
      f.text.includes('北向资金') || f.text.includes('南向资金') || f.text.includes('外资') ||
      f.text.includes('成交量') || f.text.includes('散户')
    );

    // 供需与产业因素
    const supplyFactors = allFactors.filter(f =>
      f.text.includes('供应') || f.text.includes('需求') || f.text.includes('工业') ||
      f.text.includes('消费') || f.text.includes('首饰') || f.text.includes('汽车') ||
      f.text.includes('光伏') || f.text.includes('氢') || f.text.includes('电动') ||
      f.text.includes('矿产') || f.text.includes('南非') || f.text.includes('俄罗斯') ||
      f.text.includes('央行购金') || f.text.includes('供给') ||
      f.text.includes('半导体') || f.text.includes('科技') || f.text.includes('芯片') ||
      f.text.includes('能源') || f.text.includes('矿业') || f.text.includes('奢侈品') ||
      f.text.includes('AI') || f.text.includes('人工智能') || f.text.includes('云计算') ||
      f.text.includes('互联网') || f.text.includes('房地产') || f.text.includes('楼市') ||
      f.text.includes('蓝筹') || f.text.includes('财报') || f.text.includes('盈利') ||
      f.text.includes('企业') || f.text.includes('产业') || f.text.includes('治理')
    );

    // 政治/制度因素
    const politicalFactors = allFactors.filter(f =>
      f.text.includes('地缘') || f.text.includes('政治') || f.text.includes('制裁') ||
      f.text.includes('脱欧') || f.text.includes('关系') || f.text.includes('干预') ||
      f.text.includes('管制')
    );

    // 其他
    const otherFactors = allFactors.filter(f =>
      !rateFactors.includes(f) && !econFactors.includes(f) &&
      !sentimentFactors.includes(f) && !politicalFactors.includes(f) &&
      !supplyFactors.includes(f)
    );

    const groups = [];

    if (rateFactors.length > 0) {
      groups.push({ title: '利率与货币政策', icon: '🏦', color: '#3b82f6', items: rateFactors });
    }
    if (econFactors.length > 0) {
      groups.push({ title: '经济基本面', icon: '📊', color: '#22c55e', items: econFactors });
    }
    if (sentimentFactors.length > 0) {
      groups.push({ title: '市场情绪与资金流动', icon: '🌊', color: '#f59e0b', items: sentimentFactors });
    }
    if (supplyFactors.length > 0) {
      groups.push({ title: '供需与产业因素', icon: '🏭', color: '#8b5cf6', items: supplyFactors });
    }
    if (politicalFactors.length > 0) {
      groups.push({ title: '政治与制度因素', icon: '⚖️', color: '#ef4444', items: politicalFactors });
    }
    if (otherFactors.length > 0) {
      groups.push({ title: '其他因素', icon: '📌', color: '#64748b', items: otherFactors });
    }

    return groups;
  },

  /**
   * 渲染资讯链接
   */
  renderNews(asset) {
    const container = document.getElementById('news-content');

    let links = [];

    if (asset.type === 'fx') {
      const baseCode = asset.params.base;
      const targetCode = asset.params.target;
      const baseInfo = getCurrencyInfo(baseCode);
      const targetInfo = getCurrencyInfo(targetCode);
      const pairLabel = `${baseCode}/${targetCode}`;
      const searchQuery = encodeURIComponent(`${baseCode} ${targetCode} 汇率`);
      const baseSearch = encodeURIComponent(baseInfo.newsSearch || baseCode);
      const targetSearch = encodeURIComponent(targetInfo.newsSearch || targetCode);

      links = [
        { icon: '🔍', title: `Google 搜索: ${pairLabel} 汇率`, desc: '搜索最新的汇率分析与报道', url: `https://www.google.com/search?q=${searchQuery}+汇率+分析` },
        { icon: '📰', title: 'Google News 资讯', desc: `${baseInfo.name}相关新闻`, url: `https://news.google.com/search?q=${baseSearch}&hl=zh-CN&gl=CN` },
        { icon: '📰', title: 'Google News 资讯', desc: `${targetInfo.name}相关新闻`, url: `https://news.google.com/search?q=${targetSearch}&hl=zh-CN&gl=CN` },
        { icon: '🏦', title: baseInfo.centralBank || `${baseCode}央行`, desc: `${baseInfo.name}央行官网 — 货币政策与利率决议`, url: this.getCentralBankURL(baseCode) },
        { icon: '🏦', title: targetInfo.centralBank || `${targetCode}央行`, desc: `${targetInfo.name}央行官网 — 货币政策与利率决议`, url: this.getCentralBankURL(targetCode) },
        { icon: '📅', title: '财经日历', desc: '查看近期重要经济数据发布时间', url: 'https://www.investing.com/economic-calendar/' },
        { icon: '📈', title: 'TradingView 图表', desc: `${pairLabel} 专业技术分析图表`, url: `https://www.tradingview.com/symbols/${baseCode}${targetCode}/` },
        { icon: '💰', title: '中国外汇交易中心', desc: '人民币中间价与即期汇率', url: 'http://www.chinamoney.com.cn/chinese/bkccpr/' },
      ].filter(l => l.url);

    } else if (asset.type === 'metal') {
      const symbol = asset.params.symbol;
      const info = METAL_INFO[symbol];
      const name = info ? info.name : asset.name;
      const searchQuery = encodeURIComponent(info ? info.newsSearch : `${name} price`);
      const tvSymbol = symbol === 'XAU' ? 'TVC:GOLD' : symbol === 'XAG' ? 'TVC:SILVER' : symbol === 'XPT' ? 'TVC:PLATINUM' : 'TVC:PALLADIUM';

      links = [
        { icon: '🔍', title: `Google 搜索: ${name}价格`, desc: '搜索最新的价格分析与报道', url: `https://www.google.com/search?q=${searchQuery}+分析` },
        { icon: '📰', title: 'Google News 资讯', desc: `${name}相关新闻`, url: `https://news.google.com/search?q=${searchQuery}&hl=zh-CN&gl=CN` },
        { icon: '💰', title: 'Kitco 贵金属', desc: `${name}实时行情与新闻报道`, url: 'https://www.kitco.com/' },
        { icon: '🏆', title: '世界黄金协会', desc: '黄金市场分析与需求报告', url: 'https://www.gold.org/' },
        { icon: '🏦', title: '美联储货币政策', desc: '美联储利率决议 — 影响贵金属定价', url: 'https://www.federalreserve.gov/monetarypolicy.htm' },
        { icon: '📈', title: 'TradingView 图表', desc: `${name}专业技术分析图表`, url: `https://www.tradingview.com/symbols/${tvSymbol}/` },
        { icon: '📅', title: '财经日历', desc: '查看近期重要经济数据发布时间', url: 'https://www.investing.com/economic-calendar/' },
      ];

    } else if (asset.type === 'bond') {
      const seriesId = asset.params.seriesId;
      const info = BOND_INFO[seriesId];
      const name = info ? info.name : asset.name;
      const searchQuery = encodeURIComponent(info ? info.newsSearch : `${name} yield`);
      const fredUrl = `https://fred.stlouisfed.org/series/${seriesId}`;

      links = [
        { icon: '🔍', title: `Google 搜索: ${name}`, desc: '搜索最新的收益率分析', url: `https://www.google.com/search?q=${searchQuery}+分析` },
        { icon: '📰', title: 'Google News 资讯', desc: `${name}相关新闻`, url: `https://news.google.com/search?q=${searchQuery}&hl=zh-CN&gl=CN` },
        { icon: '📊', title: 'FRED 数据', desc: `圣路易斯联储 ${seriesId} 历史数据`, url: fredUrl },
        { icon: '🏛️', title: 'U.S. Treasury', desc: '美国财政部 — 国债发行与收益率数据', url: 'https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics' },
        { icon: '🏦', title: '美联储货币政策', desc: '美联储利率决议 — 影响国债收益率', url: 'https://www.federalreserve.gov/monetarypolicy.htm' },
        { icon: '📈', title: 'TradingView 债券', desc: `${name}技术分析图表`, url: `https://www.tradingview.com/symbols/${seriesId}/` },
        { icon: '📅', title: '财经日历', desc: '查看近期重要经济数据发布时间', url: 'https://www.investing.com/economic-calendar/' },
      ];

    } else if (asset.type === 'index') {
      const indexCode = asset.params.indexCode;
      const info = INDEX_INFO[indexCode?.toUpperCase()];
      const name = info ? info.name : asset.name;
      const region = info ? info.region : '';
      const searchQuery = encodeURIComponent(info ? info.newsSearch : `${name} index`);

      // TradingView 符号映射
      const tvSymbols = {
        GSPC: 'SP:SPX', IXIC: 'NASDAQ:IXIC', DJI: 'DJ:DJI', RUT: 'RUSSELL:RUT',
        SSEC: 'SSE:000001', SZSE: 'SZSE:399001', CSI300: 'SSE:000300', HSI: 'HSI:HSI',
        FTSE: 'TVC:UKX', GDAXI: 'TVC:DAX', FCHI: 'TVC:CAC',
        N225: 'TVC:NI225', KS11: 'TVC:KS11', VIX: 'TVC:VIX',
      };
      const tvSymbol = tvSymbols[indexCode?.toUpperCase()] || '';

      // 根据地区定制资讯链接
      const regionLinks = [];
      if (region === '美国') {
        regionLinks.push({ icon: '🏦', title: '美联储货币政策', desc: '美联储利率决议 — 影响美国股市', url: 'https://www.federalreserve.gov/monetarypolicy.htm' });
      } else if (region === '中国') {
        regionLinks.push({ icon: '🏦', title: '中国人民银行', desc: '央行货币政策与LPR利率', url: 'http://www.pbc.gov.cn/zhengcehuobisi/125207/index.html' });
        regionLinks.push({ icon: '💰', title: '中国外汇交易中心', desc: '人民币汇率与资金流动', url: 'http://www.chinamoney.com.cn/chinese/bkccpr/' });
      } else if (region === '欧洲') {
        regionLinks.push({ icon: '🏦', title: '欧洲央行 (ECB)', desc: 'ECB货币政策 — 影响欧洲股市', url: 'https://www.ecb.europa.eu/press/html/index.en.html' });
      } else if (region === '亚太') {
        regionLinks.push({ icon: '🏦', title: '日本央行 (BOJ)', desc: 'BOJ货币政策 — 影响日股', url: 'https://www.boj.or.jp/en/mopo/index.htm' });
      }

      links = [
        { icon: '🔍', title: `Google 搜索: ${name}`, desc: '搜索最新的指数分析', url: `https://www.google.com/search?q=${searchQuery}+分析` },
        { icon: '📰', title: 'Google News 资讯', desc: `${name}相关新闻`, url: `https://news.google.com/search?q=${searchQuery}&hl=zh-CN&gl=CN` },
        ...regionLinks,
        { icon: '📈', title: 'TradingView 图表', desc: `${name}专业技术分析图表`, url: tvSymbol ? `https://www.tradingview.com/symbols/${tvSymbol}/` : '' },
        { icon: '📅', title: '财经日历', desc: '查看近期重要经济数据发布时间', url: 'https://www.investing.com/economic-calendar/' },
      ].filter(l => l.url);
    }

    container.innerHTML = links.map(l => `
      <a href="${l.url}" target="_blank" rel="noopener" class="news-card">
        <div class="news-card-icon">${l.icon}</div>
        <div class="news-card-info">
          <div class="news-card-title">${l.title}</div>
          <div class="news-card-desc">${l.desc}</div>
        </div>
        <div class="news-card-arrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="7" y1="17" x2="17" y2="7"/>
            <polyline points="7 7 17 7 17 17"/>
          </svg>
        </div>
      </a>
    `).join('');
  },

  getCentralBankURL(code) {
    const urls = {
      USD: 'https://www.federalreserve.gov/monetarypolicy.htm',
      CNY: 'http://www.pbc.gov.cn/zhengcehuobisi/125207/index.html',
      EUR: 'https://www.ecb.europa.eu/press/html/index.en.html',
      JPY: 'https://www.boj.or.jp/en/mopo/index.htm',
      GBP: 'https://www.bankofengland.co.uk/monetary-policy',
      HKD: 'https://www.hkma.gov.hk/eng/key-functions/money/linked-exchange-rate-system.shtml',
      AUD: 'https://www.rba.gov.au/monetary-policy/',
      CAD: 'https://www.bankofcanada.ca/core-functions/monetary-policy/',
      CHF: 'https://www.snb.ch/en/monetary-policy',
      SGD: 'https://www.mas.gov.sg/monetary-policy',
      KRW: 'https://www.bok.or.kr/eng/main/main.do',
      INR: 'https://www.rbi.org.in/',
      RUB: 'https://www.cbr.ru/eng/'
    };
    return urls[code] || '';
  }
};
