/**
 * 情熱MAP 統合API (管理者・作業員 共通)
 */
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    let result = null;
    if (action === "login") result = checkLogin(params.userId, params.password);
    else if (action === "getInitData") result = getInitData(); 
    else if (action === "savePolygon") result = savePolygon(params); // ★ savePolygonDataからsavePolygonに変更(関数名統一)
    else if (action === "updatePolygon") result = updatePolygon(params); // ★ updatePolygonDataからupdatePolygonに変更
    else if (action === "deletePolygon") result = deletePolygonData(params.id, params.userName);
    else if (action === "saveRecord") result = saveRecord(params.id, params.name, params.author, params.recordType, params.data, params.photos);
    else if (action === "updateRecordItem") result = updateRecordItem(params.id, params.recordId, params.recordType, params.data, params.photos, params.keptUrls, params.userName);
    else if (action === "deleteRecordItem") result = deleteRecordItem(params.id, params.recordId, params.userName);
    else if (action === "addCrop") result = addCropToMaster(params.cropData);
    else if (action === "deleteCrop") result = deleteCropFromMaster(params.cropName);
    else if (action === "mergeFields") result = mergeFields(params.baseId, params.targetId, params.userName);
    else if (action === "splitField") result = splitField(params);
    else if (action === "saveTouki") result = saveToukiData(params.toukiData, params.targetHojoId);
    else if (action === "getToukiDetails") result = getToukiDetails(params.toukiIds);
    else if (action === "manageMaster") result = manageMasterData(params.masterType, params.manageAction, params.value, params.userName);
    else if (action === "saveGlobalHarvest") result = saveGlobalHarvest(params);
    else if (action === "saveGlobalShipping") result = saveGlobalShipping(params);
    else if (action === "updateInventory") result = updateInventory(params); // ★これを追加
    else if (action === "addMaterialToSign") result = addMaterialToSign(params); // ★これを追加
    else if (action === "getInventoryHistory") result = getInventoryHistory(params); // ★これを追加
    else if (action === "getScheduleData") result = getScheduleData();
    else if (action === "saveReport") result = saveReportData(params.id, params.name, params.author, params.text, params.photos);
    else if (action === "deleteInventoryHistory") result = deleteInventoryHistory(params);
    else if (action === "editInventoryHistory") result = editInventoryHistory(params);
    else if (action === "updateMachineLocations") result = updateMachineLocations(params);
    else if (action === "editMaterial") result = editMaterial(params);
    else if (action === "addMachineToSign") result = addMachineToSign(params);
    else if (action === "addMachinePart") result = addMachinePart(params);
    else if (action === "addMachineSymptom") result = addMachineSymptom(params);
    else if (action === "getRefuelHistory") result = getRefuelHistory();
    else if (action === "saveRefuelRecord") result = saveRefuelRecord(params);
    else if (action === "getMachineLastHourMeters") result = getMachineLastHourMeters();
    else if (action === "updateSignLink") result = updateSignLink(params);
    else if (action === 'addToolToMaster') result = addToolToMaster(params);
    else if (action === "updateToolStatus") result = updateToolStatus(params);
    else if (action === "editToolInMaster") result = editToolInMaster(params);
    else if (action === "deleteToolFromMaster") result = deleteToolFromMaster(params);
    else if (action === "editMachineInMaster") result = editMachineInMaster(params);
    else if (action === "deleteMachineFromMaster") result = deleteMachineFromMaster(params);
    else if (action === "expandGoogleMapUrl") result = expandGoogleMapUrl(params);

    return ContentService.createTextOutput(JSON.stringify({status: "success", data: result})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function writeLog(user, action, target, detail) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('操作ログ');
  if (!sheet) {
    sheet = ss.insertSheet('操作ログ');
    sheet.appendRow(["日時", "ユーザー", "操作内容", "対象", "詳細"]);
    sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#e0e0e0");
  }
  const now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
  sheet.appendRow([now, user || "不明", action, target, detail]);
}

function checkLogin(userId, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('名簿');
  if (!sheet) throw new Error("「名簿」シートが見つかりません");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { 
    if (String(data[i][0]) === String(userId) && String(data[i][1]) === String(password)) {
      writeLog(data[i][2], "ログイン", "システム", "ログイン成功");
      return { success: true, name: data[i][2], role: data[i][3] || "作業員" }; 
    }
  }
  return { success: false, message: "IDまたはパスワードが正しくありません" };
}
// ==========================================
// 初期データ取得
// ==========================================
function getInitData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const getCol = (sheetNames, colIndex) => {
    for (let name of sheetNames) {
      const sh = ss.getSheetByName(name);
      if (sh) {
        const data = sh.getDataRange().getValues();
        if (data.length > 1) return data.slice(1).map(r => r[colIndex]).filter(String);
      }
    }
    return [];
  };

  const pdl = {
    locations: getCol(['圃場設定マスタ', '拠点名'], 0),
    conditions: getCol(['圃場設定マスタ', '圃場条件'], 1),
    statuses: getCol(['圃場設定マスタ', '稼働状況'], 2),
    stages: getCol(['生育記録マスタ', '栽培ステージ選択'], 2),
    signFunctionsMaster: getCol(['看板機能'], 0) // ★ここを追加！看板マスタのA列を取得します
  };
  
  let workMaster = [];
  let workStatuses = [];
  let signFunctions = [];
  let containerNames = [];
  let maintenanceContents = []; 
  
  const workSheet = ss.getSheetByName('作業マスタ');
  if (workSheet) {
    const data = workSheet.getDataRange().getValues();
    if (data.length > 0) {
      const headers = data[0].map(String); 
      
      const idxName = headers.indexOf('作業名');
      const idxPlace = headers.indexOf('表示場所');
      const idxFunc = headers.indexOf('対応看板機能');
      const idxDetail = headers.indexOf('詳細作業名');
      const idxStatus = headers.indexOf('進捗状況');
      const idxContainer = headers.indexOf('コンテナ名');
      const idxMaintenance = headers.indexOf('整備内容'); 

      for (let i = 1; i < data.length; i++) {
        let wName = idxName >= 0 ? data[i][idxName] : "";
        if (wName) {
          workMaster.push({ 
            name: wName, 
            displayPlace: idxPlace >= 0 ? data[i][idxPlace] : "", 
            targetFunction: idxFunc >= 0 && data[i][idxFunc] ? String(data[i][idxFunc]).trim() : "",
            detailWorks: idxDetail >= 0 && data[i][idxDetail] ? String(data[i][idxDetail]).trim() : ""
          });
        }
        if (idxFunc >= 0 && data[i][idxFunc]) signFunctions.push(String(data[i][idxFunc]).trim());
        if (idxStatus >= 0 && data[i][idxStatus]) workStatuses.push(data[i][idxStatus]);
        if (idxContainer >= 0 && data[i][idxContainer]) containerNames.push(data[i][idxContainer]);
        if (idxMaintenance >= 0 && data[i][idxMaintenance]) maintenanceContents.push(String(data[i][idxMaintenance]).trim()); 
      }
    }
  }
  
  pdl.workMaster = workMaster;
  pdl.signFunctions = [...new Set(signFunctions)].filter(String);
  pdl.workStatuses = [...new Set(workStatuses)].filter(String);
  if (pdl.workStatuses.length === 0) pdl.workStatuses = ['未着手', '途中', '完了'];
  pdl.containerNames = [...new Set(containerNames)].filter(String);
  pdl.maintenanceContents = [...new Set(maintenanceContents)].filter(String); 

  pdl.crops = [];
  for (let name of ['生育記録マスタ', '作物マスタ']) {
     const sh = ss.getSheetByName(name);
     if (sh) {
        const data = sh.getDataRange().getValues();
        if (data.length > 1) { pdl.crops = data.slice(1).filter(r => r[0]).map(r => ({ name: r[0], density: r[1] || 0 })); break; }
     }
  }
pdl.signLinks = {};
  const signSh = ss.getSheetByName('看板');
  if(signSh) {
     const sd = signSh.getDataRange().getValues();
     for(let i=1; i<sd.length; i++) {
        if(sd[i][0]) pdl.signLinks[sd[i][0]] = String(sd[i][8] || ""); // I列(インデックス8)
     }
  }
// 農機マスタの読み込み
  pdl.machines = [];
  const macSh = ss.getSheetByName('農機マスタ');
  if(macSh) {
     const md = macSh.getDataRange().getValues();
     for(let i=1; i<md.length; i++) { 
       if(md[i][1]) {
         // ★ここから上書き
         pdl.machines.push({
           id: String(md[i][0] || "").trim(),      
           name: String(md[i][1] || "").trim(),    
           workCategory: String(md[i][3] || ""), 
           signName: String(md[i][6] || ""),     // G列: 定位置看板名
           signId: String(md[i][7] || ""),       // H列: 定位置看板id
           category: String(md[i][8] || ""),     // I列: 分類（アタッチメント判定に使用）
           parts: String(md[i][11] || ""),       // L列: 部品名
           currentLocName: String(md[i][12] || md[i][6] || ""), // M列: 現在地名
           currentLocId: String(md[i][13] || md[i][7] || ""),   // N列: 現在地id
           symptoms: String(md[i][14] || ""),    // O列: 症状名
           targetMachineIds: String(md[i][15] || ""),
           fuel: String(md[i][16] || ""),
           machineNumber: String(md[i][17] || "")
           });
       }
     }
  }

  // ★注意：この下にあった pdl.symptoms = []; と、作業記録マスタから
  // 症状を取得する for文 のブロックはもう使わないので、削除してください！
  

pdl.materials = [];
  const mSh = ss.getSheetByName('資材マスタ');
  if(mSh) {
     const md = mSh.getDataRange().getValues();
     for(let i=1; i<md.length; i++) { 
       if(md[i][1]) {
         pdl.materials.push({
           id: md[i][0], 
           name: md[i][1], 
           workCategory: String(md[i][2] || ""), 
           size: md[i][3] || "",
           volUnit: md[i][4] || "",    // E列: 容量単位
           stockUnit: md[i][5] || "",  // F列: 在庫単位
           signName: md[i][8] || "",   // I列: 場所看板名
           signId: md[i][9] || "",     // J列: 場所看板id
           stock: md[i][10] || 0       // K列: 在庫状況 ★L列(11)からK列(10)に変更
         }); 
       }
     }
  }

// 🌟ここから追加：道具マスタの読み込み🌟
  pdl.tools = [];
  const toolSh = ss.getSheetByName('道具マスタ');
  if (toolSh) {
    const td = toolSh.getDataRange().getValues();
    for (let i = 1; i < td.length; i++) {
      if (td[i][0]) { // IDが存在する行のみ読み込む
        pdl.tools.push({
          id: String(td[i][0] || "").trim(),
          date: String(td[i][1] || "").trim(),          // B列: 日付
          name: String(td[i][2] || "").trim(),          // C列: 資材名
          regNumber: String(td[i][3] || "").trim(),     // D列: 登録番号
          workTypes: String(td[i][4] || "").trim(),     // E列: 使う作業
          url: String(td[i][5] || "").trim(),           // F列: 写真
          status: String(td[i][6] || "").trim(),        // G列: 稼働状況
          signName: String(td[i][7] || "").trim(),      // H列: 場所看板名
          signId: String(td[i][8] || "").trim()         // I列: 場所看板id
        });
      }
    }
  }
  // 🌟ここまで🌟
  let pastReports = {};
  const schedSheet = ss.getSheetByName('作業予定');
  if (schedSheet) {
    const data = schedSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const workName = String(data[i][0]); const polyId = String(data[i][10]); 
      if (workName.includes('⚠️問題対応:') && polyId) {
        let reason = workName.replace('⚠️問題対応: ', '').replace('⚠️問題対応:', '').trim();
        if (reason.includes(' / ')) reason = reason.split(' / ')[0].trim();
        if (!pastReports[polyId]) pastReports[polyId] = [];
        if (!pastReports[polyId].includes(reason) && reason !== '') pastReports[polyId].push(reason);
      }
    }
  }
  pdl.pastReports = pastReports;

  let activeLots = [];
  const lotSheet = ss.getSheetByName('ロット記録');
  if (lotSheet) {
    const data = lotSheet.getDataRange().getValues();
    if(data.length > 0){
       const head = data[0].map(String);
       const locIdx = head.indexOf('拠点') >= 0 ? head.indexOf('拠点') : 9;
       for (let i = 1; i < data.length; i++) {
         if (data[i][8] !== '完了' && data[i][8] !== '出荷済' && data[i][0]) {
           activeLots.push({ lotId: data[i][0], containerType: data[i][5], remain: data[i][7], location: data[i][locIdx] || '未設定' });
         }
       }
    }
  }

    
  

  // =========================================================
  // ★修正：履歴から見つけていただいた「完璧なreturn」に上書き！
  return { pdl, polygons: getSavedPolygons(), toukiList: getCol(['登記ID'], 0), activeLots };
  // =========================================================

} // ← これが getInitData を閉じる } です
  



/// =========================================
// マスタ管理（★看板マスタの処理を追加）
// =========================================
function manageMasterData(masterType, manageAction, value, userName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetName = "";
  
  if (masterType === 'crop') sheetName = '作物マスタ';
  else if (masterType === 'tool') sheetName = '道具マスタ';
  else if (masterType === 'material') sheetName = '資材マスタ';
  else if (masterType === 'work') sheetName = '作業マスタ';
  else if (masterType === 'sign') sheetName = '看板マスタ'; // ★追加
  
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`${sheetName}が見つかりません`);

  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);

  if (manageAction === 'add') {
    if (masterType === 'crop') {
      sheet.appendRow([value.name, value.density]);
    } else if (masterType === 'tool') {
      const newId = "TOOL-" + Utilities.getUuid().substring(0,6);
      sheet.appendRow([newId, value.name, "", value.workCategory, "", "", "", "", "", "所有", userName]);
    } else if (masterType === 'material') {
      const newId = "MAT-" + Utilities.getUuid().substring(0,6);
      sheet.appendRow([newId, value.name, value.workCategory, value.size, value.unit, "", "", "", "", "", "", userName]);
    } else if (masterType === 'work') {
      const newRow = new Array(headers.length).fill("");
      const map = {
        '作業名': value.name,
        '表示場所': value.displayPlace || "圃場",
        '対応看板機能': value.targetFunction || "",
        '詳細作業名': value.detailWorks || ""
      };
      for(let i=0; i<headers.length; i++) {
        if(map[headers[i]] !== undefined) newRow[i] = map[headers[i]];
      }
      sheet.appendRow(newRow);
    } else {
      // ★看板マスタなど、1列だけのシンプルなマスタ用
      sheet.appendRow([value]);
    }
    writeLog(userName, "マスタ追加", value.name || value, `対象: ${sheetName}`);
  } 
  else if (manageAction === 'delete') {
    const data = sheet.getDataRange().getValues();
    const targetVal = value.id || value.name || value;
    
    const keyIdx = masterType === 'work' ? headers.indexOf('作業名') : 0;

    for (let i = 1; i < data.length; i++) {
      let match = false;
      if (masterType === 'work') {
          if (keyIdx >= 0 && data[i][keyIdx] === targetVal) match = true;
      } else {
          if (data[i][0] === targetVal || data[i][1] === targetVal) match = true;
      }

      if (match) {
        sheet.deleteRow(i + 1);
        writeLog(userName, "マスタ削除", targetVal, `対象: ${sheetName}`);
        break;
      }
    }
  }

  const newData = sheet.getDataRange().getValues();
  if (masterType === 'crop') {
    return newData.slice(1).filter(r => r[0]).map(r => ({ name: r[0], density: r[1] || 0 }));
  } else if (masterType === 'tool') {
    return newData.slice(1).filter(r => r[1]).map(r => ({ id: r[0], name: r[1], workCategory: r[3] || "" }));
  } else if (masterType === 'material') {
    return newData.slice(1).filter(r => r[1]).map(r => ({ id: r[0], name: r[1], workCategory: r[2] || "", unit: r[4] || "" }));
  } else if (masterType === 'work') {
    const idxName = headers.indexOf('作業名');
    const idxPlace = headers.indexOf('表示場所');
    const idxFunc = headers.indexOf('対応看板機能');
    const idxDetail = headers.indexOf('詳細作業名');
    return newData.slice(1).filter(r => idxName >= 0 && r[idxName]).map(r => ({
      name: r[idxName],
      displayPlace: idxPlace >= 0 ? r[idxPlace] : "",
      targetFunction: idxFunc >= 0 ? r[idxFunc] : "",
      detailWorks: idxDetail >= 0 ? r[idxDetail] : ""
    }));
  } else {
    return newData.slice(1).map(r=>r[0]).filter(String);
  }
}
// ==========================================
// 問題報告の保存（K列に看板/圃場のIDを記録するように変更）
// ==========================================
function saveReportData(polyId, nameStr, author, reportText, photosBase64) {
  let urls = [];
  if (photosBase64 && photosBase64.length > 0) {
    const folders = DriveApp.getFoldersByName("圃場写真"); 
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("圃場写真");
    for (let i = 0; i < photosBase64.length; i++) {
      const s = photosBase64[i].base64.split(',');
      const type = s[0].split(';')[0].replace('data:','');
      const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(s[1]), type, photosBase64[i].filename));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); 
      urls.push("https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w800");
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) throw new Error("作業予定シートがありません");

  const today = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
  const workName = "⚠️問題対応: " + reportText;
  
  // A:作業名, B:担当部署(運営), C:作物名(空), D:圃場名, E:予定日, F:期限日, G:時間(空), H:適合者, I:完了日(空), J:写真URL, K:場所ID
  schedSheet.appendRow([workName, "運営", "", nameStr, today, today, "", author, "", urls.join(" , "), polyId]);

  writeLog(author, "問題報告", nameStr, `内容: ${reportText}`);
  return true;
}

function addCropToMaster(cropData) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('生育記録マスタ');
  const data = sheet.getDataRange().getValues(); let emptyRow = 2;
  while (emptyRow <= data.length && data[emptyRow-1][0]) emptyRow++;
  sheet.getRange(emptyRow, 1, 1, 2).setValues([[cropData.name, cropData.density || 0]]); 
  return cropData;
}
function deleteCropFromMaster(cropName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('生育記録マスタ');
  const data = sheet.getDataRange().getValues(); let newCrops = [];
  for(let j=1; j<data.length; j++) { if(data[j][0] && data[j][0] !== cropName) newCrops.push([data[j][0]]); }
  sheet.getRange("A2:A").clearContent(); if(newCrops.length > 0) sheet.getRange(2, 1, newCrops.length, 1).setValues(newCrops); return cropName;
}

function getToukiDetails(idsStr) {
  if (!idsStr) return [];
  const ids = idsStr.split(',').map(s => s.trim());
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('登記');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  return data.filter(row => ids.includes(String(row[0]))).map(row => ({ id: row[0], address: row[2], area: row[3], owner: row[4], type: row[5] }));
}

function saveToukiData(data, hojoId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('登記');
  const id = "T-" + Utilities.formatDate(new Date(), "GMT", "mmss") + Math.floor(Math.random()*100);
  sheet.appendRow([id, "", data.address, data.area, data.owner, data.type]);
  if (hojoId) {
    const found = findSheetAndRowById(hojoId);
    if (found && found.sheet.getName() === '圃場') {
      let current = found.rowData[11] || "";
      found.sheet.getRange(found.rowIndex, 12).setValue(current ? current + "," + id : id);
      syncToukiMapping();
    }
  }
  return id;
}

function syncToukiMapping() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), hojoSheet = ss.getSheetByName('圃場'), toukiSheet = ss.getSheetByName('登記');
  if (!hojoSheet || !toukiSheet) return;
  const hData = hojoSheet.getDataRange().getValues(), mapping = {};
  for (let i = 1; i < hData.length; i++) {
    const name = hData[i][1], tIdsStr = hData[i][11];
    if (tIdsStr) { tIdsStr.split(',').map(s => s.trim()).forEach(id => { if (!mapping[id]) mapping[id] = []; if (!mapping[id].includes(name)) mapping[id].push(name); }); }
  }
  const tData = toukiSheet.getDataRange().getValues();
  for (let i = 1; i < tData.length; i++) {
    const tid = String(tData[i][0]).trim();
    if (tid) toukiSheet.getRange(i + 1, 2).setValue(mapping[tid] ? mapping[tid].join(' , ') : '');
  }
}

// ==========================================
// 保存済みの圃場・看板データを取得
// ==========================================
function getSavedPolygons() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let result = [];
  
  // 圃場シート
  const fieldSheet = ss.getSheetByName('圃場');
  if (fieldSheet) {
    const data = fieldSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      let photos = [];
      try { if (data[i][9]) photos = JSON.parse(data[i][9]); } catch(e){}
      
      result.push({
        id: data[i][0],
        name: data[i][1],
        location: data[i][2],
        condition: data[i][3],
        area: data[i][4],
        coords: JSON.parse(data[i][5] || "[]"),
        color: data[i][6],
        author: data[i][8],
        photos: photos,
        status: data[i][10],
        toukiId: data[i][11],
        ridgeDir: data[i][13],
        ridgeWidth: data[i][14]
      });
    }
  }
  
  // 看板シート
  const signSheet = ss.getSheetByName('看板');
  if (signSheet) {
    const data = signSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      let photos = [];
      try { if (data[i][9]) photos = JSON.parse(data[i][9]); } catch(e){}
      
      result.push({
        id: data[i][0],
        name: data[i][1],
        coords: JSON.parse(data[i][2] || "[]"),
        color: data[i][3],
        author: data[i][5],
        signFunction: data[i][7] || "一般看板", // ★ここが超重要！H列（看板機能）をアプリに送る！
        photos: photos
      });
    }
  }
  
  return result;
}
// ==========================================
// 圃場・看板の新規保存
// ==========================================
function savePolygon(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // 座標が1点なら看板、それ以上なら圃場と判定
  const isMarker = JSON.parse(params.coords).length === 1;
  const sheetName = isMarker ? '看板' : '圃場';
  const sheet = ss.getSheetByName(sheetName);
  
  const newId = Utilities.getUuid();
  const now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm");
  
  if (isMarker) {
    // 【看板シートの列構成】
    // A:ID, B:名前, C:座標, D:色/アイコン, E:登録日時, F:登録者, G:空白, H:看板機能
    sheet.appendRow([
      newId,
      params.name || "",
      params.coords,
      params.color || "",
      now,
      params.userName || "",
      "", 
      params.signFunction || "機能なし"
    ]);
  } else {
    // 【圃場シートの列構成（画像に合わせて完全に修正）】
    // A:ID, B:圃場の名前, C:所属拠点名, D:圃場条件, E:圃場面積, F:座標, G:色/アイコン, H:登録日時, I:登録者, J:システム用データ(履歴), K:稼働状況, L:登記ID, M:親ID
    sheet.appendRow([
      newId,
      params.name || "",         // B列: 圃場の名前
      params.location || "",     // C列: 所属拠点名
      params.condition || "",    // D列: 圃場条件
      params.area || 0,          // E列: 圃場面積
      params.coords,             // F列: 座標
      params.color || "",        // G列: 色/アイコン
      now,                       // H列: 登録日時
      params.userName || "",     // I列: 登録者
      "[]",                      // J列: システム用データ（履歴）
      params.status || "",       // K列: 稼働状況
      params.toukiId || "",      // L列: 登記ID
      "",                        // M列: 親ID (新規作成時は空欄)
      params.ridgeDir || "",     // N列以降（畝方向などの予備）
      params.ridgeWidth || ""
    ]);
  }
  
  writeLog(params.userName, "図形登録", params.name, `対象: ${sheetName}`);
  return newId;
}

// ==========================================
// 圃場・看板情報の更新処理
// ==========================================
function updatePolygon(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const id = params.id;
  const userName = params.userName || "システム";
  
  // 圃場か看板かを探す
  let sheet = ss.getSheetByName('圃場');
  let data = sheet ? sheet.getDataRange().getValues() : [];
  let isSignboard = false;
  
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { targetRow = i + 1; break; }
  }
  
  if (targetRow === -1) {
    sheet = ss.getSheetByName('看板');
    if (!sheet) throw new Error("対象のデータが見つかりません");
    data = sheet.getDataRange().getValues();
    isSignboard = true;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id) { targetRow = i + 1; break; }
    }
  }

  if (targetRow === -1) throw new Error("対象データが見つかりません");

  // 今の（変更前の）名前を取得（看板も圃場もB列[インデックス1]）
  const oldName = data[targetRow - 1][1];
  
  // 更新する項目があれば上書き、なければ元のまま
  const newName = params.name !== undefined ? params.name : oldName;
  const coords = params.coords !== undefined ? params.coords : data[targetRow-1][isSignboard ? 2 : 5]; 
  const color = params.color !== undefined ? params.color : data[targetRow-1][isSignboard ? 3 : 6];

  let newPhotos = [];
  const historyCol = 10; // どちらもJ列(インデックス9)が履歴

  if (data[targetRow - 1][historyCol - 1]) {
    try { newPhotos = JSON.parse(data[targetRow - 1][historyCol - 1]); } catch(e) { newPhotos = []; }
  }

  // 名前が変更された場合、その事実を履歴に自動保存
  if (params.name !== undefined && oldName !== newName) {
    const dateStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
    const timeStr = Utilities.formatDate(new Date(), "JST", "HH:mm");
    
    const historyRecord = {
      id: Utilities.getUuid(),
      type: "work", 
      date: dateStr,
      time: timeStr,
      author: "システム自動記録",
      urls: [],
      data: {
        workDate: dateStr,
        workName: "ℹ️ 名称変更履歴",
        progressStatus: "完了",
        notes: `名称が「${oldName}」から「${newName}」に変更されました。（操作者：${userName}）`
      }
    };
    newPhotos.unshift(historyRecord);
  }

  // --- 保存処理（正しい列番号に修正！） ---
  if (isSignboard) {
    // 【看板】 B(2):名前, C(3):座標, D(4):色, H(8):看板機能, J(10):履歴
    sheet.getRange(targetRow, 2).setValue(newName);
    sheet.getRange(targetRow, 3).setValue(coords);
    sheet.getRange(targetRow, 4).setValue(color);
    if (params.signFunction !== undefined) sheet.getRange(targetRow, 8).setValue(params.signFunction);
    sheet.getRange(targetRow, historyCol).setValue(JSON.stringify(newPhotos));
  } else {
    // 【圃場】 画像に合わせて修正！
    sheet.getRange(targetRow, 2).setValue(newName); // B列: 圃場の名前
    if (params.location !== undefined) sheet.getRange(targetRow, 3).setValue(params.location); // C列: 拠点
    if (params.condition !== undefined) sheet.getRange(targetRow, 4).setValue(params.condition); // D列: 条件
    if (params.area !== undefined) sheet.getRange(targetRow, 5).setValue(params.area); // E列: 面積
    sheet.getRange(targetRow, 6).setValue(coords); // F列: 座標
    sheet.getRange(targetRow, 7).setValue(color); // G列: 色
    if (params.status !== undefined) sheet.getRange(targetRow, 11).setValue(params.status); // K列: 稼働状況
    if (params.toukiId !== undefined) sheet.getRange(targetRow, 12).setValue(params.toukiId); // L列: 登記ID
    
    if (params.ridgeDir !== undefined) sheet.getRange(targetRow, 14).setValue(params.ridgeDir); // N列(あれば)
    if (params.ridgeWidth !== undefined) sheet.getRange(targetRow, 15).setValue(params.ridgeWidth); // O列(あれば)
    
    sheet.getRange(targetRow, historyCol).setValue(JSON.stringify(newPhotos)); // J列: 履歴
  }

  writeLog(userName, "情報更新", newName, oldName !== newName ? `名前変更: ${oldName} -> ${newName}` : "属性変更");
  return true;
}
// ==========================================
// 圃場の分割
// ==========================================
function splitField(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('圃場');
  const data = sheet.getDataRange().getValues();
  let targetRowData = null;
  let targetRowIdx = -1;
  
  // 対象の圃場を探す
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === params.id) {
      targetRowData = data[i];
      targetRowIdx = i + 1;
      break;
    }
  }
  
  if (!targetRowData) throw new Error("分割元の圃場が見つかりません");
  
  const newId = Utilities.getUuid();
  const now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm");
  
  // ★アプリ側から送られた新しい名前(newName)があれば使用、なければ「_分割」
  const finalName = params.newName ? params.newName : (targetRowData[1] + "_分割");
  
  // 新しく追加するデータの配列を作成
  const newRowData = [
    newId,                        // A: ID
    finalName,                    // B: 圃場の名前 ★修正
    targetRowData[2] || "",       // C: 所属拠点名
    targetRowData[3] || "",       // D: 圃場条件
    targetRowData[4] || 0,        // E: 圃場面積
    targetRowData[5] || "",       // F: 座標
    targetRowData[6] || "",       // G: 色/アイコン
    now,                          // H: 登録日時
    params.userName || "システム", // I: 登録者
    "[]",                         // J: システム用データ(履歴は空でスタート)
    targetRowData[10] || "",      // K: 稼働状況
    targetRowData[11] || "",      // L: 登記ID
    targetRowData[0],             // M: 親ID (分割元のIDを記録)
    targetRowData[13] || "",      // N: 畝方向
    targetRowData[14] || ""       // O: 畝幅
  ];
  
  // 元の圃場の「上」に新しい行を挿入してデータをセット
  sheet.insertRowBefore(targetRowIdx);
  sheet.getRange(targetRowIdx, 1, 1, newRowData.length).setValues([newRowData]);
  
  writeLog(params.userName, "圃場分割", targetRowData[1] + " -> " + finalName, "対象: 圃場");
  return newId;
}
// ==========================================
// 圃場の統合
// ==========================================
function mergeFields(baseId, targetId, userName) {
  // doPostからのデータの受け取り方を修正しました
  if (typeof baseId === 'object') {
    targetId = baseId.targetId;
    userName = baseId.userName;
    baseId = baseId.baseId;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('圃場');
  const data = sheet.getDataRange().getValues();
  
  let baseRowIdx = -1;
  let targetRowIdx = -1;
  let baseData = null;
  let targetData = null;
  
  // 統合元と統合先の圃場を探す
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === baseId) { baseRowIdx = i + 1; baseData = data[i]; }     // ★修正ポイント
    if (data[i][0] === targetId) { targetRowIdx = i + 1; targetData = data[i]; } // ★修正ポイント
  }
  
  if (baseRowIdx === -1 || targetRowIdx === -1) throw new Error("統合する圃場が見つかりません");
  
  // 登記IDを結合
  let baseTouki = baseData[11] ? String(baseData[11]).split(',') : [];
  let targetTouki = targetData[11] ? String(targetData[11]).split(',') : [];
  let mergedTouki = [...new Set([...baseTouki, ...targetTouki])].filter(String).join(',');
  
  // 履歴(写真など)を結合
  let baseHistory = [];
  let targetHistory = [];
  try { if (baseData[9]) baseHistory = JSON.parse(baseData[9]); } catch(e){}
  try { if (targetData[9]) targetHistory = JSON.parse(targetData[9]); } catch(e){}
  let mergedHistory = baseHistory.concat(targetHistory);
  
  // ベースとなる圃場を更新
  sheet.getRange(baseRowIdx, 10).setValue(JSON.stringify(mergedHistory)); // J列: 履歴
  sheet.getRange(baseRowIdx, 12).setValue(mergedTouki); // L列: 登記ID
  
  // 吸収された圃場を削除
  sheet.deleteRow(targetRowIdx);
  
  writeLog(userName, "圃場統合", `${targetData[1]} を ${baseData[1]} に統合`, "対象: 圃場");
  return true;
}

function deletePolygonData(id, user) { 
  const found = findSheetAndRowById(id); 
  if (found) { 
    const name = found.rowData[1];
    const isHojo = found.sheet.getName() === '圃場'; 
    found.sheet.deleteRow(found.rowIndex); 
    if(isHojo) syncToukiMapping(); 
    writeLog(user, "図形削除", name, `システムID: ${id}`);
    return "DELETED"; 
  } 
}



function findSheetAndRowById(id) {
  const sheets = ['圃場', '看板'];
  for (let s of sheets) {
    let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(s);
    if (!sheet) continue;
    let data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) { if (data[i][0] === id) return { sheet, rowIndex: i + 1, rowData: data[i] }; }
  } return null;
}

function getOrCreateRecordSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheetName === '看板記録') { sheet.appendRow(["日時", "圃場名", "登録者", "写真URL", "システムID"]); } 
    else if (sheetName === '作業記録') { sheet.appendRow(["記録時間", "圃場名", "記録者", "作業日", "作業名", "作物名", "開始時間", "終了時間", "人数", "合計時間", "進捗状況", "写真URL", "システムID"]); }
    else if (sheetName === 'ロット記録') { sheet.appendRow(["ロットID", "生成日時", "生成者", "作物名", "圃場名", "コンテナ種類", "初期コンテナ数", "残コンテナ数", "ステータス"]); }
    else { sheet.appendRow(["日時", "圃場名", "登録者", "作物名", "開始時間", "終了時間", "草刈り", "草抜き", "排水", "虫食い", "病気", "収穫見込み日", "残存率(%)", "葉長(cm)", "収穫サイズ(cm)", "収穫可能量(個/本)", "栽培ステージ", "土壌PH", "花芽", "気づいたこと", "写真URL", "システムID"]); }
    sheet.getRange("A1:V1").setFontWeight("bold").setBackground("#e0e0e0");
  } return sheet;
}

// ==========================================
// 記録の保存処理 ★開始・終了条件をマスタから取得し、K列の勝手な上書きを廃止
// ==========================================
function saveRecord(idStr, nameStr, author, recordType, recordData, photosBase64) {
  const ids = idStr.split(',');
  const firstFound = findSheetAndRowById(ids[0]); 
  if (!firstFound) throw new Error("対象なし");
  
  const parentType = firstFound.sheet.getName();
  const recordId = Utilities.getUuid(); 
  let urls = [];
  
  const folders = DriveApp.getFoldersByName("圃場写真"); 
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("圃場写真");
  for (let i = 0; i < photosBase64.length; i++) {
    const s = photosBase64[i].base64.split(','), type = s[0].split(';')[0].replace('data:',''), file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(s[1]), type, photosBase64[i].filename));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); urls.push("https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w800");
  }
  const today = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd"), time = Utilities.formatDate(new Date(), "JST", "HH:mm");
  
  // ====================================================
  // ★開始条件(D列)と終了条件(E列)をマスタから取得
  // ====================================================
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingSheet = ss.getSheetByName('圃場設定マスタ');
  let startKeywords = [];
  let resetKeywords = [];
  if (settingSheet) {
    startKeywords = settingSheet.getRange('D2:D').getValues().flat().filter(String);
    resetKeywords = settingSheet.getRange('E2:E').getValues().flat().filter(String);
  }
  if (startKeywords.length === 0) startKeywords = ['田植え', '定植', '播種'];
  if (resetKeywords.length === 0) resetKeywords = ['片付け', '終了', '撤去', '稲刈り', '畝戻し'];
  // ====================================================

  if (recordType === 'work' && recordData) {
    const lotSheet = getOrCreateRecordSheet('ロット記録');
    if (recordData.lotAction === 'generate' && recordData.lotId) {
      lotSheet.appendRow([recordData.lotId, today+" "+time, author, recordData.crop, nameStr, recordData.containerType || "", recordData.lotContainers, recordData.lotContainers, "使用中"]);
      writeLog(author, "ロット生成", recordData.lotId, `種類: ${recordData.containerType}, 初期コンテナ: ${recordData.lotContainers}`);
    } else if (recordData.lotAction === 'use' && recordData.selectedLots) {
      const targetLots = recordData.selectedLots.split(',');
      const lData = lotSheet.getDataRange().getValues();
      for (let i = 1; i < lData.length; i++) {
        if (targetLots.includes(String(lData[i][0]))) {
          lotSheet.getRange(i+1, 8).setValue(recordData.lotRemain); 
          lotSheet.getRange(i+1, 9).setValue(recordData.lotStatus); 
        }
      }
      writeLog(author, "ロット使用", recordData.selectedLots, `ステータス: ${recordData.lotStatus}, 残: ${recordData.lotRemain}`);
    }
  }

  const rsName = recordType === 'work' ? '作業記録' : (parentType === '看板' ? '看板記録' : '生育記録');
  const rs = getOrCreateRecordSheet(rsName);
if (recordType === 'work') rs.appendRow([today+" "+time, nameStr, author, recordData.workDate||"", recordData.workName||"", recordData.crop||"", recordData.startTime||"", recordData.endTime||"", recordData.workerCount||"1", recordData.totalTime||"", recordData.progressStatus||"", urls.join(", "), recordId]);
    else if (parentType === '看板') rs.appendRow([today+" "+time, nameStr, author, urls.join(", "), recordId]);
    else rs.appendRow([today+" "+time, nameStr, author, recordData.crop||"", recordData.startTime||"", recordData.endTime||"", recordData.mowing?"済":"", recordData.weeding?"済":"", recordData.drainage?"済":"", recordData.bug?"有":"", recordData.disease?"有":"", recordData.harvestDate||"", recordData.survivalRate||"", recordData.leafLength||"", recordData.harvestSize||"", recordData.harvestAmount||"", recordData.fieldStatus||"", recordData.ph||"", recordData.flower?"有":"", recordData.notes||"", urls.join(", "), recordId]);
    
  writeLog(author, "記録一括追加", nameStr, `タイプ: ${rsName}`);

  let firstEx = [];
  
  for (let i = 0; i < ids.length; i++) {
    const found = findSheetAndRowById(ids[i]);
    if (!found) continue;
    const isHojo = found.sheet.getName() === '圃場';
    const pc = isHojo ? 10 : 7;
    let ex = []; if (found.rowData[pc-1]) { try { ex = JSON.parse(found.rowData[pc-1]); } catch(e) {} }
    ex.push({ id: recordId, type: recordType || 'growth', date: today, time, author, urls, data: recordData }); 
    found.sheet.getRange(found.rowIndex, pc).setValue(JSON.stringify(ex));
    
    // ====================================================
    // ★色(G列)の自動更新のみ行う（K列は稼働状況としてそのまま残す！）
    // ====================================================
    if (isHojo && recordType === 'work' && recordData && recordData.workName) {
      const wName = recordData.workName;
      let autoColor = null;
      
      const isResetWork = resetKeywords.some(keyword => wName.includes(keyword));
      const isStartWork = startKeywords.some(keyword => wName.includes(keyword));
      
      if (isResetWork) {
        autoColor = '#9E9E9E'; // 灰色（未使用）
      } 
      else if (isStartWork) {
        if (recordData.crop) {
          const cropColor = getOrCreateCropColor(recordData.crop);
          const currentColor = found.rowData[6]; // 現在の色 (G列:7番目)
          
          // 既に作物が植わっている（灰色や赤色ではなく、新しい作物色と違う）場合は混植
          if (currentColor && currentColor !== '#9E9E9E' && currentColor !== '#FF0000' && currentColor !== cropColor) {
            autoColor = '#9C27B0'; // 混植用の専用カラー（紫）
          } else {
            autoColor = cropColor;
          }
        }
      }

      // 色だけを更新し、K列（稼働状況）は絶対に上書きしない
      if (autoColor) found.sheet.getRange(found.rowIndex, 7).setValue(autoColor);
    }

    if (i === 0) firstEx = ex;
  }
  
  return firstEx;
}
function updateRecordItem(polyId, recordId, recordType, newData, newPhotosBase64, keptUrls, user) {
  const found = findSheetAndRowById(polyId); if (!found) throw new Error("対象なし");
  const pType = found.sheet.getName(), pc = pType === '圃場' ? 10 : 7; let ex = []; if (found.rowData[pc-1]) { try { ex = JSON.parse(found.rowData[pc-1]); } catch(e) {} }
  let tgt = ex.find(item => item.id === recordId || item.url === recordId); if (!tgt) throw new Error("記録が見つかりません");
  let newUrls = [];
  if (newPhotosBase64 && newPhotosBase64.length > 0) {
    const folders = DriveApp.getFoldersByName("圃場写真"); const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("圃場写真");
    for (let i = 0; i < newPhotosBase64.length; i++) {
      const s = newPhotosBase64[i].base64.split(','), type = s[0].split(';')[0].replace('data:',''), file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(s[1]), type, newPhotosBase64[i].filename));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); newUrls.push("https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w800");
    }
  }
  tgt.urls = (keptUrls || []).concat(newUrls); tgt.data = newData; tgt.type = recordType || 'growth'; delete tgt.url;
  found.sheet.getRange(found.rowIndex, pc).setValue(JSON.stringify(ex));
  
  const rsName = recordType === 'work' ? '作業記録' : (pType === '看板' ? '看板記録' : '生育記録');
  const rs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(rsName);
  if (rs) {
    const d = rs.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (recordType === 'work') {
          if (d[i][12] === recordId) { 
            const r = i + 1;
            rs.getRange(r, 4).setValue(newData.workDate||""); rs.getRange(r, 5).setValue(newData.workName||""); rs.getRange(r, 6).setValue(newData.crop||""); rs.getRange(r, 7).setValue(newData.startTime||""); rs.getRange(r, 8).setValue(newData.endTime||""); rs.getRange(r, 9).setValue(newData.workerCount||"1"); rs.getRange(r, 10).setValue(newData.totalTime||""); rs.getRange(r, 11).setValue(newData.progressStatus||""); rs.getRange(r, 12).setValue(tgt.urls.join(" , "));
            break;
          }
      } else if (pType === '看板') {
          if (d[i][4] === recordId) { rs.getRange(i + 1, 4).setValue(tgt.urls.join(" , ")); break; }
      } else { 
          if (d[i][21] === recordId) { 
            const r = i + 1;
            rs.getRange(r, 4).setValue(newData.crop||""); rs.getRange(r, 5).setValue(newData.startTime||""); rs.getRange(r, 6).setValue(newData.endTime||"");
            rs.getRange(r, 7).setValue(newData.mowing?"済":""); rs.getRange(r, 8).setValue(newData.weeding?"済":""); rs.getRange(r, 9).setValue(newData.drainage?"済":""); rs.getRange(r, 10).setValue(newData.bug?"有":""); rs.getRange(r, 11).setValue(newData.disease?"有":""); rs.getRange(r, 12).setValue(newData.harvestDate||""); rs.getRange(r, 13).setValue(newData.survivalRate||""); rs.getRange(r, 14).setValue(newData.leafLength||""); rs.getRange(r, 15).setValue(newData.harvestSize||""); rs.getRange(r, 16).setValue(newData.harvestAmount||""); rs.getRange(r, 17).setValue(newData.fieldStatus||""); rs.getRange(r, 18).setValue(newData.ph||""); rs.getRange(r, 19).setValue(newData.flower?"有":""); rs.getRange(r, 20).setValue(newData.notes||""); rs.getRange(r, 21).setValue(tgt.urls.join(" , ")); break;
          }
      }
    }
  } 
  writeLog(user, "記録編集", found.rowData[1], `対象ID: ${recordId}`);
  return ex;
}

function deleteRecordItem(polyId, recordId, user) {
  const found = findSheetAndRowById(polyId); if (!found) throw new Error("対象なし");
  const pc = found.sheet.getName() === '圃場' ? 10 : 7; let ex = []; if (found.rowData[pc-1]) { try { ex = JSON.parse(found.rowData[pc-1]); } catch(e) {} }
  const updated = ex.filter(item => item.id !== recordId && item.url !== recordId); found.sheet.getRange(found.rowIndex, pc).setValue(JSON.stringify(updated)); 
  writeLog(user, "記録削除", found.rowData[1], `対象ID: ${recordId}`);
  return updated;
}

// ==========================================
// 作業予定と地図ステータスの取得（部署自動判定を追加）
// ==========================================
function getScheduleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = new Date(); today.setHours(0,0,0,0);

  // 1. 作業記録マスタから「作業名 -> 担当部署」の辞書を作成
  const workDeptMap = {};
  const workMasterSheet = ss.getSheetByName('作業マスタ');
  if (workMasterSheet) {
    const wData = workMasterSheet.getDataRange().getValues();
    for(let i=1; i<wData.length; i++) {
      if(wData[i][0]) workDeptMap[wData[i][0]] = wData[i][1] || '未分類';
    }
  }

  // 2. 作業実績から収穫中と完了日時を抽出
  const workSheet = ss.getSheetByName('作業記録');
  const completedWorks = {};
  const harvestingFields = {};
  if (workSheet) {
    const wData = workSheet.getDataRange().getValues();
    for (let i = 1; i < wData.length; i++) {
      const fieldName = wData[i][1];
      const workDate = wData[i][3];
      const workName = wData[i][4];
      const cropName = wData[i][5];
      const progress = wData[i][10];
      const dept = workDeptMap[workName] || '未分類';

      if (progress === '完了') {
        const key = `${fieldName}_${workName}_${cropName}`;
        if (!completedWorks[key] || new Date(workDate) > new Date(completedWorks[key])) {
          completedWorks[key] = workDate;
        }
      }
      if (workName && String(workName).includes('収穫') && progress !== '完了') {
        if(!harvestingFields[fieldName]) harvestingFields[fieldName] = [];
        if(!harvestingFields[fieldName].includes(dept)) harvestingFields[fieldName].push(dept);
      }
    }
  }

  // 3. 作業予定の照合と自動部署判定
  const schedSheet = ss.getSheetByName('作業予定');
  let activeSchedules = [];
  if (schedSheet) {
    const sData = schedSheet.getDataRange().getValues();
    let scheduleUpdates = [];
    for (let i = 1; i < sData.length; i++) {
      const workName = sData[i][0];
      let dept = sData[i][1];
      const cropName = sData[i][2];
      const fieldName = sData[i][3];
      const schedDateRaw = sData[i][4];
      const deadlineRaw = sData[i][5];
      const hours = sData[i][6];
      const person = sData[i][7];
      let compDate = sData[i][8];

      if (!workName && !fieldName) continue;

      // 自動部署判定 (空欄の場合)
      if (!dept) {
        if (String(workName).includes('⚠️')) dept = '運営';
        else dept = workDeptMap[workName] || '未設定';
        // 判定した部署をシート(B列=2)に書き込むよう予約
        scheduleUpdates.push({row: i + 1, col: 2, val: dept});
      }

      const key = `${fieldName}_${workName}_${cropName}`;
      if (!compDate && completedWorks[key]) {
        compDate = completedWorks[key];
        scheduleUpdates.push({row: i + 1, col: 9, val: compDate}); // I列=9
      }

      if (!compDate && fieldName) {
        let schedDateStr = schedDateRaw ? Utilities.formatDate(new Date(schedDateRaw), "JST", "MM/dd") : "-";
        let deadlineStr = deadlineRaw ? Utilities.formatDate(new Date(deadlineRaw), "JST", "MM/dd") : "-";
        let isOverdue = false;
        if (deadlineRaw) {
          const dlDate = new Date(deadlineRaw);
          dlDate.setHours(0,0,0,0);
          if (dlDate < today) isOverdue = true;
        }
        activeSchedules.push({ workName, dept, cropName, fieldName, schedDate: schedDateStr, deadline: deadlineStr, hours, person, isOverdue });
      }
    }
    // 空欄を自動補完
    if (scheduleUpdates.length > 0) {
      scheduleUpdates.forEach(upd => schedSheet.getRange(upd.row, upd.col).setValue(upd.val));
    }
  }

  // 4. ポリゴン情報の収集（ステータスはフロントエンドで計算させるために付加情報を乗せる）
  const polygons = getSavedPolygons();
  polygons.forEach(p => {
    p.harvestingDepts = harvestingFields[p.name] || []; 
  });

  return { polygons, activeSchedules };
}

// ==========================================
// ★新規追加：作物ごとのカラーを管理する関数
// （コードの一番下に追加してください）
// ==========================================
function getOrCreateCropColor(cropName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('作物マスタ');
  if (!sheet) return '#4CAF50'; // 見つからない場合のデフォルト緑
  const data = sheet.getDataRange().getValues();

  // カラーパレットの9色
  const palette = ['#FF0000', '#FF9800', '#FFEB3B', '#00FF00', '#556B2F', '#00BCD4', '#0000FF', '#9C27B0', '#B71C1C'];
  let usedColors = [];
  let targetRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === cropName) {
      if (data[i][2]) return data[i][2]; // C列(3番目)に色が設定されていればそれを返す
      targetRow = i + 1; // 色が空っぽだった場合はここをマーク
    }
    if (data[i][2]) usedColors.push(data[i][2]);
  }

  // パレットから未使用の色を探す（全部使われていたらランダムで選ぶ）
  let newColor = palette.find(c => !usedColors.includes(c));
  if (!newColor) newColor = palette[Math.floor(Math.random() * palette.length)];

  // 作物マスタに色を保存
  if (targetRow !== -1) {
    sheet.getRange(targetRow, 3).setValue(newColor); // C列に保存
  } else {
    sheet.appendRow([cropName, 0, newColor]); // なければ新規追加
  }
  return newColor;
}
// ==========================================
// 🚜 全体収穫（一括ロット生成）処理 ★拠点別に対応
// ==========================================
function saveGlobalHarvest(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
  const time = Utilities.formatDate(new Date(), "JST", "HH:mm");
  
  // ① 圃場マスタから 圃場名 => 拠点名 の辞書を作る
  const fieldSheet = ss.getSheetByName('圃場');
  const fieldLocationMap = {};
  if (fieldSheet) {
    const fData = fieldSheet.getDataRange().getValues();
    for (let i = 1; i < fData.length; i++) {
      if (fData[i][1]) {
        fieldLocationMap[fData[i][1]] = fData[i][2] || '未設定'; // C列(2)が拠点
      }
    }
  }

  // ② 今日の「作業記録」から、指定拠点＆指定作物の「収穫」を行った畑を自動検索
  const workSheet = ss.getSheetByName('作業記録');
  let harvestedFields = [];
  if (workSheet) {
    const wData = workSheet.getDataRange().getValues();
    for(let i=1; i<wData.length; i++) {
       try {
         const d = new Date(wData[i][3]); // D列(3): 作業日
         if (!isNaN(d.getTime())) {
           const recordDate = Utilities.formatDate(d, "JST", "yyyy/MM/dd");
           const wName = String(wData[i][4]); // E列(4): 作業名
           const cropName = String(wData[i][5]); // F列(5): 作物名
           const fieldName = String(wData[i][1]); // B列(1): 圃場名
           
           const fieldLoc = fieldLocationMap[fieldName] || '未設定';

           // 日付、収穫作業、作物名、そして【拠点】が完全に一致するか判定！
           if (recordDate === today && wName.includes('収穫') && cropName === params.crop && fieldLoc === params.location) {
              harvestedFields.push(fieldName);
           }
         }
       } catch(e){}
    }
  }
  
  // 重複排除してカンマ区切りに
  const fieldNamesStr = [...new Set(harvestedFields)].join(' , ') || "圃場指定なし（単独ロット）";
  
  // ③ ロット記録に保存
  const lotSheet = getOrCreateRecordSheet('ロット記録');
  
  // J列(拠点)のヘッダーがなければ自動で作る
  const header = lotSheet.getRange(1, 1, 1, lotSheet.getLastColumn()).getValues()[0];
  if (header.length < 10 || header[9] !== "拠点") {
      lotSheet.getRange(1, 10).setValue("拠点").setFontWeight("bold").setBackground("#e0e0e0");
  }

  const lotId = "L-" + Utilities.formatDate(new Date(), "JST", "MMddHHmm") + Math.floor(Math.random()*10);
  
  // A:ID, B:日時, C:生成者, D:作物名, E:圃場名, F:コンテナ種類, G:初期数, H:残数, I:ステータス, J:拠点
  lotSheet.appendRow([lotId, today+" "+time, params.author, params.crop, fieldNamesStr, params.containerType, params.count, params.count, "使用中", params.location]);
  
  writeLog(params.author, "一括ロット生成", lotId, `拠点: ${params.location}, 作物: ${params.crop}, 自動紐付: ${fieldNamesStr}`);
  return { lotId: lotId, fields: fieldNamesStr };
}
// ==========================================
// 📦 出荷記録処理
// ==========================================
function saveGlobalShipping(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm");
  
  // ① 選択されたロットを「出荷済（残0）」に更新する
  const lotSheet = ss.getSheetByName('ロット記録');
  if(lotSheet && params.selectedLots && params.selectedLots.length > 0) {
    const lData = lotSheet.getDataRange().getValues();
    for(let i=1; i<lData.length; i++) {
      if (params.selectedLots.includes(String(lData[i][0]))) {
         lotSheet.getRange(i+1, 8).setValue(0); // 残コンテナ0
         lotSheet.getRange(i+1, 9).setValue("出荷済"); // ステータス
      }
    }
  }
  
  // ② 「出荷記録」シートに履歴を残す
  const shipSheet = getOrCreateRecordSheet('出荷記録');
  const header = shipSheet.getRange(1,1,1,5).getValues()[0];
  if(header[0] !== "日時") { // ヘッダーがなければ作る
     shipSheet.getRange("A1:E1").setValues([["日時", "担当者", "出荷先", "対象ロット", "メモ"]]).setFontWeight("bold").setBackground("#e0e0e0");
  }
  shipSheet.appendRow([today, params.author, params.destination || "", params.selectedLots.join(" , "), params.notes || ""]);
  
  writeLog(params.author, "出荷記録", params.selectedLots.join(","), `出荷先: ${params.destination}`);
  return true;
}


// ==========================================
// 在庫の入出庫処理・記録
// ==========================================
function updateInventory(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 在庫記録シートへの追記
  let invSheet = ss.getSheetByName('在庫記録');
  if (!invSheet) {
    invSheet = ss.insertSheet('在庫記録');
    invSheet.appendRow(['日時', 'ユーザー', '資材ID', '資材名', '変動量', '処理', '看板ID', '看板名']);
  }
  
  const now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
  const diff = parseInt(params.amount);
  const actionType = diff >= 0 ? "入庫" : "出庫";
  
  invSheet.appendRow([
    now,
    params.userName,
    params.materialId,
    params.materialName,
    Math.abs(diff),
    actionType,
    params.signId,
    params.signName
  ]);
  
  // 2. 資材マスタの現在庫(K列)を更新
  const matSheet = ss.getSheetByName('資材マスタ');
  const data = matSheet.getDataRange().getValues();
  let currentStock = 0;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === params.materialId) {
      // ★修正：K列（インデックス10）から現在の在庫を取得して計算
      currentStock = parseInt(data[i][10] || 0) + diff;
      matSheet.getRange(i + 1, 11).setValue(currentStock); // ★修正：11列目(K列)に保存
      break;
    }
  }
  
  writeLog(params.userName, `在庫${actionType}`, `${params.materialName} (${Math.abs(diff)})`, `対象: ${params.signName}`);
  return currentStock;
}
// ==========================================
// 現場（アプリ）からの新規資材登録
// ==========================================
function addMaterialToSign(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('資材マスタ');
  const newId = 'MAT-' + Utilities.getUuid().substring(0,8);
  const now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
  
  // 写真をGoogleドライブに保存する内部関数
  function saveImage(photoObj) {
    if (!photoObj || !photoObj.base64) return "";
    try {
      const splitBase = photoObj.base64.split(',');
      const type = splitBase[0].split(';')[0].replace('data:', '');
      const byteString = Utilities.base64Decode(splitBase[1]);
      const blob = Utilities.newBlob(byteString, type, photoObj.filename || "photo.jpg");
      const folders = DriveApp.getFoldersByName("情熱MAP_資材写真");
      const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("情熱MAP_資材写真");
      return folder.createFile(blob).getUrl();
    } catch(e) { return ""; }
  }

  // 2枚までの写真を保存
  const photo1Url = params.photos && params.photos.length > 0 ? saveImage(params.photos[0]) : "";
  const photo2Url = params.photos && params.photos.length > 1 ? saveImage(params.photos[1]) : "";
  
  const initStock = parseInt(params.initialStock) || 0;
  
  // 資材マスタの列に合わせて登録
  // A:ID, B:資材名, C:作業分類, D:容量/サイズ, E:容量単位, F:在庫単位, G:写真, H:写真2, I:場所看板名, J:場所看板id, K:在庫状況, L:登録者
  sheet.appendRow([
    newId,
    params.name,
    "",                      // C: 作業分類
    params.size || "",       // D: 容量・サイズ
    params.volUnit || "",    // E: 容量単位
    params.stockUnit || "",  // F: 在庫単位
    photo1Url,               // G: 写真1
    photo2Url,               // H: 写真2
    params.signName,         // I: 場所看板名
    params.signId,           // J: 場所看板id
    initStock,               // K: 在庫状況 ★修正
    params.userName          // L: 登録者 ★修正
  ]);

  // 初期数量があれば「在庫記録」シートにも書き込む
  if (initStock > 0) {
    let invSheet = ss.getSheetByName('在庫記録');
    if (!invSheet) {
      invSheet = ss.insertSheet('在庫記録');
      invSheet.appendRow(['日時', 'ユーザー', '資材ID', '資材名', '変動量', '処理', '看板ID', '看板名']);
    }
    invSheet.appendRow([now, params.userName, newId, params.name, initStock, '初期入庫', params.signId, params.signName]);
  }

  writeLog(params.userName, "資材新規登録", params.name, `対象看板: ${params.signName}`);
  
  return {
     id: newId, 
     name: params.name, 
     workCategory: "", 
     size: params.size,
     volUnit: params.volUnit,
     stockUnit: params.stockUnit,
     signName: params.signName,
     signId: params.signId,
     stock: initStock
  };
}
// ==========================================
// 指定した資材の入出庫履歴を取得する
// ==========================================
function getInventoryHistory(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invSheet = ss.getSheetByName('在庫記録');
  if (!invSheet) return [];
  
  const data = invSheet.getDataRange().getDisplayValues();
  let history = [];
  
  for (let i = data.length - 1; i > 0; i--) {
    if (data[i][2] === params.materialId) {
      history.push({
        rowIndex: i + 1,     // ★追加：スプレッドシートの行番号
        date: data[i][0],
        user: data[i][1],
        amount: data[i][4],
        action: data[i][5]
      });
    }
  }
  return history
  ;
}
// ==========================================
// 在庫の再計算と履歴の編集・削除
// ==========================================
function recalcStock(materialId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invSheet = ss.getSheetByName('在庫記録');
  let newStock = 0;
  
  if (invSheet) {
    const data = invSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === materialId) {
        let amount = parseInt(data[i][4]) || 0;
        let action = data[i][5];
        if (action === "入庫" || action === "初期入庫") newStock += amount;
        else if (action === "出庫") newStock -= amount;
      }
    }
  }
  
  const matSheet = ss.getSheetByName('資材マスタ');
  if (matSheet) {
    const mData = matSheet.getDataRange().getValues();
    for (let i = 1; i < mData.length; i++) {
      if (mData[i][0] === materialId) {
        matSheet.getRange(i + 1, 11).setValue(newStock); // K列(11)を更新
        break;
      }
    }
  }
  return newStock;
}

function deleteInventoryHistory(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invSheet = ss.getSheetByName('在庫記録');
  invSheet.deleteRow(params.rowIndex); // 行を削除
  return recalcStock(params.materialId); // 再計算して新しい在庫を返す
}

function editInventoryHistory(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const invSheet = ss.getSheetByName('在庫記録');
  
  // 🌟F列(6列目): 操作内容（入庫・出庫など）を上書きする
  if (params.newAction) {
    invSheet.getRange(params.rowIndex, 6).setValue(params.newAction);
  }

  // 🌟E列(5列目): 数量(変動量)を上書きする
  invSheet.getRange(params.rowIndex, 5).setValue(Math.abs(params.newAmount)); 
  
  return recalcStock(params.materialId); // 再計算して新しい在庫を返す
}
// ==========================================
// 農機の片づけ場所を更新する
// ==========================================
function updateMachineLocations(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const macSh = ss.getSheetByName('農機マスタ');
  if(!macSh) return false;
  
  const data = macSh.getDataRange().getValues();
  const updates = params.updates || [];
  
  updates.forEach(upd => {
    for(let i = 1; i < data.length; i++) {
      if(data[i][0] === upd.id) {
        // ★定位置(G列H列)は残し、M列(13列目)・N列(14列目)に現在地を記録する！
        macSh.getRange(i + 1, 13).setValue(upd.signName); 
        macSh.getRange(i + 1, 14).setValue(upd.signId);   
        break;
      }
    }
  });
  return true;
}
// ==========================================
// 現場（アプリ）からの新規農機・車両登録
// ==========================================
function addMachineToSign(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('農機マスタ');
  const newId = 'MAC-' + Utilities.getUuid().substring(0,8);
  
  // 写真をGoogleドライブに保存する内部関数
  function saveImage(photoObj) {
    if (!photoObj || !photoObj.base64) return "";
    try {
      const splitBase = photoObj.base64.split(',');
      const type = splitBase[0].split(';')[0].replace('data:', '');
      const byteString = Utilities.base64Decode(splitBase[1]);
      const blob = Utilities.newBlob(byteString, type, photoObj.filename || "photo.jpg");
      const folders = DriveApp.getFoldersByName("情熱MAP_農機写真"); // 専用フォルダ作成
      const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("情熱MAP_農機写真");
      return folder.createFile(blob).getUrl();
    } catch(e) { return ""; }
  }

  const photo1Url = params.photos && params.photos.length > 0 ? saveImage(params.photos[0]) : "";
  const photo2Url = params.photos && params.photos.length > 1 ? saveImage(params.photos[1]) : "";
  
  // 農機マスタの列に合わせて登録
  // A:ID, B:農機名, C:型式, D:作業分類, E:写真, F:写真2, G:看板名, H:看板id, I:空, J:購入年月日, K:登録者, L:部品名
  sheet.appendRow([
    newId,
    params.name,
    params.machineNumber,
    params.model || "",
    params.workCategory || "",
    photo1Url,
    photo2Url,
    params.signName,
    params.signId,
    "",                      // I列は空
    params.purchaseDate || "",
    params.userName,
    params.parts || ""
  ]);

  writeLog(params.userName, "農機新規登録", params.name, `定位置: ${params.signName}`);
  
  return {
     id: newId, 
     name: params.name, 
     workCategory: params.workCategory,
     signName: params.signName,
     signId: params.signId,
     parts: params.parts
  };
}
// ==========================================
// 資材マスタの編集
// ==========================================
function editMaterial(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('資材マスタ');
  if(!sheet) throw new Error("資材マスタシートがありません");
  
  const data = sheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(data[i][0] === params.id) {
      sheet.getRange(i+1, 2).setValue(params.name);         // B列: 資材名
      sheet.getRange(i+1, 3).setValue(params.workCategory); // ★これがあるか確認: C列(作業分類)
      sheet.getRange(i+1, 4).setValue(params.size);         // D列: 容量・サイズ
      sheet.getRange(i+1, 5).setValue(params.volUnit);      // E列: 容量単位
      sheet.getRange(i+1, 6).setValue(params.stockUnit);    // F列: 在庫単位
      return true;
    }
  }
  return false;
}
// ==========================================
// 農機の部品を新規追加する
// ==========================================
function addMachinePart(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('農機マスタ');
  if(!sheet) throw new Error("農機マスタシートがありません");
  
  const data = sheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(data[i][0] === params.machineId) {
      const currentParts = String(data[i][11] || ""); // L列: 部品名
      const newParts = currentParts ? currentParts + "," + params.newPart : params.newPart;
      sheet.getRange(i+1, 12).setValue(newParts);
      return newParts; 
    }
  }
  throw new Error("指定された農機が見つかりません");
}
// ==========================================
// 農機の症状を自動追加する
// ==========================================
function addMachineSymptom(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('農機マスタ');
  if(!sheet) throw new Error("農機マスタシートがありません");
  
  const data = sheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(data[i][0] === params.machineId) {
      const currentSymptoms = String(data[i][14] || ""); // O列(インデックス14)
      const newSymptoms = currentSymptoms ? currentSymptoms + "," + params.newSymptom : params.newSymptom;
      sheet.getRange(i+1, 15).setValue(newSymptoms); // スプレッドシートのO列は15番目
      return newSymptoms; 
    }
  }
  throw new Error("指定された農機が見つかりません");
}
// ==========================================
// 給油記録の保存と履歴取得
// ==========================================
function saveRefuelRecord(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('給油記録');
  if(!sheet) { // もしシートがなければ自動作成
    sheet = ss.insertSheet('給油記録');
    // ★L列のヘッダーを「爪の状態」に変更しました
    sheet.appendRow(['車両ID','車両名','給油日','給油量(L)','アワメーター(h)','使うアタッチメント選択','給油キャップ','エンジンオイル','防虫網','冷却水','チェーンケースカバー','爪の状態','登録者']);
  }
  
  sheet.appendRow([
    p.machineId,
    p.machineName,
    p.date,
    p.amount,
    p.hourMeter,
    p.attachment,
    p.cap ? '確認済' : '',
    p.oil ? '確認済' : '',
    p.net ? '確認済' : '',
    p.water ? '確認済' : '',
    p.chainCover ? '確認済' : '',
    p.rotaryClaw ? '確認済' : '',
    p.userName
  ]);
  return true;
}
function getRefuelHistory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('給油記録');
  if(!sh) return [];
  const data = sh.getDataRange().getValues();
  let history = [];
  for(let i=1; i<data.length; i++) {
    if(data[i][0]) {
      let dStr = data[i][2];
      if (dStr instanceof Date) dStr = Utilities.formatDate(dStr, "JST", "yyyy/MM/dd");
      history.push({
        machineName: String(data[i][1] || "-"),
        date: dStr,
        amount: data[i][3],
        hourMeter: data[i][4],
        user: String(data[i][12] || "-")
      });
    }
  }
  return history.reverse().slice(0, 30); // 最新30件を返す
}
// ==========================================
// 各車両の前回（最新）のアワメーターを取得する
// ==========================================
function getMachineLastHourMeters() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('給油記録');
  let res = {};
  if(!sh) return res;
  
  const data = sh.getDataRange().getValues();
  // 上から下へループするため、同じ車両があれば一番下（最新）の記録で上書きされます
  for(let i=1; i<data.length; i++) {
    const mId = data[i][0];   // A列: 車両ID
    const hm = data[i][4];    // E列: アワメーター
    if (mId && hm !== "") {
      res[mId] = hm; 
    }
  }
  return res;
}
// ==========================================
// 看板の連携IDを「看板」シートのI列に保存
// ==========================================
function updateSignLink(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('看板');
  if(!sh) return false;
  const data = sh.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(data[i][0] === params.id) {
      sh.getRange(i+1, 9).setValue(params.linkedSigns); // I列は9番目
      return true;
    }
  }
  return false;
}
// ==========================================
// 🪚 道具マスタへの新規登録
// ==========================================
function addToolToMaster(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('道具マスタ');
  if (!sheet) throw new Error("「道具マスタ」シートが見つかりません。");
  
  // かぶらない一意のIDを作成
  const id = "TL-" + Utilities.formatDate(new Date(), "GMT", "MMddHHmmss") + Math.floor(Math.random()*1000);
  
  // 写真の保存処理
  let photoUrl = "";
  if (params.photoBase64) {
    const folders = DriveApp.getFoldersByName("道具写真");
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("道具写真");
    
    const parts = params.photoBase64.split(',');
    const type = parts[0].split(';')[0].replace('data:', '');
    const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), type, params.photoFilename || "photo.jpg");
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    photoUrl = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w800";
  }
  
  const status = '使用可'; // 新規登録時は「使用可」にする
  const dateStr = params.date || Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
  
  // 道具マスタの列構成に合わせて書き込み（A:ID, B:日付, C:資材名, D:登録番号, E:使う作業, F:写真, G:稼働状況, H:場所看板名, I:場所看板id）
  sheet.appendRow([
    id,
    dateStr,
    params.name || "",
    params.regNumber || "",
    params.works || "",
    photoUrl,
    status,
    params.signName || "",
    params.signId || ""
  ]);
  
  // システムの操作ログに記録
  writeLog(params.userName, "道具登録", params.name, `対象: ${params.signName}`);
  
  // 登録完了後、アプリ側（index.html）に最新データを返す
  return {
    id: id,
    date: dateStr,
    name: params.name,
    regNumber: params.regNumber,
    workTypes: params.works,
    url: photoUrl,
    status: status,
    signName: params.signName,
    signId: params.signId
  };
}
// ==========================================
// 🪚 道具のステータス更新と「道具記録」への履歴保存
// ==========================================
function updateToolStatus(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const masterSheet = ss.getSheetByName('道具マスタ');
  const logSheet = ss.getSheetByName('道具記録');
  
  if (!masterSheet) throw new Error("「道具マスタ」シートがありません。");

  const data = masterSheet.getDataRange().getValues();
  let targetRowIndex = -1;
  let toolData = null;

  // 1. 道具マスタから該当する道具を探す
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === params.toolId) {
      targetRowIndex = i + 1; // スプレッドシートの行番号は1始まり
      toolData = data[i];
      break;
    }
  }

  if (targetRowIndex === -1) throw new Error("指定された道具が見つかりません。");

  // 2. 道具マスタの稼働状況（G列 = 7列目）を新しいステータスに上書き
  masterSheet.getRange(targetRowIndex, 7).setValue(params.newStatus);

  // 3. 「道具記録」シートに履歴をガッツリ追記する
  if (logSheet && toolData) {
    const dateStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm");
    
    // E列（使う作業）の欄に、誰が何をしたかの操作ログを入れる
    const actionLog = `【${params.newStatus}】へ変更 (操作者: ${params.userName})`;

    // A:ID, B:日付, C:資材名, D:登録番号, E:使う作業(ログ代用), F:写真, G:稼働状況, H:看板名, I:看板ID
    logSheet.appendRow([
      toolData[0],      // ID
      dateStr,          // 日付（操作日時）
      toolData[2],      // 資材名(道具名)
      toolData[3],      // 登録番号
      actionLog,        // ★使う作業の列に履歴内容を記録
      toolData[5],      // 写真URL
      params.newStatus, // 新しい稼働状況
      toolData[7],      // 場所看板名
      toolData[8]       // 場所看板id
    ]);
  }

  // システム用ログにも記録
  writeLog(params.userName, "道具状態更新", toolData[2], `${params.newStatus}に変更`);

  return true;
}
// ==========================================
// 🪚 道具マスタの編集
// ==========================================
function editToolInMaster(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('道具マスタ');
  if (!sheet) throw new Error("「道具マスタ」シートが見つかりません。");
  
  const data = sheet.getDataRange().getValues();
  let targetRowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === params.toolId) { targetRowIndex = i + 1; break; }
  }
  if (targetRowIndex === -1) throw new Error("指定された道具が見つかりません。");
  
  // B列(2):日付, C列(3):資材名, D列(4):登録番号, E列(5):使う作業 を上書き
  sheet.getRange(targetRowIndex, 2).setValue(params.date);
  sheet.getRange(targetRowIndex, 3).setValue(params.name);
  sheet.getRange(targetRowIndex, 4).setValue(params.regNumber);
  sheet.getRange(targetRowIndex, 5).setValue(params.works);
  
  writeLog(params.userName, "道具編集", params.name, `番号: ${params.regNumber}`);
  return true;
}

// ==========================================
// 🪚 道具マスタからの削除
// ==========================================
function deleteToolFromMaster(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('道具マスタ');
  if (!sheet) throw new Error("「道具マスタ」シートが見つかりません。");
  
  const data = sheet.getDataRange().getValues();
  let targetRowIndex = -1;
  let toolName = "";
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === params.toolId) {
      targetRowIndex = i + 1;
      toolName = data[i][2]; // ログ用に名前を取得
      break; 
    }
  }
  if (targetRowIndex === -1) throw new Error("指定された道具が見つかりません。");
  
  sheet.deleteRow(targetRowIndex); // 行ごと削除
  writeLog(params.userName, "道具削除", toolName, "マスタから削除");
  return true;
}
// ==========================================
// 🚜 農機・車両マスタの編集
// ==========================================
function editMachineInMaster(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('農機マスタ');
  const data = sheet.getDataRange().getValues();
  let targetRowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === params.machineId) { targetRowIndex = i + 1; break; }
  }
  if (targetRowIndex === -1) throw new Error("指定された農機が見つかりません。");
  
  // B列(2):農機名, C列(3):型式, D列(4):作業分類, J列(10):購入年月日, R列(18):機械番号 を上書き
  sheet.getRange(targetRowIndex, 2).setValue(params.name);
  sheet.getRange(targetRowIndex, 3).setValue(params.model);
  sheet.getRange(targetRowIndex, 4).setValue(params.workCategory);
  sheet.getRange(targetRowIndex, 10).setValue(params.purchaseDate);
  sheet.getRange(targetRowIndex, 18).setValue(params.machineNumber);
  return true;
}

// ==========================================
// 🚜 農機・車両マスタからの削除
// ==========================================
function deleteMachineFromMaster(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('農機マスタ');
  const data = sheet.getDataRange().getValues();
  let targetRowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === params.machineId) { targetRowIndex = i + 1; break; }
  }
  if (targetRowIndex === -1) throw new Error("指定された農機が見つかりません。");
  
  sheet.deleteRow(targetRowIndex); // 行ごと削除
  return true;
}
// ==========================================
// 🗺️ 短縮URLを展開する関数（V7：極限シンプル・クラッシュ回避版）
// ==========================================
function expandGoogleMapUrl(params) {
  try {
    var tempUrl = params.url;
    
    // 偽装ヘッダーやCookieを一切やめ、純粋に転送(Location)だけを追いかける
    for (var i = 0; i < 10; i++) {
      var res = UrlFetchApp.fetch(tempUrl, {
        followRedirects: false, 
        muteHttpExceptions: true
      });
      
      var code = res.getResponseCode();
      if (code >= 300 && code < 400) {
        var loc = res.getHeaders()['Location'] || res.getHeaders()['location'];
        if (loc) {
          tempUrl = (loc.indexOf('http') !== 0) ? "https://www.google.com" + (loc.indexOf('/') === 0 ? "" : "/") + loc : loc;
        } else { break; }
      } else {
        break; // 転送がなければ終了
      }
    }
    
    // 最終的にたどり着いたURLをそのままフロントエンドにパス出し！
    return "EXPANDED:" + tempUrl; 
    
  } catch(e) {
    return "V7_ERROR: " + e.toString() + " | URL: " + params.url;
  }
}