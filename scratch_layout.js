const fs = require('fs');
let html = fs.readFileSync('schedule.html', 'utf8');

const cssAddition = `
      /* スマホで見切れないように横スクロール対応 */
      @media screen and (max-width: 768px) {
        .control-panel { flex-wrap: wrap; gap: 8px; padding: 10px 5px; }
        .control-panel-buttons { width: 100%; overflow-x: auto; padding-bottom: 6px; -webkit-overflow-scrolling: touch; }
        .control-panel-buttons::-webkit-scrollbar { height: 4px; }
        .control-panel-buttons::-webkit-scrollbar-thumb { background: #888; border-radius: 2px; }
      }
      .control-panel-buttons > * { flex-shrink: 0; } /* 全画面共通でボタンが潰れないように */
`;

html = html.replace('</style>', cssAddition + '    </style>');
html = html.replace('<div style="display:flex; align-items:center;">', '<div class="control-panel-buttons" style="display:flex; align-items:center;">');

fs.writeFileSync('schedule.html', html);
console.log("Updated schedule.html layout.");
