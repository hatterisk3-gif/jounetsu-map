/**
 * 市況情報モジュール
 * 農水省「青果物 日別卸売価格グラフ」への導線のみ。
 */
(function () {
  'use strict';

  const MAFF_DAILY_GRAPH = 'https://www.maff.go.jp/j/tokei/syohi/oroshi_kakaku/seika.html';

  function openUrl(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function bindChrome() {
    const closeBtn = document.getElementById('marketModalClose');
    if (closeBtn) closeBtn.onclick = () => MarketInfo.close();

    const openBtn = document.getElementById('marketOpenMaffGraph');
    if (openBtn) openBtn.onclick = () => openUrl(MAFF_DAILY_GRAPH);

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
    }
  };

  window.MarketInfo = MarketInfo;
})();
