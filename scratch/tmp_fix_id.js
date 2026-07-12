const fs = require('fs');

const mapJsPath = 'c:/Users/hatte/OneDrive/Documents/情熱MAP開発環境/情熱MAP/map.js';
let mapCode = fs.readFileSync(mapJsPath, 'utf8');

if (!mapCode.includes('function doChangeId')) {
    const doChangeIdFnMap = `
window.doChangeId = async function() {
    const newId = document.getElementById('myNewId').value;
    const currentPw = document.getElementById('myPwForIdChange').value;
    const resultDiv = document.getElementById('changeIdResult');
    const btn = document.getElementById('changeIdBtn');
    const staffId = localStorage.getItem('passionMapUserId') || (typeof currentStaffId !== 'undefined' ? currentStaffId : '');

    if (!newId || !currentPw) { resultDiv.innerText = '❌ すべての項目を入力してください'; resultDiv.style.color = 'red'; return; }
    
    btn.disabled = true; btn.innerText = '変更中...';
    try {
        const res = await callGAS('changeId', { userId: staffId, password: currentPw, newId: newId });
        if (res.success) {
            resultDiv.innerText = '✅ ' + res.message;
            resultDiv.style.color = 'green';
            localStorage.setItem('passionMapUserId', newId);
            if (typeof currentStaffId !== 'undefined') currentStaffId = newId;
        } else {
            resultDiv.innerText = '❌ ' + res.message;
            resultDiv.style.color = 'red';
            btn.disabled = false; btn.innerText = 'IDを変更する';
        }
    } catch (e) {
        resultDiv.innerText = '❌ エラーが発生しました';
        resultDiv.style.color = 'red';
        btn.disabled = false; btn.innerText = 'IDを変更する';
    }
};
`;
    mapCode = mapCode.replace('async function doChangePassword()', doChangeIdFnMap + '\nasync function doChangePassword()');
    fs.writeFileSync(mapJsPath, mapCode, 'utf8');
}

const otherFiles = [
    'c:/Users/hatte/OneDrive/Documents/情熱MAP開発環境/情熱MAP/worker.js',
    'c:/Users/hatte/OneDrive/Documents/情熱MAP開発環境/情熱MAP/schedule.js',
    'c:/Users/hatte/OneDrive/Documents/情熱MAP開発環境/情熱MAP/admin.js',
    'c:/Users/hatte/OneDrive/Documents/情熱MAP開発環境/情熱MAP/admin2.js'
];

const badHtml = `<div id="changeIdResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>
 style="margin-top:10px; font-size:14px; font-weight:bold;"></div>`;
const goodHtml = `<div id="changeIdResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>`;

otherFiles.forEach(f => {
    let code = fs.readFileSync(f, 'utf8');
    if (code.includes(badHtml)) {
        code = code.replace(badHtml, goodHtml);
        fs.writeFileSync(f, code, 'utf8');
    }
});

console.log("Fixed map.js and other js files.");
