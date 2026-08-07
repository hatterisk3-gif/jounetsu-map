/**
 * 市況情報モジュール
 * 東京都・大阪府（大阪市／府）中央卸売市場の市況への導線。
 */
(function () {
  'use strict';

  const MAFF_DAILY_GRAPH = 'https://www.maff.go.jp/j/tokei/syohi/oroshi_kakaku/seika.html';
  const TOKYO_SHIJOU_URL = 'https://www.shijou-tokei.metro.tokyo.lg.jp/';
  const OSAKA_CITY_SHIJOU_URL = 'https://www.shijou.city.osaka.jp/sikyomap/sikyo';
  const OSAKA_PREF_SHIJOU_URL = 'https://osakafu-ichiba.jp/statistics/';

  function openUrl(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function bindChrome() {
    const closeBtn = document.getElementById('marketModalClose');
    if (closeBtn) closeBtn.onclick = () => MarketInfo.close();

    const openTokyoBtn = document.getElementById('marketOpenTokyo');
    if (openTokyoBtn) openTokyoBtn.onclick = () => openUrl(TOKYO_SHIJOU_URL);

    const openOsakaBtn = document.getElementById('marketOpenOsaka');
    if (openOsakaBtn) openOsakaBtn.onclick = () => openUrl(OSAKA_CITY_SHIJOU_URL);

    const openOsakaPrefBtn = document.getElementById('marketOpenOsakaPref');
    if (openOsakaPrefBtn) openOsakaPrefBtn.onclick = () => openUrl(OSAKA_PREF_SHIJOU_URL);

    const openMaffBtn = document.getElementById('marketOpenMaffGraph');
    if (openMaffBtn) openMaffBtn.onclick = () => openUrl(MAFF_DAILY_GRAPH);

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

    openItem() {
      openUrl(MAFF_DAILY_GRAPH);
    }
  };

  window.MarketInfo = MarketInfo;
})();
