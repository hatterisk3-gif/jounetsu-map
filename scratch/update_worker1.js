const fs = require('fs');

let content = fs.readFileSync('worker.js', 'utf8');

const regex = /window\.toggleTracking \= \(\) \=\> \{[\s\S]*?\}\s*\};\s*\/\/ 共通UI系/;

const replacement = `window.toggleTracking = () => {
    const btn = document.getElementById('btnTracking');
    if (trackingWatchId !== null) {
        // 退勤（トラッキング停止）
        navigator.geolocation.clearWatch(trackingWatchId);
        trackingWatchId = null;
        btn.style.backgroundColor = 'white';
        btn.style.color = '#4CAF50';
        
        // ローカルストレージをクリア
        localStorage.removeItem('passionMapClockIn');
        
        // 出勤マーカーを消去
        if (window.clockInMarker) {
            window.clockInMarker.setMap(null);
            window.clockInMarker = null;
        }

        // 退勤をGASへ送信
        if (currentUser) {
            navigator.geolocation.getCurrentPosition((p) => {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: p.coords.latitude,
                    lng: p.coords.longitude,
                    type: '退勤'
                }).catch(e => console.warn("退勤送信エラー", e));
            }, (err) => {
                callGAS('saveTrackingData', { userName: currentUser, lat: 0, lng: 0, type: '退勤' }).catch(e => console.warn("退勤送信エラー", e));
            });
        }
        
        customAlert("退勤しました。トラッキングを終了します。");
    } else {
        // 出勤（トラッキング開始）
        if (!navigator.geolocation) {
            customAlert("お使いの端末ではGPSがサポートされていません。");
            return;
        }
        btn.style.backgroundColor = '#4CAF50';
        btn.style.color = 'white';
        
        // 現在位置を取得して出勤処理
        navigator.geolocation.getCurrentPosition((p) => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            
            // ローカルストレージに保存
            const clockInState = { lat: lat, lng: lng, time: timeStr, active: true };
            localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
            
            // マーカーをプロット
            plotClockInMarker(clockInState);

            // 出勤をGASへ送信
            if (currentUser) {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: lat,
                    lng: lng,
                    type: '出勤'
                }).catch(e => console.warn("出勤送信エラー", e));
            }
            customAlert("出勤しました。1日中トラッキングが記録されます。");
        }, (err) => {
            customAlert("GPSエラー: 現在地が取得できません。位置情報を許可してください。");
            btn.style.backgroundColor = 'white';
            btn.style.color = '#4CAF50';
            return;
        }, { enableHighAccuracy: true });
        
        // 移動トラッキングを開始
        trackingWatchId = navigator.geolocation.watchPosition((p) => {
            const now = Date.now();
            // 10秒に1回程度の頻度に制限（GASの呼び出し過多を防ぐ）
            if (now - lastTrackingTime < 10000) return;
            lastTrackingTime = now;

            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            
            // GASへ送信
            if (currentUser) {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: lat,
                    lng: lng,
                    type: '移動'
                }).catch(e => console.warn("トラッキング送信エラー", e));
            }
        }, (err) => {
            console.warn("GPSエラー: ", err);
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    }
};

window.plotClockInMarker = (state) => {
    if (window.clockInMarker) window.clockInMarker.setMap(null);
    const pos = new google.maps.LatLng(state.lat, state.lng);
    window.clockInMarker = new google.maps.Marker({
        position: pos,
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#FF9800',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2
        },
        zIndex: 10000
    });
    
    const info = new google.maps.InfoWindow({
        content: \`<div style="padding:5px; font-weight:bold; color:#FF9800;">👨‍🌾 出勤時間: \${state.time}</div>\`
    });
    // 常に開いておくか、クリックで開くか（ここでは開いたままにする）
    info.open(map, window.clockInMarker);
    // クリック時にも開くようにする
    window.clockInMarker.addListener('click', () => {
        info.open(map, window.clockInMarker);
    });
};
// 共通UI系`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('worker.js', content, 'utf8');
    console.log("Replaced successfully.");
} else {
    console.log("Could not match the regex.");
}
