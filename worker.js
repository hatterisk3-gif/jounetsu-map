\n
// === トラッキング同期関連の共通変数 ===
window.window.trackingWatchId = null;
window.window.lastTrackingTime = 0;

// === トラッキングUI更新関数 ===
window.syncTrackingUI = function() {
    const clockInStr = localStorage.getItem('passionMapClockIn_disabled');
    const btn = document.getElementById('btnTracking');
    if (clockInStr) {
        try {
            const state = JSON.parse(clockInStr);
            if (state.active) {
                if (btn) {
                    btn.style.backgroundColor = '#4CAF50';
                    btn.style.color = 'white';
                    btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">出勤中</span>';
                }
                if (typeof window.plotClockInMarker === 'function') {
                    window.plotClockInMarker(state, false);
                }
                // トラッキング監視がまだなら開始
                if (navigator.geolocation && window.window.trackingWatchId === null) {
                    window.window.trackingWatchId = navigator.geolocation.watchPosition((p) => {
                        const now = Date.now();
                        if (now - window.window.lastTrackingTime < 10000) return;
                        window.window.lastTrackingTime = now;
                        if (typeof currentUser !== 'undefined' && currentUser) {
                            if (typeof callGAS === 'function') {
                                callGAS('saveTrackingData', {
                                    userName: currentUser,
                                    lat: p.coords.latitude,
                                    lng: p.coords.longitude,
                                    type: '移動'
                                }).catch(e => console.warn("移動送信エラー", e));
                            }
                        }
                    }, (err) => {}, { enableHighAccuracy: true });
                }
                return;
            }
        } catch(e) {}
    }

    // 非アクティブ・またはデータなしの場合
    if (btn) {
        btn.style.backgroundColor = 'white';
        btn.style.color = '#4CAF50';
        btn.innerHTML = '🏃‍♂️';
    }
    if (window.window.trackingWatchId !== null) {
        navigator.geolocation.clearWatch(window.window.trackingWatchId);
        window.window.trackingWatchId = null;
    }
    if (window.clockInMarker) {
        window.clockInMarker.setMap(null);
        window.clockInMarker = null;
    }
};

// === トラッキングボタンクリック時 ===
window.toggleTracking = () => {
    if (window.window.trackingWatchId !== null) {
        // 退勤処理
        localStorage.removeItem('passionMapClockIn');
        window.syncTrackingUI();
        if (typeof currentUser !== 'undefined' && currentUser) {
            navigator.geolocation.getCurrentPosition((p) => {
                if(typeof callGAS === 'function') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: p.coords.latitude,
                        lng: p.coords.longitude,
                        type: '退勤'
                    }).catch(e => console.warn("退勤送信エラー", e));
                }
            }, (err) => { console.warn("GPSエラー: 退勤時"); }, { enableHighAccuracy: true });
        }
    } else {
        // 出勤処理
        if (!navigator.geolocation) {
            if (typeof customAlert === 'function') customAlert("お使いの端末ではGPSがサポートされていません。");
            else alert("GPSがサポートされていません。");
            return;
        }
        
        const btn = document.getElementById('btnTracking');
        if (btn) {
            btn.style.backgroundColor = '#4CAF50';
            btn.style.color = 'white';
            btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">出勤中</span>';
        }

        navigator.geolocation.getCurrentPosition((p) => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            
            const clockInState = { lat: lat, lng: lng, time: timeStr, active: true };
            localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
            window.syncTrackingUI();

            if (typeof currentUser !== 'undefined' && currentUser) {
                if(typeof callGAS === 'function') {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: lat,
                        lng: lng,
                        type: '出勤'
                    }).catch(e => console.warn("出勤送信エラー", e));
                }
            }
        }, (err) => {
            if (typeof customAlert === 'function') customAlert("GPSエラー: 現在地が取得できません。位置情報を許可してください。");
            else alert("現在地が取得できません。");
            if (btn) {
                btn.style.backgroundColor = 'white';
                btn.style.color = '#4CAF50';
                btn.innerHTML = '🏃‍♂️';
            }
        }, { enableHighAccuracy: true });
    }
};

window.addEventListener('storage', (e) => {
    if (e.key === 'passionMapClockIn') {
        window.syncTrackingUI();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // wait slightly so UI finishes loading
    setTimeout(() => {
        if(typeof window.syncTrackingUI === 'function') {
            window.syncTrackingUI();
        }
    }, 500);
});
