const fs = require('fs');
let content = fs.readFileSync('worker.js', 'utf8');

const targetRegex = /document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{\s*initMap\(\);/;

const replacement = `document.addEventListener('DOMContentLoaded', () => {
          initMap();
          
          // 出勤状態の復元とトラッキング自動再開
          const clockInStr = localStorage.getItem('passionMapClockIn');
          if (clockInStr) {
              try {
                  const state = JSON.parse(clockInStr);
                  if (state.active) {
                      const btn = document.getElementById('btnTracking');
                      if(btn) {
                          btn.style.backgroundColor = '#4CAF50';
                          btn.style.color = 'white';
                      }
                      // マーカー表示（mapはinitMap()で作成済み）
                      if (window.plotClockInMarker) {
                          window.plotClockInMarker(state);
                      }
                      
                      // 移動トラッキング再開
                      if (navigator.geolocation && trackingWatchId === null) {
                          trackingWatchId = navigator.geolocation.watchPosition((p) => {
                              const now = Date.now();
                              if (now - lastTrackingTime < 10000) return;
                              lastTrackingTime = now;
                              if (currentUser) {
                                  callGAS('saveTrackingData', { 
                                      userName: currentUser, 
                                      lat: p.coords.latitude, 
                                      lng: p.coords.longitude, 
                                      type: '移動' 
                                  }).catch(e=>console.warn(e));
                              }
                          }, (err) => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
                      }
                  }
              } catch(e) { console.warn("Clock-in restore error", e); }
          }`;

if (targetRegex.test(content)) {
    content = content.replace(targetRegex, replacement);
    fs.writeFileSync('worker.js', content, 'utf8');
    console.log("Replaced successfully.");
} else {
    console.log("Could not match the regex.");
}
