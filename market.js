/**
 * 市況情報モジュール
 * 農水省「青果物 日別卸売価格グラフ」および品目別（チンゲンサイ等）市況への導線。
 */
(function () {
  'use strict';

  const MAFF_DAILY_GRAPH = 'https://www.maff.go.jp/j/tokei/syohi/oroshi_kakaku/seika.html';
  const TOKYO_SHIJOU_URL = 'https://www.shijou-tokei.metro.tokyo.lg.jp/';
  const AGRINEWS_URL = 'https://www.agrinews.co.jp/market';

  function openUrl(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function bindChrome() {
    const closeBtn = document.getElementById('marketModalClose');
    if (closeBtn) closeBtn.onclick = () => MarketInfo.close();

    const openBtn = document.getElementById('marketOpenMaffGraph');
    if (openBtn) openBtn.onclick = () => openUrl(MAFF_DAILY_GRAPH);

    const openChingensaiBtn = document.getElementById('marketOpenChingensai');
    if (openChingensaiBtn) openChingensaiBtn.onclick = () => openUrl(MAFF_DAILY_GRAPH);

    const openTokyoBtn = document.getElementById('marketOpenTokyo');
    if (openTokyoBtn) openTokyoBtn.onclick = () => openUrl(TOKYO_SHIJOU_URL);

    const backdrop = document.getElementById('cropMarketModal');
    if (backdrop && !backdrop.dataset.marketBound) {
      backdrop.dataset.marketBound = '1';
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) MarketInfo.close();
      });
    }
  }

  const MarketInfo = {
    open() {
      const modal = document.getElementById('cropMarketModal');
      if (!modal) return;
      bindChrome();
      modal.style.display = 'flex';
    },

    close() {
      const modal = document.getElementById('cropMarketModal');
      if (modal) modal.style.display = 'none';
    },

    openItem(itemName) {
      // 特定品目の市況グラフを開く
      openUrl(MAFF_DAILY_GRAPH);
    }
  };

  window.MarketInfo = MarketInfo;
})();
