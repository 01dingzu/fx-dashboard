/**
 * factors-data.js — 货币影响因素知识库
 * 每种货币的核心影响因素，用于生成变动原因分析
 */

const CURRENCY_INFO = {
  USD: {
    name: '美元',
    flag: '🇺🇸',
    centralBank: '美联储 (Federal Reserve)',
    rateTool: '联邦基金利率',
    currentRate: '5.25%-5.50%',
    factors: [
      { text: '美联储利率政策与前瞻性指引', impact: 'high' },
      { text: '美国核心经济数据（非农就业、CPI通胀、GDP增长）', impact: 'high' },
      { text: '美元指数 (DXY) 整体走势', impact: 'high' },
      { text: '全球避险情绪——危机时资金涌入美元避险', impact: 'medium' },
      { text: '美国国债收益率变动（尤其10年期）', impact: 'medium' },
      { text: '美国财政政策与政府债务规模', impact: 'low' }
    ],
    newsKeywords: '美元 美联储 汇率',
    newsSearch: '美元 美联储 利率'
  },
  CNY: {
    name: '人民币',
    flag: '🇨🇳',
    centralBank: '中国人民银行 (PBOC)',
    rateTool: '中间价 / LPR',
    currentRate: '1年期LPR 3.45%',
    factors: [
      { text: '央行中间价指引与市场干预力度', impact: 'high' },
      { text: '中美利差（中国-美国国债收益率差）', impact: 'high' },
      { text: '中国贸易顺差与外汇储备规模', impact: 'high' },
      { text: '资本流动方向（北向资金、外资持仓）', impact: 'medium' },
      { text: '中国经济基本面（PMI、社融、消费数据）', impact: 'medium' },
      { text: '中美关系与地缘政治因素', impact: 'medium' }
    ],
    newsKeywords: '人民币 汇率 央行',
    newsSearch: '人民币 汇率 中间价'
  },
  EUR: {
    name: '欧元',
    flag: '🇪🇺',
    centralBank: '欧洲央行 (ECB)',
    rateTool: '主要再融资利率',
    currentRate: '4.25%',
    factors: [
      { text: '欧洲央行利率政策与经济预测', impact: 'high' },
      { text: '欧元区通胀数据（HICP）与经济增长', impact: 'high' },
      { text: '欧元区主权债务与财政状况', impact: 'medium' },
      { text: '地缘政治风险（俄乌冲突等）', impact: 'medium' },
      { text: '欧元区成员国经济分化（德法 vs 南欧）', impact: 'low' }
    ],
    newsKeywords: '欧元 欧洲央行 汇率',
    newsSearch: '欧元 欧洲央行 利率'
  },
  JPY: {
    name: '日元',
    flag: '🇯🇵',
    centralBank: '日本银行 (BOJ)',
    rateTool: '政策利率',
    currentRate: '0%-0.1%',
    factors: [
      { text: '日本央行货币政策（负利率/YCC框架）', impact: 'high' },
      { text: '美日利差——日元套息交易的核心驱动', impact: 'high' },
      { text: '全球避险情绪——日元作为传统避险货币', impact: 'high' },
      { text: '日本通胀与工资增长数据', impact: 'medium' },
      { text: '日本贸易收支与能源进口成本', impact: 'medium' }
    ],
    newsKeywords: '日元 日本央行 汇率',
    newsSearch: '日元 日本央行 干预'
  },
  GBP: {
    name: '英镑',
    flag: '🇬🇧',
    centralBank: '英格兰银行 (BOE)',
    rateTool: '基准利率',
    currentRate: '5.00%',
    factors: [
      { text: '英格兰银行利率政策与通胀预期', impact: 'high' },
      { text: '英国经济数据（GDP、就业、CPI）', impact: 'high' },
      { text: '英国财政政策与政府预算', impact: 'medium' },
      { text: '脱欧后续影响与贸易关系', impact: 'low' }
    ],
    newsKeywords: '英镑 英国央行 汇率',
    newsSearch: '英镑 英国央行 利率'
  },
  HKD: {
    name: '港币',
    flag: '🇭🇰',
    centralBank: '香港金管局 (HKMA)',
    rateTool: '联系汇率制度',
    currentRate: '7.75-7.85 区间',
    factors: [
      { text: '联系汇率制度——盯住美元7.75-7.85区间', impact: 'high' },
      { text: '金管局市场干预（强/弱方兑换保证）', impact: 'high' },
      { text: '港股资金流动与IPO活动', impact: 'medium' },
      { text: '港美利差与套息交易', impact: 'medium' }
    ],
    newsKeywords: '港币 联系汇率 金管局',
    newsSearch: '港币 金管局 联系汇率'
  },
  AUD: {
    name: '澳元',
    flag: '🇦🇺',
    centralBank: '澳洲联储 (RBA)',
    rateTool: '现金利率',
    currentRate: '4.35%',
    factors: [
      { text: '澳洲联储利率政策', impact: 'high' },
      { text: '大宗商品价格（铁矿石、煤炭）', impact: 'high' },
      { text: '中国需求——澳大利亚最大贸易伙伴', impact: 'high' },
      { text: '澳洲经济数据（就业、通胀、零售）', impact: 'medium' }
    ],
    newsKeywords: '澳元 澳洲联储 汇率',
    newsSearch: '澳元 澳洲联储 利率'
  },
  CAD: {
    name: '加元',
    flag: '🇨🇦',
    centralBank: '加拿大央行 (BOC)',
    rateTool: '隔夜利率',
    currentRate: '4.50%',
    factors: [
      { text: '加拿大央行利率政策', impact: 'high' },
      { text: '原油价格——加拿大主要出口商品', impact: 'high' },
      { text: '美国经济表现（加拿大最大贸易伙伴）', impact: 'medium' },
      { text: '加拿大经济数据（就业、GDP、CPI）', impact: 'medium' }
    ],
    newsKeywords: '加元 加拿大央行 汇率',
    newsSearch: '加元 加拿大央行 利率'
  },
  CHF: {
    name: '瑞郎',
    flag: '🇨🇭',
    centralBank: '瑞士国家银行 (SNB)',
    rateTool: '政策利率',
    currentRate: '1.25%',
    factors: [
      { text: '瑞士国家银行货币政策与外汇干预', impact: 'high' },
      { text: '全球避险情绪——瑞郎作为终极避险货币', impact: 'high' },
      { text: '欧元区经济与政治稳定性', impact: 'medium' },
      { text: '瑞士通胀数据', impact: 'medium' }
    ],
    newsKeywords: '瑞郎 瑞士央行 汇率',
    newsSearch: '瑞郎 瑞士央行 干预'
  },
  SGD: {
    name: '新加坡元',
    flag: '🇸🇬',
    centralBank: '新加坡金管局 (MAS)',
    rateTool: '汇率政策（NEER区间）',
    currentRate: 'NEER斜率维持',
    factors: [
      { text: '金管局汇率政策（以汇率为主要工具）', impact: 'high' },
      { text: '新加坡贸易与经济数据', impact: 'medium' },
      { text: '区域经济表现（东南亚、中国）', impact: 'medium' }
    ],
    newsKeywords: '新加坡元 金管局 汇率',
    newsSearch: '新加坡元 金管局 货币政策'
  },
  KRW: {
    name: '韩元',
    flag: '🇰🇷',
    centralBank: '韩国银行 (BOK)',
    rateTool: '基准利率',
    currentRate: '3.50%',
    factors: [
      { text: '韩国银行利率政策', impact: 'high' },
      { text: '半导体出口与贸易收支', impact: 'high' },
      { text: '朝鲜半岛地缘政治风险', impact: 'medium' },
      { text: '韩国经济数据（出口、CPI、GDP）', impact: 'medium' }
    ],
    newsKeywords: '韩元 韩国银行 汇率',
    newsSearch: '韩元 韩国央行 利率'
  },
  INR: {
    name: '印度卢比',
    flag: '🇮🇳',
    centralBank: '印度储备银行 (RBI)',
    rateTool: '回购利率',
    currentRate: '6.50%',
    factors: [
      { text: '印度储备银行利率政策与外汇干预', impact: 'high' },
      { text: '原油价格——印度主要进口商品', impact: 'high' },
      { text: '印度贸易逆差与经常账户', impact: 'medium' },
      { text: '外资直接投资(FDI)与证券投资流入', impact: 'medium' }
    ],
    newsKeywords: '印度卢比 印度央行 汇率',
    newsSearch: '印度卢比 印度储备银行 汇率'
  },
  RUB: {
    name: '俄罗斯卢布',
    flag: '🇷🇺',
    centralBank: '俄罗斯央行 (CBR)',
    rateTool: '关键利率',
    currentRate: '16.00%',
    factors: [
      { text: '制裁与贸易结算方式变化', impact: 'high' },
      { text: '能源出口收入（石油、天然气）', impact: 'high' },
      { text: '俄罗斯央行外汇干预与资本管制', impact: 'high' },
      { text: '地缘政治局势', impact: 'medium' }
    ],
    newsKeywords: '卢布 俄罗斯 汇率',
    newsSearch: '卢布 俄罗斯 制裁'
  },
  NZD: {
    name: '新西兰元',
    flag: '🇳🇿',
    centralBank: '新西兰储备银行 (RBNZ)',
    rateTool: '官方现金利率 (OCR)',
    currentRate: '5.25%',
    factors: [
      { text: '新西兰储备银行利率政策', impact: 'high' },
      { text: '乳制品价格——新西兰主要出口商品', impact: 'high' },
      { text: '中国经济需求（新西兰最大贸易伙伴之一）', impact: 'medium' },
      { text: '新西兰经济数据（GDP、就业、通胀）', impact: 'medium' }
    ],
    newsKeywords: '新西兰元 储备银行 汇率',
    newsSearch: '新西兰元 新西兰央行 利率'
  },
  THB: {
    name: '泰铢',
    flag: '🇹🇭',
    centralBank: '泰国银行 (BOT)',
    rateTool: '政策利率',
    currentRate: '2.50%',
    factors: [
      { text: '泰国银行利率政策', impact: 'high' },
      { text: '旅游业收入与外国游客流入', impact: 'high' },
      { text: '出口表现（电子、农产品）', impact: 'medium' },
      { text: '政治稳定性与军事局势', impact: 'medium' }
    ],
    newsKeywords: '泰铢 泰国央行 汇率',
    newsSearch: '泰铢 泰国 汇率'
  },
  MYR: {
    name: '林吉特',
    flag: '🇲🇾',
    centralBank: '马来西亚国家银行 (BNM)',
    rateTool: '隔夜政策利率 (OPR)',
    currentRate: '3.00%',
    factors: [
      { text: '马来西亚国行利率政策', impact: 'high' },
      { text: '原油与棕榈油价格（主要出口商品）', impact: 'high' },
      { text: '国际贸易收支与外资流入', impact: 'medium' },
      { text: '马来西亚经济数据（GDP、通胀）', impact: 'medium' }
    ],
    newsKeywords: '林吉特 马来西亚 汇率',
    newsSearch: '林吉特 马来西亚 汇率'
  },
  ZAR: {
    name: '南非兰特',
    flag: '🇿🇦',
    centralBank: '南非储备银行 (SARB)',
    rateTool: '回购利率',
    currentRate: '8.25%',
    factors: [
      { text: '南非储备银行利率政策', impact: 'high' },
      { text: '黄金与铂金价格（主要矿产出口）', impact: 'high' },
      { text: '电力危机与基础设施问题', impact: 'medium' },
      { text: '政治稳定性与腐败问题', impact: 'medium' }
    ],
    newsKeywords: '兰特 南非 汇率',
    newsSearch: '兰特 南非 汇率'
  },
  MOP: {
    name: '澳门元',
    flag: '🇲🇴',
    centralBank: '澳门金融管理局 (AMCM)',
    rateTool: '联系汇率制度',
    currentRate: '盯住港元',
    factors: [
      { text: '联系汇率制度——盯住港币', impact: 'high' },
      { text: '博彩业收入与旅游经济', impact: 'high' },
      { text: '澳门金管局外汇干预', impact: 'medium' }
    ],
    newsKeywords: '澳门元 汇率',
    newsSearch: '澳门元 澳门 汇率'
  },
  TRY: {
    name: '土耳其里拉',
    flag: '🇹🇷',
    centralBank: '土耳其央行 (CBRT)',
    rateTool: '政策利率',
    currentRate: '50.00%',
    factors: [
      { text: '土耳其央行利率政策与通胀失控', impact: 'high' },
      { text: '政治干预央行独立性', impact: 'high' },
      { text: '外汇储备消耗与资本外流', impact: 'medium' },
      { text: '地缘政治与贸易关系', impact: 'medium' }
    ],
    newsKeywords: '里拉 土耳其 汇率',
    newsSearch: '里拉 土耳其 通胀'
  },
  MXN: {
    name: '墨西哥比索',
    flag: '🇲🇽',
    centralBank: '墨西哥银行 (Banxico)',
    rateTool: '隔夜利率',
    currentRate: '11.00%',
    factors: [
      { text: '墨西哥银行利率政策', impact: 'high' },
      { text: '美国经济表现与贸易关系（USMCA）', impact: 'high' },
      { text: '侨汇收入与石油出口', impact: 'medium' },
      { text: '墨西哥经济数据（GDP、通胀、就业）', impact: 'medium' }
    ],
    newsKeywords: '比索 墨西哥 汇率',
    newsSearch: '比索 墨西哥 汇率'
  },
};

// 默认未覆盖的货币
const DEFAULT_INFO = {
  name: '',
  flag: '🏳️',
  centralBank: '',
  rateTool: '',
  currentRate: '',
  factors: [
    { text: '该国央行货币政策与利率调整', impact: 'high' },
    { text: '国内经济基本面（GDP、通胀、就业）', impact: 'high' },
    { text: '国际贸易收支与资本流动', impact: 'medium' },
    { text: '地缘政治与外部风险事件', impact: 'medium' }
  ],
  newsKeywords: '',
  newsSearch: ''
};

// 常用货币对快速选择
const QUICK_PAIRS = [
  { base: 'USD', target: 'CNY', label: '美元/人民币' },
  { base: 'EUR', target: 'CNY', label: '欧元/人民币' },
  { base: 'GBP', target: 'CNY', label: '英镑/人民币' },
  { base: 'HKD', target: 'CNY', label: '港币/人民币' },
  { base: 'JPY', target: 'CNY', label: '日元/人民币' },
  { base: 'AUD', target: 'CNY', label: '澳元/人民币' },
  { base: 'KRW', target: 'CNY', label: '韩元/人民币' },
  { base: 'SGD', target: 'CNY', label: '新加坡元/人民币' },
  { base: 'THB', target: 'CNY', label: '泰铢/人民币' },
  { base: 'RUB', target: 'CNY', label: '卢布/人民币' },
  { base: 'USD', target: 'JPY', label: '美元/日元' },
  { base: 'USD', target: 'HKD', label: '美元/港币' },
  { base: 'EUR', target: 'USD', label: '欧元/美元' },
  { base: 'AUD', target: 'USD', label: '澳元/美元' },
  { base: 'USD', target: 'CAD', label: '美元/加元' },
  { base: 'USD', target: 'CHF', label: '美元/瑞郎' },
  { base: 'USD', target: 'KRW', label: '美元/韩元' }
];

function getCurrencyInfo(code) {
  return CURRENCY_INFO[code] || {
    ...DEFAULT_INFO,
    name: code,
    newsKeywords: code,
    newsSearch: code + ' 汇率'
  };
}
