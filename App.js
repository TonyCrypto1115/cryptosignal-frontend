import { useState, useEffect, useRef, useCallback } from "react";

// ── 前30大幣種 ────────────────────────────────────────────
const TOP30 = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT",
  "DOGEUSDT","ADAUSDT","AVAXUSDT","SHIBUSDT","TRXUSDT",
  "DOTUSDT","LINKUSDT","MATICUSDT","LTCUSDT","UNIUSDT",
  "ATOMUSDT","XLMUSDT","ETCUSDT","APTUSDT","FILUSDT",
  "INJUSDT","ARBUSDT","OPUSDT","SUIUSDT","NEARUSDT",
  "RUNEUSDT","FTMUSDT","SANDUSDT","MANAUSDT","AXSUSDT",
];

const NAMES = {
  BTCUSDT:"Bitcoin",ETHUSDT:"Ethereum",BNBUSDT:"BNB",SOLUSDT:"Solana",
  XRPUSDT:"XRP",DOGEUSDT:"Dogecoin",ADAUSDT:"Cardano",AVAXUSDT:"Avalanche",
  SHIBUSDT:"Shiba Inu",TRXUSDT:"TRON",DOTUSDT:"Polkadot",LINKUSDT:"Chainlink",
  MATICUSDT:"Polygon",LTCUSDT:"Litecoin",UNIUSDT:"Uniswap",ATOMUSDT:"Cosmos",
  XLMUSDT:"Stellar",ETCUSDT:"Ethereum Classic",APTUSDT:"Aptos",FILUSDT:"Filecoin",
  INJUSDT:"Injective",ARBUSDT:"Arbitrum",OPUSDT:"Optimism",SUIUSDT:"Sui",
  NEARUSDT:"NEAR",RUNEUSDT:"THORChain",FTMUSDT:"Fantom",SANDUSDT:"The Sandbox",
  MANAUSDT:"Decentraland",AXSUSDT:"Axie Infinity",
};

// ── 指標計算 ──────────────────────────────────────────────
const calcMA = (arr, n) => {
  if (arr.length < n) return null;
  const s = arr.slice(-n);
  return s.reduce((a, b) => a + b, 0) / n;
};

const calcRSI = (closes, period = 14) => {
  if (closes.length < period + 1) return null;
  const s = closes.slice(-(period + 1));
  let g = 0, l = 0;
  for (let i = 1; i < s.length; i++) {
    const d = s[i] - s[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  const ag = g / period, al = l / period;
  if (al === 0) return 100;
  return parseFloat((100 - 100 / (1 + ag / al)).toFixed(1));
};

const calcVolRatio = (vols) => {
  if (vols.length < 6) return 1;
  const avg5 = vols.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
  return avg5 === 0 ? 1 : parseFloat((vols[vols.length - 1] / avg5).toFixed(2));
};

const buildSignal = ({ ma13, ma34, ma200, rsi, price, volRatio }) => {
  if (!ma13 || !ma34 || !rsi) return { signal: "WAIT", canEnter: false, reasons: [], score: 0 };
  let score = 0;
  const reasons = [];

  if (ma13 > ma34) { score += 25; reasons.push("MA13 > MA34 短線多頭排列 ✅"); }
  else             { score -= 20; reasons.push("MA13 < MA34 短線空頭排列 ❌"); }

  if (ma200 && price > ma200) { score += 20; reasons.push("價格站上 MA200 長線強勢 ✅"); }
  else if (ma200)             { score -= 15; reasons.push("價格跌破 MA200 長線偏空 ❌"); }

  if (rsi < 35)        { score += 30; reasons.push(`RSI ${rsi} 進入超賣區，反彈機率高 ✅`); }
  else if (rsi > 72)   { score -= 30; reasons.push(`RSI ${rsi} 超買區，注意回調風險 ⚠️`); }
  else if (rsi >= 50)  { score += 10; reasons.push(`RSI ${rsi} 健康多頭區間`); }
  else                 { score -= 5;  reasons.push(`RSI ${rsi} 偏弱整理中`); }

  if (volRatio > 1.5)  { score += 15; reasons.push(`量能放大 ${volRatio}x，有資金流入 ✅`); }
  else if (volRatio < 0.7) { score -= 10; reasons.push(`量能萎縮 ${volRatio}x，動能不足 ⚠️`); }
  else                 { reasons.push(`量能正常 ${volRatio}x`); }

  let signal = "HOLD", canEnter = false;
  if (score >= 55)     { signal = "BUY";  canEnter = true; }
  else if (score >= 30){ signal = "WATCH"; }
  else if (score <= -20){ signal = "SELL"; }

  return { signal, canEnter, reasons, score };
};

// ── Binance REST API 取日線K線 ────────────────────────────
const fetchKlines = async (symbol, limit = 210) => {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    const closes = data.map(k => parseFloat(k[4]));
    const volumes = data.map(k => parseFloat(k[5]));
    const high = parseFloat(data[data.length - 1][2]);
    const low  = parseFloat(data[data.length - 1][3]);
    return { closes, volumes, high, low };
  } catch {
    return null;
  }
};

// ── Binance REST 即時價格 ─────────────────────────────────
const fetchTickers = async () => {
  try {
    const symbols = JSON.stringify(TOP30);
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const map = {};
    data.forEach(t => {
      map[t.symbol] = {
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
      };
    });
    return map;
  } catch {
    return {};
  }
};

// ── UI helpers ───────────────────────────────────────────
const fmt = (n) => {
  if (n === null || n === undefined) return "—";
  if (n < 0.001) return n.toFixed(7);
  if (n < 1) return n.toFixed(4);
  if (n < 100) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const SIG = {
  BUY:   { bg:"#00ff8818", border:"#00ff88", color:"#00ff88", label:"▲ 買入" },
  SELL:  { bg:"#ff446618", border:"#ff4466", color:"#ff4466", label:"▼ 賣出" },
  WATCH: { bg:"#ffcc0018", border:"#ffcc00", color:"#ffcc00", label:"◎ 觀望" },
  HOLD:  { bg:"transparent", border:"#333", color:"#555", label:"— 持有" },
  WAIT:  { bg:"transparent", border:"#222", color:"#444", label:"… 等待" },
};

function Pill({ signal }) {
  const s = SIG[signal] || SIG.WAIT;
  return (
    <span style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700,
      whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function Sparkline({ closes, change }) {
  if (!closes || closes.length < 2) return <div style={{ width: 80, height: 32 }} />;
  const W = 80, H = 32;
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = max - min || 1;
  const pts = closes.slice(-30).map((c, i, arr) =>
    `${(i / (arr.length - 1)) * W},${H - ((c - min) / range) * (H - 4) - 2}`
  ).join(" ");
  const color = change >= 0 ? "#00ff88" : "#ff4466";
  return (
    <svg width={W} height={H}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

function RSIBar({ value }) {
  const color = value < 35 ? "#00ff88" : value > 70 ? "#ff4466" : "#ffcc00";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: "#1a1a2e", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ color, fontSize: 11, fontWeight: 700, width: 32 }}>{value}</span>
    </div>
  );
}

// ── CoinRow ───────────────────────────────────────────────
function CoinRow({ coin, selected, onClick }) {
  const up = coin.change24h >= 0;
  return (
    <div onClick={onClick} style={{
      display: "grid", gridTemplateColumns: "52px 80px 100px 72px 60px",
      alignItems: "center", gap: 6, padding: "9px 12px",
      background: selected ? "rgba(0,255,136,0.05)" : "transparent",
      borderLeft: `2px solid ${selected ? "#00ff88" : "transparent"}`,
      borderBottom: "1px solid #0c0c1a", cursor: "pointer", transition: "background 0.1s",
    }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 12, color: "#ddd",
          fontFamily: "'Courier New', monospace" }}>
          {coin.symbol.replace("USDT", "")}
        </div>
        <div style={{ fontSize: 9, color: "#333", marginTop: 1 }}>USDT</div>
      </div>
      <Sparkline closes={coin.closes} change={coin.change24h} />
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#ccc",
          fontFamily: "'Courier New', monospace" }}>
          ${fmt(coin.price)}
        </div>
        <div style={{ fontSize: 10, color: up ? "#00ff88" : "#ff4466" }}>
          {up ? "+" : ""}{coin.change24h?.toFixed(2)}%
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <Pill signal={coin.signal} />
      </div>
      <div style={{ textAlign: "right" }}>
        {coin.canEnter && (
          <div style={{ fontSize: 9, color: "#00ff88", background: "#00ff8818",
            border: "1px solid #00ff8840", borderRadius: 20,
            padding: "1px 6px", marginBottom: 2, textAlign: "center" }}>
            進場
          </div>
        )}
        <div style={{ fontSize: 10, color: "#444" }}>
          {coin.rsi ? `RSI ${coin.rsi}` : "…"}
        </div>
      </div>
    </div>
  );
}

// ── DetailView ────────────────────────────────────────────
function DetailView({ coin }) {
  if (!coin) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      height: "100%", color: "#2a2a3a", fontSize: 13 }}>
      ← 點擊左側幣種查看詳情
    </div>
  );

  const up = coin.change24h >= 0;
  const s = SIG[coin.signal] || SIG.WAIT;

  const maRows = [
    { period: 13, ma: coin.ma13 },
    { period: 34, ma: coin.ma34 },
    { period: 200, ma: coin.ma200 },
  ];

  return (
    <div style={{ padding: 20, overflowY: "auto", height: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff",
            fontFamily: "'Courier New', monospace", letterSpacing: -1 }}>
            {coin.symbol.replace("USDT", "")}
            <span style={{ color: "#2a2a3a", fontSize: 14 }}>/USDT</span>
          </div>
          <div style={{ color: "#444", fontSize: 12, marginBottom: 8 }}>
            {NAMES[coin.symbol] || ""}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Pill signal={coin.signal} />
            {coin.canEnter && (
              <span style={{ fontSize: 11, color: "#00ff88", fontWeight: 700 }}>
                ✦ 可進場
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#fff",
            fontFamily: "'Courier New', monospace" }}>
            ${fmt(coin.price)}
          </div>
          <div style={{ fontSize: 14, color: up ? "#00ff88" : "#ff4466", fontWeight: 600 }}>
            {up ? "+" : ""}{coin.change24h?.toFixed(2)}% 24h
          </div>
          {coin.high && (
            <div style={{ fontSize: 11, color: "#333", marginTop: 4 }}>
              H: ${fmt(coin.high)} / L: ${fmt(coin.low)}
            </div>
          )}
        </div>
      </div>

      {/* Score */}
      <div style={{ background: "#0d0d1a", borderRadius: 12,
        border: `1px solid ${s.border}22`, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#555" }}>綜合評分</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>
            {coin.score} 分
          </span>
        </div>
        <div style={{ height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            width: `${Math.max(0, Math.min(100, (coin.score + 40) / 1.4))}%`,
            height: "100%", borderRadius: 3, background: s.color, transition: "width 1s"
          }} />
        </div>
        <div style={{ fontSize: 11, color: coin.canEnter ? "#00ff88" : "#444",
          marginTop: 8, fontWeight: coin.canEnter ? 700 : 400 }}>
          {coin.canEnter ? "✅ 達到進場條件" : "⏳ 尚未達到進場條件"}
        </div>
      </div>

      {/* MA Table */}
      <div style={{ background: "#0d0d1a", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#444", marginBottom: 10 }}>均線（日線）</div>
        {maRows.map(({ period, ma }) => {
          if (!ma) return (
            <div key={period} style={{ display: "flex", justifyContent: "space-between",
              padding: "5px 0", borderBottom: "1px solid #12121e" }}>
              <span style={{ fontSize: 12, color: "#333" }}>MA{period}</span>
              <span style={{ fontSize: 11, color: "#333" }}>資料不足</span>
            </div>
          );
          const above = coin.price >= ma;
          return (
            <div key={period} style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", padding: "6px 0", borderBottom: "1px solid #12121e" }}>
              <span style={{ fontSize: 12, color: "#555", fontFamily: "monospace" }}>
                MA{period}
              </span>
              <span style={{ fontSize: 12, color: "#666", fontFamily: "monospace" }}>
                ${fmt(ma)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700,
                color: above ? "#00ff88" : "#ff4466" }}>
                {above ? "↑ 站上" : "↓ 跌破"}
              </span>
            </div>
          );
        })}
        {coin.ma13 && coin.ma34 && (
          <div style={{ fontSize: 11, color: coin.ma13 > coin.ma34 ? "#00ff88" : "#ff4466",
            marginTop: 8, fontWeight: 600 }}>
            {coin.ma13 > coin.ma34
              ? "✅ MA13 穿越 MA34 向上，多頭排列"
              : "❌ MA13 跌破 MA34，空頭排列"}
          </div>
        )}
      </div>

      {/* RSI + Volume */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div style={{ background: "#0d0d1a", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "#444", marginBottom: 6 }}>RSI (14)</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace",
            color: !coin.rsi ? "#333" : coin.rsi < 35 ? "#00ff88" : coin.rsi > 70 ? "#ff4466" : "#ffcc00" }}>
            {coin.rsi || "—"}
          </div>
          <div style={{ fontSize: 10, color: "#444", marginTop: 3 }}>
            {!coin.rsi ? "計算中" : coin.rsi < 35 ? "超賣區" : coin.rsi > 70 ? "超買區" : "中性區"}
          </div>
          {coin.rsi && <div style={{ marginTop: 8 }}><RSIBar value={coin.rsi} /></div>}
        </div>
        <div style={{ background: "#0d0d1a", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "#444", marginBottom: 6 }}>量能比（vs 5日均）</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace",
            color: coin.volRatio > 1.5 ? "#00ff88" : coin.volRatio < 0.7 ? "#ff4466" : "#aaa" }}>
            {coin.volRatio ? `${coin.volRatio}x` : "—"}
          </div>
          <div style={{ fontSize: 10, color: "#444", marginTop: 3 }}>
            {coin.volRatio > 1.5 ? "量能放大" : coin.volRatio < 0.7 ? "量能萎縮" : "量能平穩"}
          </div>
        </div>
      </div>

      {/* Reasons */}
      {coin.reasons?.length > 0 && (
        <div style={{ background: "#0d0d1a", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#444", marginBottom: 10 }}>信號分析依據</div>
          {coin.reasons.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "#333", fontSize: 11, marginTop: 1 }}>▸</span>
              <span style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>{r}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: "#2a2a3a", textAlign: "center", paddingBottom: 16 }}>
        ⚠️ 以上為技術面參考，不構成投資建議。加密貨幣具高度風險，請謹慎評估。
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────
export default function App() {
  const [coins, setCoins]         = useState({});
  const [klines, setKlines]       = useState({});
  const [selected, setSelected]   = useState("BTCUSDT");
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [lastUpdate, setLastUpdate] = useState("載入中…");
  const [progress, setProgress]   = useState(0);
  const wsRef = useRef(null);

  // 1) 初始化：抓日線K線（需要MA200，所以要210筆）
  useEffect(() => {
    let loaded = 0;
    const fetchAll = async () => {
      const results = {};
      // 分批抓，避免同時發出30個請求
      for (let i = 0; i < TOP30.length; i++) {
        const sym = TOP30[i];
        const data = await fetchKlines(sym, 210);
        if (data) results[sym] = data;
        loaded++;
        setProgress(Math.round((loaded / TOP30.length) * 100));
        // 每抓5個暫停100ms，避免超過API限制
        if (loaded % 5 === 0) await new Promise(r => setTimeout(r, 150));
      }
      setKlines(results);
    };
    fetchAll();
  }, []);

  // 2) 定期更新即時價格（每30秒）
  useEffect(() => {
    const update = async () => {
      const tickers = await fetchTickers();
      setCoins(tickers);
      setLastUpdate(new Date().toLocaleTimeString("zh-TW"));
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  // 3) 組合所有資料
  const coinList = TOP30.map(symbol => {
    const ticker  = coins[symbol] || {};
    const kline   = klines[symbol] || {};
    const closes  = kline.closes || [];
    const volumes = kline.volumes || [];
    const price   = ticker.price || (closes.length ? closes[closes.length - 1] : 0);

    const ma13     = calcMA(closes, 13);
    const ma34     = calcMA(closes, 34);
    const ma200    = calcMA(closes, 200);
    const rsi      = calcRSI(closes, 14);
    const volRatio = calcVolRatio(volumes);

    const { signal, canEnter, reasons, score } = buildSignal({
      ma13, ma34, ma200, rsi, price, volRatio,
    });

    return {
      symbol, price,
      change24h: ticker.change24h || 0,
      closes, ma13, ma34, ma200, rsi, volRatio,
      signal, canEnter, reasons, score,
      high: kline.high, low: kline.low,
    };
  });

  const buyCoins   = coinList.filter(c => c.signal === "BUY");
  const sellCoins  = coinList.filter(c => c.signal === "SELL");
  const watchCoins = coinList.filter(c => c.signal === "WATCH");

  const displayed = coinList
    .filter(c => filter === "ALL" || c.signal === filter)
    .filter(c => !search || c.symbol.toLowerCase().includes(search.toLowerCase()));

  const selectedCoin = coinList.find(c => c.symbol === selected);
  const isLoading = progress < 100;

  return (
    <div style={{ minHeight: "100vh", background: "#060610", color: "#fff",
      fontFamily: "-apple-system, 'SF Pro Text', sans-serif",
      display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: "#07070f", borderBottom: "1px solid #0d0d1a",
        padding: "11px 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 900, fontFamily: "monospace" }}>
            <span style={{ color: "#00ff88" }}>₿</span> CryptoSignal
            <span style={{ marginLeft: 6, fontSize: 10, color: "#333",
              background: "#0d0d1a", padding: "2px 6px", borderRadius: 20,
              border: "1px solid #1a1a2e" }}>PRO</span>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {[["ALL","全部",coinList.length],["BUY","買入",buyCoins.length],
              ["WATCH","觀望",watchCoins.length],["SELL","賣出",sellCoins.length]
            ].map(([key, label, count]) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                background: filter === key ? (key==="BUY"?"#00ff8820":key==="SELL"?"#ff446620":"#ffffff10") : "transparent",
                border: `1px solid ${filter===key?(key==="BUY"?"#00ff88":key==="SELL"?"#ff4466":"#444"):"#1a1a2e"}`,
                color: filter===key?(key==="BUY"?"#00ff88":key==="SELL"?"#ff4466":"#bbb"):"#444",
                borderRadius: 20, padding: "3px 10px", fontSize: 10,
                cursor: "pointer", fontWeight: 600,
              }}>
                {label}{count > 0 ? ` (${count})` : ""}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input placeholder="搜尋…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: "#0d0d1a", border: "1px solid #1a1a2e", color: "#aaa",
              borderRadius: 8, padding: "4px 10px", fontSize: 11, width: 100, outline: "none" }} />
          <span style={{ fontSize: 10, color: "#2a2a3a" }}>更新 {lastUpdate}</span>
          {isLoading && (
            <span style={{ fontSize: 10, color: "#00ff88" }}>
              載入 K線 {progress}%
            </span>
          )}
        </div>
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div style={{ height: 2, background: "#0d0d1a" }}>
          <div style={{ width: `${progress}%`, height: "100%",
            background: "#00ff88", transition: "width 0.3s" }} />
        </div>
      )}

      {/* Signal banner */}
      {buyCoins.length > 0 && (
        <div style={{ background: "linear-gradient(90deg,#00ff8815,transparent)",
          borderBottom: "1px solid #00ff8820", padding: "7px 16px",
          fontSize: 12, color: "#00ff88", fontWeight: 600 }}>
          ✦ 買入信號：{buyCoins.map(c => c.symbol.replace("USDT","")).join(" · ")}
        </div>
      )}

      {/* Main */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left list */}
        <div style={{ width: 380, flexShrink: 0, overflowY: "auto",
          borderRight: "1px solid #0d0d1a" }}>
          <div style={{ display: "grid",
            gridTemplateColumns: "52px 80px 100px 72px 60px",
            gap: 6, padding: "6px 12px",
            fontSize: 9, color: "#2a2a3a", letterSpacing: 0.5,
            borderBottom: "1px solid #0d0d1a",
            position: "sticky", top: 0, background: "#060610" }}>
            <span>幣種</span><span>走勢</span>
            <span style={{ textAlign:"right" }}>價格</span>
            <span style={{ textAlign:"center" }}>信號</span>
            <span style={{ textAlign:"right" }}>狀態</span>
          </div>
          {displayed.map(coin => (
            <CoinRow key={coin.symbol} coin={coin}
              selected={selected === coin.symbol}
              onClick={() => setSelected(coin.symbol)} />
          ))}
        </div>

        {/* Right detail */}
        <div style={{ flex: 1, overflow: "hidden", background: "#070712" }}>
          <DetailView coin={selectedCoin} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: "#040408", borderTop: "1px solid #0d0d1a",
        padding: "6px 16px", fontSize: 9, color: "#1e1e2e", flexShrink: 0 }}>
        資料來源：Binance API · 指標：MA13/34/200 日線 + RSI(14) + 量能比 · 每30秒更新價格
      </div>
    </div>
  );
}
