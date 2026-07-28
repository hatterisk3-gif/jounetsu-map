/**
 * 情熱MAP 統合API (管理者・作業員 共通)
 */
const MASTER_SPREADSHEET_ID = "1Kfg5JzNE8pZVQuyuHExz1Q00vzd75MmWrtKLLHUG89c"; // マスター・スプレッドシートのID
let TENANT_SS = null;

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    let result = null;

    if (params.spreadsheetId && params.spreadsheetId !== 'undefined' && params.spreadsheetId !== 'null' && params.spreadsheetId !== '') {
      TENANT_SS = SpreadsheetApp.openById(params.spreadsheetId);
    }

    if (action === "login") result = checkLogin(params.orgId, params.userId, params.password);
    else if (action === "getInitData") result = getInitData(); 
    else if (action === "savePolygon") result = savePolygon(params); 
    else if (action === "savePolygonBatch") result = savePolygonBatch(params); // ★一括保存用
    else if (action === "updatePolygon") result = updatePolygon(params); 
    else if (action === "deletePolygon") result = deletePolygonData(params.id, params.userName);
    else if (action === "deletePolygonBatch") result = deletePolygonBatchData(params.ids, params.userName);
    else if (action === "saveRecord") result = saveRecord(params.id, params.name, params.author, params.recordType, params.data, params.photos);
    else if (action === "updateRecordItem") result = updateRecordItem(params.id, params.recordId, params.recordType, params.data, params.photos, params.keptUrls, params.userName);
    else if (action === "deleteRecordItem") result = deleteRecordItem(params.id, params.recordId, params.userName);
    else if (action === "addFieldStatus") result = addFieldStatusToMaster(params.statusName);
    else if (action === "addCrop") result = addCropToMaster(params.cropData);
    else if (action === "deleteCrop") result = deleteCropFromMaster(params.cropName);
    else if (action === "mergeFields") result = mergeFields(params.baseId, params.targetId, params.userName);
    else if (action === "splitField") result = splitField(params);
    else if (action === "saveTouki") result = saveToukiData(params.toukiData, params.targetHojoId);
    else if (action === "getToukiDetails") result = getToukiDetails(params.toukiIds);
    else if (action === "manageMaster") result = manageMasterData(params.masterType, params.manageAction, params.value, params.userName);
    else if (action === "saveGlobalHarvest") result = saveGlobalHarvest(params);
    else if (action === "markHarvestQtyLotResolved") result = markHarvestQtyLotResolved(params);
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
    else if (action === "saveCultivationPlans") result = saveCultivationPlans(params.year, params.crop, params.planDataArray);
    else if (action === "getCultivationPlans") result = getCultivationPlans(params.year, params.crop);
    else if (action === "executeCultivationPlans") result = executeCultivationPlans(params);
    else if (action === "getSavedCultivationPlanList") result = getSavedCultivationPlanList();
    else if (action === "deleteSavedCultivationPlans") result = deleteSavedCultivationPlans(params.year, params.crop);
    else if (action === "getCultivationHarvestSummary") result = getCultivationHarvestSummary(params.year);
    else if (action === "getCultivationRidgeParamsForField") result = getCultivationRidgeParamsForField(params.fieldId || params.id);
    else if (action === "getCultivationMaster") result = getCultivationMaster();
    else if (action === "appendCultivationMaster") result = appendCultivationMaster(params);
    else if (action === "saveCultivationPreset") result = saveCultivationPreset(params);
    else if (action === "deleteCultivationPreset") result = deleteCultivationPreset(params);
    else if (action === "renameCultivationPreset") result = renameCultivationPreset(params);
    else if (action === "renameCultivationVariety") result = renameCultivationVariety(params);
    else if (action === "saveCroptypeDB") result = saveCroptypeDB(params);
    else if (action === "saveCroptypeDBBatch") result = saveCroptypeDBBatch(params);
    else if (action === "saveVarietyWithFile") result = saveVarietyWithFile(params);
    else if (action === "saveCroptypeWithFile") result = saveCroptypeWithFile(params);
    else if (action === "editToolInMaster") result = editToolInMaster(params);
    else if (action === "deleteToolFromMaster") result = deleteToolFromMaster(params);
    else if (action === "editMachineInMaster") result = editMachineInMaster(params);
    else if (action === "deleteMachineFromMaster") result = deleteMachineFromMaster(params);
    else if (action === 'getMapCoordinates') result = getMapCoordinates(params);
    else if (action === 'parseWithGemini') result = parseWithGemini(params);
    else if (action === 'parseCropImageWithGemini') result = parseCropImageWithGemini(params);
    else if (action === "getPolygonDrawingHistory") result = getPolygonDrawingHistory(params);
    else if (action === "saveFieldMemo") result = saveFieldMemo(params);
    else if (action === "getFieldMemoHistory") result = getFieldMemoHistory(params);
    else if (action === "saveTrackingData") result = saveTrackingData(params);
    else if (action === "getTrackingData") result = getTrackingData(params);
    else if (action === "getOpenClockInStatus") result = getOpenClockInStatus(params);
    else if (action === "getWorkRecordTimeHints") result = getWorkRecordTimeHints(params);
    else if (action === "resetAllManureStatus") result = resetAllManureStatus(params.userName);
    else if (action === "changeId") result = changeId(params.userId, params.password, params.newId);
    else if (action === "changePassword") result = changePassword(params.userId, params.currentPassword, params.newPassword);
    else if (action === "machine_loadAll") result = machine_loadAll();
    else if (action === "machine_saveMachine") result = machine_saveMachine(params);
    else if (action === "machine_saveStatus") result = machine_saveStatus(params);
    else if (action === "machine_saveLocation") result = machine_saveLocation(params);
    else if (action === "machine_saveMaintenance") result = machine_saveMaintenance(params);
    else if (action === "machine_saveMaintenanceSetting") result = machine_saveMaintenanceSetting(params);
    else if (action === "machine_saveFuel") result = machine_saveFuel(params);
    else if (action === "vehicle_loadAll") result = vehicle_loadAll();
    else if (action === "vehicle_saveVehicle") result = vehicle_saveVehicle(params);
    else if (action === "vehicle_saveLocation") result = vehicle_saveLocation(params);
    else if (action === "vehicle_saveStatus") result = vehicle_saveStatus(params);
    else if (action === "saveTempWorkRecord") result = saveTempWorkRecord(params);
    else if (action === "getTempWorkRecord") result = getTempWorkRecord(params);
    else if (action === "clearTempWorkRecord") result = clearTempWorkRecord(params);
    else if (action === "getPersonalSchedule") result = getPersonalSchedule(params);
    else if (action === "addPersonalScheduleItem") result = addPersonalScheduleItem(params);
    else if (action === "updatePersonalScheduleItem") result = updatePersonalScheduleItem(params);
    else if (action === "deletePersonalScheduleItem") result = deletePersonalScheduleItem(params);
    else if (action === "saveUserGmail") result = saveUserGmail(params);
    else if (action === "getUserGmail") result = getUserGmail(params);
    else if (action === "getTodayGoogleCalendarEvents") result = getTodayGoogleCalendarEvents(params);
    else if (action === "getScriptAuthorizationInfo") result = getScriptAuthorizationInfo(params);
    else if (action === "getLotList") result = getLotList(params);
    else if (action === "updateLotRecord") result = updateLotRecord(params);



    return ContentService.createTextOutput(JSON.stringify({status: "success", data: result})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

function parseWithGemini(params) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません。GASのスクリプトプロパティを確認してください。');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  const prompt = `
以下の自由記述テキストから、作業記録に必要な情報を抽出・推測し、必ず提供されたリストの中にある名前に変換してください。

【ユーザーの入力テキスト】
"${params.text}"

【マスターデータ（この中から選ぶ）】
- 作業名リスト: ${JSON.stringify(params.workNames)}
- 作物名リスト: ${JSON.stringify(params.cropNames)}
- 圃場名リスト: ${JSON.stringify(params.fieldNames)}

【抽出ルール】
1. workName: 作業名リストの中で最も意味が近いものを1つ選ぶ。該当がなければ null
2. cropName: 作物名リストの中で最も意味が近いものを1つ選ぶ。該当がなければ null
3. polyId: 圃場名リストの中で最も意味が近いものを選び、その id を返す。該当がなければ null
4. startTime / endTime: "10時から2時間"などの表現から開始時間と終了時間（HH:mm形式）を推測する。終了時間が指定されていない「2時間」のような場合は、現在時刻を終了とし、そこから逆算して開始時間を出す。抽出できなければ null

【現在時刻】
${Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss")}

【出力フォーマット】
以下のJSONフォーマットのみを出力してください（マークダウンのコードブロックは不要です）。
{
  "workName": "該当する作業名",
  "cropName": "該当する作物名",
  "polyId": "該当する圃場ID",
  "startTime": "HH:mm",
  "endTime": "HH:mm"
}
`;

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(`Gemini API Error: ${responseCode} - ${responseBody}`);
  }

  const json = JSON.parse(responseBody);
  if (!json.candidates || json.candidates.length === 0) {
    throw new Error('Geminiから有効な回答が得られませんでした。');
  }

  let text = json.candidates[0].content.parts[0].text.trim();
  // マークダウンの \`\`\`json が含まれている場合は除去する
  if (text.startsWith('\`\`\`json')) {
    text = text.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
  } else if (text.startsWith('\`\`\`')) {
    text = text.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Geminiの出力がJSON形式ではありませんでした: ' + text);
  }
}

function parseCropImageWithGemini(params) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません。GASのスクリプトプロパティを確認してください。');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  // トークン節約: 指示は短く、スキーマは最小限
  const prompt =
`作型表画像から播種/定植/収穫を抽出。産地=${params.climate || '一般地'}（画像に産地があれば優先）。
ルール:
- ずらし巻き・複数期間は type を分割。各 type の sowing/planting は最大1期間。
- 月=1-12, period="上"|"中"|"下"。期間は start_*/end_*。
- maker/crop/climate/variety があれば文字列、characteristics は短い配列。無い項目は null。
JSONのみ:
{"maker":null,"crop":null,"climate":null,"variety":null,"characteristics":[],"types":[{"sowing":[{"start_month":1,"start_period":"中","end_month":2,"end_period":"上"}],"planting":[{"start_month":3,"start_period":"上","end_month":3,"end_period":"中"}],"harvesting":[{"start_month":5,"start_period":"上","end_month":6,"end_period":"下"}]}]}`;

  const payloadParts = [{ text: prompt }];

  // 画像は最大3枚まで（それ以上はトークン急増）
  const MAX_AI_FILES = 3;
  if (params.files && Array.isArray(params.files)) {
    params.files.slice(0, MAX_AI_FILES).forEach(f => {
      payloadParts.push({
        inlineData: {
          mimeType: f.mimeType,
          data: f.base64Data
        }
      });
    });
  } else if (params.base64Data) {
    payloadParts.push({
      inlineData: {
        mimeType: params.mimeType,
        data: params.base64Data
      }
    });
  }

  const payload = {
    contents: [{ parts: payloadParts }],
    generationConfig: {
      // 作型表OCRは深い推論不要。デフォルト high thinking がトークンの主因
      thinkingConfig: { thinkingLevel: 'minimal' },
      // 表読み取りは medium で十分なことが多い（high=約2倍トークン）
      mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
      responseMimeType: 'application/json',
      maxOutputTokens: 4096,
      temperature: 0
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseBody = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(`Gemini API Error: ${responseCode} - ${responseBody}`);
  }

  const json = JSON.parse(responseBody);
  if (!json.candidates || json.candidates.length === 0) {
    throw new Error('Geminiから有効な回答が得られませんでした。');
  }

  // thinking 有効時は text part 以外が混ざる場合がある
  const parts = (json.candidates[0].content && json.candidates[0].content.parts) || [];
  const textPart = parts.find(p => p.text && !p.thought) || parts.find(p => p.text);
  if (!textPart || !textPart.text) {
    throw new Error('Geminiからテキスト回答が得られませんでした。');
  }

  let text = textPart.text.trim();
  if (text.startsWith('\`\`\`json')) {
    text = text.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
  } else if (text.startsWith('\`\`\`')) {
    text = text.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim();
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Geminiの出力がJSON形式ではありませんでした: ' + text);
  }
}

function writeLog(user, action, target, detail) {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('操作ログ');
  if (!sheet) {
    sheet = ss.insertSheet('操作ログ');
    sheet.appendRow(["日時", "ユーザー", "操作内容", "対象", "詳細"]);
    sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#e0e0e0");
  }
  const now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
  sheet.appendRow([now, user || "不明", action, target, detail]);
}

function checkLogin(orgId, userId, password) {
  // 組織IDは無効化されているためチェックをスキップします
  
  let masterSS;
  try {
    masterSS = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
  } catch (e) {
    return { success: false, message: "マスターデータベースにアクセスできません" };
  }
  
  const masterSheet = masterSS.getSheetByName('組織一覧');
  if (!masterSheet) return { success: false, message: "マスターDBに「組織一覧」シートがありません" };
  
  const masterData = masterSheet.getDataRange().getValues();
  let targetSpreadsheetId = null;
  
  for (let i = 1; i < masterData.length; i++) {
    if (String(masterData[i][0]) === String(orgId)) {
      targetSpreadsheetId = masterData[i][2]; // C列がスプレッドシートID
      break;
    }
  }
  
  if (!targetSpreadsheetId) {
    // 組織ID撤廃のため、1行目のスプレッドシートを利用するか、マスター自体を利用する
    if (masterData.length > 1) {
      targetSpreadsheetId = masterData[1][2];
    }
    if (!targetSpreadsheetId) {
      targetSpreadsheetId = MASTER_SPREADSHEET_ID; // 組織一覧が空の場合はマスター自体をDBとして扱う
    }
  }
  
  // URL形式の場合はスプレッドシートIDを抽出する
  if (targetSpreadsheetId.includes('spreadsheets/d/')) {
    const match = targetSpreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      targetSpreadsheetId = match[1];
    }
  }
  
  // テナントDBを開く
  try {
    TENANT_SS = SpreadsheetApp.openById(targetSpreadsheetId);
  } catch(e) {
    return { success: false, message: "組織のデータベースにアクセスできません" };
  }
  
  const sheet = TENANT_SS.getSheetByName('名簿');
  if (!sheet) throw new Error("組織DBに「名簿」シートが見つかりません");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { 
    if (String(data[i][0]) === String(userId) && String(data[i][1]) === String(password)) {
      writeLog(data[i][2], "ログイン", "システム", "ログイン成功");
      return { success: true, name: data[i][2], role: data[i][3] || "作業員", spreadsheetId: targetSpreadsheetId }; 
    }
  }
  return { success: false, message: "IDまたはパスワードが正しくありません" };
}

// ==========================================
// パスワード変更
// ==========================================
function changePassword(userId, currentPassword, newPassword) {
  if (!userId || !currentPassword || !newPassword) {
    return { success: false, message: "必須項目が入力されていません" };
  }
  if (newPassword.length < 4) {
    return { success: false, message: "新しいパスワードは4文字以上で入力してください" };
  }
  const ss = TENANT_SS;
  if (!ss) return { success: false, message: "データベースに接続できません" };
  const sheet = ss.getSheetByName('名簿');
  if (!sheet) return { success: false, message: "名簿シートが見つかりません" };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId) && String(data[i][1]) === String(currentPassword)) {
      sheet.getRange(i + 1, 2).setValue(newPassword); // B列(パスワード)を更新
      writeLog(data[i][2], "パスワード変更", "システム", "パスワードを変更しました");
      return { success: true, message: "パスワードを変更しました" };
    }
  }
  return { success: false, message: "現在のパスワードが正しくありません" };
}

// ==========================================
// 初期データ取得
// ==========================================
function getInitData() {
  const ss = TENANT_SS;
  
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

  // 拠点マスタの自動移行処理（失敗しても圃場読込は続ける）
  try {
    ensureLocationMasterSheet_();
    let locSheet = ss.getSheetByName('拠点マスタ');
    
    if (locSheet && locSheet.getLastRow() <= 1) {
      const fieldSheet = ss.getSheetByName('圃場設定マスタ');
      if (fieldSheet) {
        const fieldData = fieldSheet.getDataRange().getValues();
        let locs = new Set();
        for (let i = 1; i < fieldData.length; i++) {
          if (fieldData[i][0]) locs.add(String(fieldData[i][0]).trim());
        }
        locs.forEach(l => {
          if (l !== '拠点名' && l !== '拠点') {
            // appendRow の列数不一致を避ける
            const r = locSheet.getLastRow() + 1;
            locSheet.getRange(r, 1, 1, 4).setValues([[l, '', '', '']]);
          }
        });
        // 移行後、圃場設定マスタのA列(値のみ)をクリアする（ヘッダー行は残す）
        if (fieldData.length > 1) {
          fieldSheet.getRange(2, 1, fieldData.length - 1, 1).clearContent();
        }
      }
    }
  } catch (e) {
    console.warn('拠点マスタ移行スキップ:', e);
  }

  let locationDetails = [];
  try { locationDetails = readLocationMasterDetails_(); } catch (e) {
    console.warn('拠点マスタ読み込みスキップ:', e);
    locationDetails = [];
  }
  const pdl = {
    locations: locationDetails.map(l => l.name),
    locationDetails: locationDetails,
    workCategories: Array.from(new Set(getCol(['作業カテゴリマスタ'], 0))).length > 0 ? Array.from(new Set(getCol(['作業カテゴリマスタ'], 0))) : ["圃場作業", "事務作業", "保全・整備"],
    conditions: getCol(['圃場設定マスタ', '圃場条件'], 1),
    statuses: getCol(['圃場設定マスタ', '稼働状況'], 2),
    stages: getCol(['生育記録マスタ', '栽培ステージ選択'], 2),
    signFunctionsMaster: getCol(['看板マスタ', '看板機能マスタ', '看板機能'], 0), // ★ここを追加！看板マスタのA列を取得します
    machineGroups: (function () {
      try { return getMachineGroupMasterList_(); } catch (e) { return ['農業機械', '農機インプルメント', '出荷機械']; }
    })(),
    machineTypes: (function () {
      try { return getMachineTypeMasterList_(); } catch (e) { return ['トラクター', 'ドローン']; }
    })(),
    machineCategories: (function () {
      try { return getMachineTypeMasterList_(); } catch (e) { return ['トラクター', 'ドローン']; }
    })()
  };
  
  let workMaster = [];
  let workStatuses = [];
  let containerNames = [];
  let maintenanceContents = []; 
  
  const workSheet = ss.getSheetByName('作業マスタ');
  if (workSheet) {
    const data = workSheet.getDataRange().getValues();
    if (data.length > 0) {
      const headers = data[0].map(h => String(h).trim()); 
      
      const idxName = headers.indexOf('作業名');
      const idxCrop = findWorkCropColumnIndex_(headers);
      const idxDetail = findWorkDetailColumnIndex_(headers);
      const idxStatus = headers.indexOf('進捗状況');
      const idxContainer = headers.indexOf('コンテナ名');
      const idxMaintenance = headers.indexOf('整備内容'); 
      // 実シートの列名は「担当部署」。過去互換でカテゴリ系ヘッダーも許容する
      const idxCategory = findWorkCategoryColumnIndex_(headers);

      for (let i = 1; i < data.length; i++) {
        let wName = idxName >= 0 ? String(data[i][idxName] || "").trim() : "";
        if (wName) {
          let cat = idxCategory >= 0 && data[i][idxCategory] ? String(data[i][idxCategory]).trim() : "";
          if (!cat) cat = "圃場作業"; // デフォルト

          workMaster.push({ 
            category: cat, 
            name: wName,
            cropName: idxCrop >= 0 ? String(data[i][idxCrop] || "").trim() : "",
            detailWorks: idxDetail >= 0 && data[i][idxDetail] ? String(data[i][idxDetail]).trim() : ""
          });
        }
        if (idxStatus >= 0 && data[i][idxStatus]) workStatuses.push(data[i][idxStatus]);
        if (idxContainer >= 0 && data[i][idxContainer]) containerNames.push(data[i][idxContainer]);
        if (idxMaintenance >= 0 && data[i][idxMaintenance]) maintenanceContents.push(String(data[i][idxMaintenance]).trim()); 
      }
    }
  }
  
  pdl.workMaster = workMaster;
  pdl.signFunctions = [];
  pdl.workStatuses = [...new Set(workStatuses)].filter(String);
  if (pdl.workStatuses.length === 0) pdl.workStatuses = ['未着手', '途中', '完了'];
  // コンテナマスタを正とし、旧・作業マスタのコンテナ名は移行用に渡す
  pdl.containers = readContainerMasterList_(containerNames);
  pdl.containerNames = [...new Set(pdl.containers.map(c => c.name))];
  pdl.maintenanceContents = [...new Set(maintenanceContents)].filter(String); 

  pdl.crops = readMergedCropMasterList_();
pdl.signLinks = {};
  const signSh = ss.getSheetByName('看板');
  if(signSh) {
     const sd = signSh.getDataRange().getValues();
     for(let i=1; i<sd.length; i++) {
        if(sd[i][0]) pdl.signLinks[sd[i][0]] = String(sd[i][8] || ""); // I列(インデックス8)
     }
  }
// 農機マスタの読み込み（機械管理と統一フィールド）
  // ※列拡張エラーで getInitData 全体を落とさない
  pdl.machines = [];
  try {
    const macSh = ensureNoukiMasterSheet();
    if (macSh) {
      const md = macSh.getDataRange().getValues();
      for (let i = 1; i < md.length; i++) {
        if (md[i][1]) {
          try { pdl.machines.push(parseNoukiMachineRow(md[i])); } catch (rowErr) {
            console.warn('農機行スキップ:', md[i][0], rowErr);
          }
        }
      }
    }
  } catch (e) {
    console.warn('農機マスタ読み込みスキップ:', e);
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
       const unitIdx = head.indexOf('内容単位');
       const qtyIdx = head.indexOf('内容個数');
       for (let i = 1; i < data.length; i++) {
         if (data[i][8] !== '完了' && data[i][8] !== '出荷済' && data[i][0]) {
           activeLots.push({
             lotId: data[i][0],
             containerType: data[i][5],
             remain: data[i][7],
             location: data[i][locIdx] || '未設定',
             contentUnit: unitIdx >= 0 ? (data[i][unitIdx] || '') : (data[i][10] || ''),
             contentQty: qtyIdx >= 0 ? (data[i][qtyIdx] != null ? data[i][qtyIdx] : '') : (data[i][11] != null ? data[i][11] : '')
           });
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
// 拠点マスタ（県・市・産地付き）
// =========================================
function ensureLocationMasterSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('拠点マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('拠点マスタ');
    sheet.appendRow(['拠点名', '県', '市', '産地']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#e0e0e0');
    return sheet;
  }

  const a1Val = String(sheet.getRange(1, 1).getValue() || '').trim();
  if (a1Val !== '拠点名' && a1Val !== '拠点') {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1).setValue('拠点名').setFontWeight('bold').setBackground('#e0e0e0');
  }

  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  if (headers.indexOf('県') === -1) {
    const col = headers.length + 1;
    sheet.getRange(1, col).setValue('県').setFontWeight('bold').setBackground('#e0e0e0');
    headers.push('県');
  }
  if (headers.indexOf('市') === -1) {
    const col = headers.length + 1;
    sheet.getRange(1, col).setValue('市').setFontWeight('bold').setBackground('#e0e0e0');
    headers.push('市');
  }
  if (headers.indexOf('産地') === -1) {
    const col = headers.length + 1;
    sheet.getRange(1, col).setValue('産地').setFontWeight('bold').setBackground('#e0e0e0');
  }
  return sheet;
}

function parseLocationClimates_(val) {
  if (Array.isArray(val)) {
    return val.map(v => String(v || '').trim()).filter(Boolean);
  }
  const s = String(val || '').trim();
  if (!s) return [];
  return s.split(/[,、\/／|｜]/).map(v => v.trim()).filter(Boolean);
}

function formatLocationClimates_(climates) {
  return parseLocationClimates_(climates).join(',');
}

function readLocationMasterDetails_() {
  const sheet = ensureLocationMasterSheet_();
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const idxName = 0;
  const idxPref = headers.indexOf('県');
  const idxCity = headers.indexOf('市');
  const idxClimate = headers.indexOf('産地');
  const results = [];
  const seen = {};
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][idxName] || '').trim();
    if (!name || name === '拠点名' || name === '拠点') continue;
    if (seen[name]) continue;
    seen[name] = true;
    const climates = idxClimate >= 0 ? parseLocationClimates_(data[i][idxClimate]) : [];
    results.push({
      name: name,
      prefecture: idxPref >= 0 ? String(data[i][idxPref] || '').trim() : '',
      city: idxCity >= 0 ? String(data[i][idxCity] || '').trim() : '',
      climate: climates.join(','),
      climates: climates
    });
  }
  return results;
}

function ensureMachineTypeMasterSheet_() {
  const ss = TENANT_SS;
  // 表示名は「機械カテゴリ」。既存「機種マスタ」を正本とする
  let sheet = ss.getSheetByName('機種マスタ');
  if (!sheet) {
    // グループ用の誤名シートが残っていない場合のみ「機械カテゴリマスタ」をタイプ用とみなす
    const named = ss.getSheetByName('機械カテゴリマスタ');
    const groupSheet = ss.getSheetByName('機械グループマスタ');
    if (named && groupSheet) sheet = named;
  }
  if (!sheet) {
    sheet = ss.insertSheet('機種マスタ');
    sheet.appendRow(['カテゴリ名']);
    const defaults = ['トラクター', 'ドローン'];
    const macSh = ss.getSheetByName('農機マスタ');
    const fromMachines = [];
    if (macSh && macSh.getLastRow() > 1) {
      const md = macSh.getDataRange().getValues();
      // 機種（機械カテゴリ）列 AA = index 26
      for (let i = 1; i < md.length; i++) {
        const t = String(md[i][26] || '').trim();
        if (t && fromMachines.indexOf(t) < 0) fromMachines.push(t);
      }
    }
    const seed = Array.from(new Set(defaults.concat(fromMachines)));
    seed.forEach(t => sheet.appendRow([t]));
  }
  return sheet;
}

function getMachineTypeMasterList_() {
  try {
    const sheet = ensureMachineTypeMasterSheet_();
    if (!sheet || sheet.getLastRow() <= 1) return ['トラクター', 'ドローン'];
    const data = sheet.getDataRange().getValues();
    return data.slice(1).map(r => String(r[0] || '').trim()).filter(String);
  } catch (e) {
    return ['トラクター', 'ドローン'];
  }
}

function ensureMachineGroupMasterSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('機械グループマスタ');
  // 誤って作った「機械カテゴリマスタ」がグループ用だった場合の移行
  if (!sheet) {
    const wrong = ss.getSheetByName('機械カテゴリマスタ');
    if (wrong && wrong.getLastRow() > 1) {
      const vals = wrong.getDataRange().getValues().slice(1).map(r => String(r[0] || '').trim()).filter(Boolean);
      const looksLikeGroup = vals.some(v => v === '農業機械' || v === '農機インプルメント' || v === '出荷機械');
      const looksLikeType = vals.some(v => v === 'トラクター' || v === 'ドローン');
      if (looksLikeGroup && !looksLikeType) {
        wrong.setName('機械グループマスタ');
        sheet = wrong;
      }
    } else if (wrong && ss.getSheetByName('機種マスタ')) {
      // 機種マスタがあるなら、空の機械カテゴリマスタもグループ用誤名とみなす
      wrong.setName('機械グループマスタ');
      sheet = wrong;
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet('機械グループマスタ');
    sheet.appendRow(['グループ名']);
    const defaults = ['農業機械', '農機インプルメント', '出荷機械'];
    const macSh = ss.getSheetByName('農機マスタ');
    const fromMachines = [];
    if (macSh && macSh.getLastRow() > 1) {
      const md = macSh.getDataRange().getValues();
      // 機械グループ列 = index 25
      for (let i = 1; i < md.length; i++) {
        const g = String(md[i][25] || '').trim();
        if (g && fromMachines.indexOf(g) < 0) fromMachines.push(g);
      }
    }
    const seed = Array.from(new Set(defaults.concat(fromMachines)));
    seed.forEach(g => sheet.appendRow([g]));
  }
  return sheet;
}

function getMachineGroupMasterList_() {
  try {
    const sheet = ensureMachineGroupMasterSheet_();
    if (!sheet || sheet.getLastRow() <= 1) return ['農業機械', '農機インプルメント', '出荷機械'];
    const data = sheet.getDataRange().getValues();
    return data.slice(1).map(r => String(r[0] || '').trim()).filter(String);
  } catch (e) {
    return ['農業機械', '農機インプルメント', '出荷機械'];
  }
}

function renameMachineGroupInMachines_(oldName, newName) {
  const sheet = TENANT_SS.getSheetByName('農機マスタ');
  if (!sheet || sheet.getLastRow() <= 1) return 0;
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][25] || '').trim() === oldName) {
      sheet.getRange(i + 1, 26).setValue(newName);
      count++;
    }
  }
  return count;
}

/// =========================================
// マスタ管理（★看板マスタの処理を追加）
// =========================================
function manageMasterData(masterType, manageAction, value, userName) {
  const ss = TENANT_SS;
  let sheetName = "";
  // 互換: 旧 machineCategory は機械グループ、machineType は機械カテゴリ（旧機種）
  if (masterType === 'machineCategory') masterType = 'machineGroup';

  // コンテナマスタの追加・編集・削除は管理者のみ
  if (masterType === 'container' && (manageAction === 'add' || manageAction === 'edit' || manageAction === 'delete')) {
    const uname = String(userName || '').trim();
    if (uname !== 'system' && !checkAdminRole(uname)) {
      throw new Error('コンテナマスタの変更は管理者のみ可能です');
    }
  }
  
  if (masterType === 'crop') sheetName = '作物マスタ';
  else if (masterType === 'tool') sheetName = '道具マスタ';
  else if (masterType === 'material') sheetName = '資材マスタ';
  else if (masterType === 'work') sheetName = '作業マスタ';
  else if (masterType === 'sign') sheetName = '看板マスタ';
  else if (masterType === 'location') sheetName = '拠点マスタ';
  else if (masterType === 'workCategory') sheetName = '作業カテゴリマスタ';
  else if (masterType === 'machineType') sheetName = '機種マスタ';
  else if (masterType === 'machineGroup') sheetName = '機械グループマスタ';
  else if (masterType === 'container') sheetName = 'コンテナマスタ';
  
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
      if (masterType === 'workCategory') {
          sheet = ss.insertSheet(sheetName);
          sheet.appendRow(["カテゴリ名"]);
          sheet.appendRow(["圃場作業"]);
          sheet.appendRow(["事務作業"]);
          sheet.appendRow(["保全・整備"]);
      } else if (masterType === 'crop') {
          sheet = ss.insertSheet(sheetName);
          sheet.appendRow(["作物名", "栽植密度"]);
      } else if (masterType === 'container') {
          sheet = ensureContainerMasterSheet_();
      } else if (masterType === 'machineType') {
          sheet = ensureMachineTypeMasterSheet_();
      } else if (masterType === 'machineGroup') {
          sheet = ensureMachineGroupMasterSheet_();
      } else if (masterType === 'location') {
          sheet = ensureLocationMasterSheet_();
      } else {
          throw new Error(`${sheetName}が見つかりません`);
      }
  }

  if (masterType === 'location') {
    sheet = ensureLocationMasterSheet_();
  }
  if (masterType === 'machineType') {
    sheet = ensureMachineTypeMasterSheet_();
  }
  if (masterType === 'machineGroup') {
    sheet = ensureMachineGroupMasterSheet_();
  }
  if (masterType === 'container') {
    sheet = ensureContainerMasterSheet_();
  }

  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(h => String(h).trim());

  if (manageAction === 'add') {
    if (masterType === 'crop') {
      const cropName = String((value && value.name) || '').trim();
      if (!cropName) throw new Error('作物名を入力してください');
      const density = Number((value && value.density) || 0) || 0;
      const existing = sheet.getDataRange().getValues();
      for (let i = 1; i < existing.length; i++) {
        if (String(existing[i][0] || '').trim() === cropName) {
          throw new Error(`作物名「${cropName}」は既に登録されています`);
        }
      }
      sheet.appendRow([cropName, density]);
      syncCropNameInSeikuMaster_('', cropName, density); // 新規を生育記録マスタにも反映
    } else if (masterType === 'tool') {
      const newId = "TOOL-" + Utilities.getUuid().substring(0,6);
      sheet.appendRow([newId, value.name, "", value.workCategory, "", "", "", "", "", "所有", userName]);
    } else if (masterType === 'material') {
      const newId = "MAT-" + Utilities.getUuid().substring(0,6);
      sheet.appendRow([newId, value.name, value.workCategory, value.size, value.unit, "", "", "", "", "", "", userName]);
    } else if (masterType === 'work') {
      const workHeaders = ensureWorkMasterHeaders_(sheet);
      const workName = String(value.name || "").trim();
      if (workMasterNameExists_(sheet, workHeaders, workName)) {
        throw new Error(`作業名「${workName}」は既に登録されています`);
      }
      const newRow = new Array(workHeaders.length).fill("");
      applyWorkMasterValuesToRow_(newRow, workHeaders, value);
      sheet.appendRow(newRow);
    } else if (masterType === 'location') {
      const loc = (typeof value === 'object' && value) ? value : { name: value };
      const name = String(loc.name || '').trim();
      if (!name) throw new Error('拠点名を入力してください');
      const existing = readLocationMasterDetails_();
      if (existing.some(l => l.name === name)) {
        throw new Error(`拠点名「${name}」は既に登録されています`);
      }
      const row = new Array(headers.length).fill('');
      row[0] = name;
      const prefIdx = headers.indexOf('県');
      const cityIdx = headers.indexOf('市');
      const climIdx = headers.indexOf('産地');
      if (prefIdx >= 0) row[prefIdx] = String(loc.prefecture || '').trim();
      if (cityIdx >= 0) row[cityIdx] = String(loc.city || '').trim();
      if (climIdx >= 0) {
        const climates = loc.climates != null ? loc.climates : loc.climate;
        row[climIdx] = formatLocationClimates_(climates);
      }
      sheet.appendRow(row);
      writeLog(userName, "マスタ追加", name, `対象: ${sheetName}`);
    } else if (masterType === 'container') {
      const cont = (typeof value === 'object' && value) ? value : { name: value };
      const name = String(cont.name || '').trim();
      const crop = String(cont.crop || (Array.isArray(cont.crops) && cont.crops[0]) || cont.cropName || '').trim();
      if (!name) throw new Error('コンテナ種類を入力してください');
      if (!crop || crop === '共通' || crop === '__common__') {
        throw new Error('品目を選択してください（共通設定はできません）');
      }
      const existing = readContainerMasterList_();
      if (existing.some(c => c.name === name && c.crop === crop)) {
        throw new Error(`「${name}」×「${crop}」は既に登録されています`);
      }
      const contentUnit = String(cont.contentUnit || '').trim();
      const contentQty = (cont.contentQty != null && cont.contentQty !== '') ? Number(cont.contentQty) || 0 : '';
      sheet.appendRow([name, crop, contentUnit, contentQty === '' ? '' : contentQty]);
      writeLog(userName, "マスタ追加", name, `対象: ${sheetName} / 品目: ${crop}`);
    } else {
      // ★看板マスタなど、1列だけのシンプルなマスタ用
      sheet.appendRow([value]);
    }
    if (masterType !== 'location' && masterType !== 'container') {
      writeLog(userName, "マスタ追加", (value && value.name) || value, `対象: ${sheetName}`);
    }
  } 
  else if (manageAction === 'edit') {
    const data = sheet.getDataRange().getValues();
    if (masterType === 'work') {
      const workHeaders = ensureWorkMasterHeaders_(sheet);
      const keyIdx = workHeaders.indexOf('作業名');
      const originalName = String(value.originalName || "").trim();
      const newName = String((value.newData && value.newData.name) || "").trim();
      if (newName && newName !== originalName && workMasterNameExists_(sheet, workHeaders, newName, originalName)) {
        throw new Error(`作業名「${newName}」は既に登録されています`);
      }
      const latestData = sheet.getDataRange().getValues();
      for (let i = 1; i < latestData.length; i++) {
        if (keyIdx >= 0 && String(latestData[i][keyIdx]).trim() === originalName) {
          // 既存行をベースに必要な列だけ更新（担当部署など他列は維持）
          // getRange(row, column, numRows, numColumns) ※3つ目は行数
          const rowVals = latestData[i].slice();
          while (rowVals.length < workHeaders.length) rowVals.push("");
          applyWorkMasterValuesToRow_(rowVals, workHeaders, value.newData || {});
          const outRow = rowVals.slice(0, workHeaders.length);
          sheet.getRange(i + 1, 1, 1, outRow.length).setValues([outRow]);
          writeLog(userName, "マスタ編集", (value.newData && value.newData.name) || originalName, `対象: ${sheetName} (元: ${originalName})`);
          break;
        }
      }
    } else if (masterType === 'location') {
      const originalName = String(value.originalName || '').trim();
      const loc = value.newData || {};
      const newName = String(loc.name || '').trim();
      if (!newName) throw new Error('拠点名を入力してください');
      if (newName !== originalName) {
        const existing = readLocationMasterDetails_();
        if (existing.some(l => l.name === newName)) {
          throw new Error(`拠点名「${newName}」は既に登録されています`);
        }
      }
      const prefIdx = headers.indexOf('県');
      const cityIdx = headers.indexOf('市');
      const climIdx = headers.indexOf('産地');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === originalName) {
          sheet.getRange(i + 1, 1).setValue(newName);
          if (prefIdx >= 0) sheet.getRange(i + 1, prefIdx + 1).setValue(String(loc.prefecture || '').trim());
          if (cityIdx >= 0) sheet.getRange(i + 1, cityIdx + 1).setValue(String(loc.city || '').trim());
          if (climIdx >= 0) {
            const climates = loc.climates != null ? loc.climates : loc.climate;
            sheet.getRange(i + 1, climIdx + 1).setValue(formatLocationClimates_(climates));
          }
          writeLog(userName, "マスタ編集", newName, `対象: ${sheetName} (元: ${originalName})`);
          break;
        }
      }
    } else if (masterType === 'machineGroup') {
      const originalName = String(value.originalName || '').trim();
      const newName = String((value.newData && value.newData.name) || value.name || '').trim();
      if (!originalName) throw new Error('変更前のグループ名がありません');
      if (!newName) throw new Error('グループ名を入力してください');
      if (newName !== originalName) {
        const existing = getMachineGroupMasterList_();
        if (existing.indexOf(newName) >= 0) {
          throw new Error(`グループ名「${newName}」は既に登録されています`);
        }
      }
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === originalName) {
          sheet.getRange(i + 1, 1).setValue(newName);
          if (newName !== originalName) {
            renameMachineGroupInMachines_(originalName, newName);
          }
          writeLog(userName, "マスタ編集", newName, `対象: ${sheetName} (元: ${originalName})`);
          break;
        }
      }
    } else if (masterType === 'workCategory') {
      const originalName = String(value.originalName || '').trim();
      const newName = String((value.newData && value.newData.name) || value.name || '').trim();
      if (!originalName) throw new Error('変更前のカテゴリ名がありません');
      if (!newName) throw new Error('カテゴリ名を入力してください');
      if (newName !== originalName) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0] || '').trim() === newName) {
            throw new Error(`カテゴリ名「${newName}」は既に登録されています`);
          }
        }
      }
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === originalName) {
          sheet.getRange(i + 1, 1).setValue(newName);
          found = true;
          break;
        }
      }
      if (!found) throw new Error(`カテゴリ「${originalName}」が見つかりません`);
      if (newName !== originalName) {
        renameWorkMasterCategory_(originalName, newName);
      }
      writeLog(userName, "マスタ編集", newName, `対象: ${sheetName} (元: ${originalName})`);
    } else if (masterType === 'crop') {
      const originalName = String(value.originalName || '').trim();
      const newData = value.newData || value || {};
      const newName = String(newData.name || '').trim();
      const newDensity = (newData.density != null && newData.density !== '') ? Number(newData.density) || 0 : null;
      if (!originalName) throw new Error('変更前の作物名がありません');
      if (!newName) throw new Error('作物名を入力してください');
      if (newName !== originalName) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0] || '').trim() === newName) {
            throw new Error(`作物名「${newName}」は既に登録されています`);
          }
        }
      }
      let found = false;
      let densityToWrite = 0;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === originalName) {
          densityToWrite = (newDensity != null) ? newDensity : (Number(data[i][1]) || 0);
          sheet.getRange(i + 1, 1).setValue(newName);
          if (sheet.getLastColumn() >= 2) sheet.getRange(i + 1, 2).setValue(densityToWrite);
          found = true;
          break;
        }
      }
      if (!found) {
        // 作物マスタに無い場合は追記（生育記録マスタ側だけの旧データ向け）
        densityToWrite = (newDensity != null) ? newDensity : 0;
        sheet.appendRow([newName, densityToWrite]);
      }
      syncCropNameInSeikuMaster_(originalName, newName, densityToWrite);
      if (newName !== originalName) {
        renameWorkMasterCrop_(originalName, newName);
      }
      writeLog(userName, "マスタ編集", newName, `対象: ${sheetName} (元: ${originalName})`);
    } else if (masterType === 'container') {
      const originalName = String(value.originalName || '').trim();
      const originalCrop = String(value.originalCrop || '').trim();
      const newData = value.newData || value || {};
      const newName = String(newData.name || '').trim();
      const newCrop = String(newData.crop || (Array.isArray(newData.crops) && newData.crops[0]) || newData.cropName || '').trim();
      if (!originalName) throw new Error('変更前のコンテナ種類がありません');
      if (!originalCrop) throw new Error('変更前の品目がありません');
      if (!newName) throw new Error('コンテナ種類を入力してください');
      if (!newCrop || newCrop === '共通' || newCrop === '__common__') {
        throw new Error('品目を選択してください（共通設定はできません）');
      }
      if (newName !== originalName || newCrop !== originalCrop) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0] || '').trim() === newName && String(data[i][1] || '').trim() === newCrop) {
            throw new Error(`「${newName}」×「${newCrop}」は既に登録されています`);
          }
        }
      }
      const contentUnit = String(newData.contentUnit != null ? newData.contentUnit : '').trim();
      const contentQty = (newData.contentQty != null && newData.contentQty !== '') ? Number(newData.contentQty) || 0 : '';
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === originalName && String(data[i][1] || '').trim() === originalCrop) {
          sheet.getRange(i + 1, 1).setValue(newName);
          sheet.getRange(i + 1, 2).setValue(newCrop);
          sheet.getRange(i + 1, 3).setValue(contentUnit);
          sheet.getRange(i + 1, 4).setValue(contentQty === '' ? '' : contentQty);
          found = true;
          break;
        }
      }
      if (!found) throw new Error(`コンテナ「${originalName}」×品目「${originalCrop}」が見つかりません`);
      writeLog(userName, "マスタ編集", newName, `対象: ${sheetName} (元: ${originalName}/${originalCrop} → ${newName}/${newCrop})`);
    }
  } 
  else if (manageAction === 'delete') {
    const data = sheet.getDataRange().getValues();
    const targetVal = value.id || value.name || value;
    const targetCrop = (typeof value === 'object' && value) ? String(value.crop || '').trim() : '';
    
    const keyIdx = masterType === 'work' ? headers.indexOf('作業名') : 0;
    let deleted = false;

    for (let i = 1; i < data.length; i++) {
      let match = false;
      if (masterType === 'work') {
          if (keyIdx >= 0 && data[i][keyIdx] === targetVal) match = true;
      } else if (masterType === 'container') {
          const rowName = String(data[i][0] || '').trim();
          const rowCrop = String(data[i][1] || '').trim();
          if (rowName === String(targetVal || '').trim() && (!targetCrop || rowCrop === targetCrop)) match = true;
      } else if (masterType === 'location' || masterType === 'sign' || masterType === 'workCategory' || masterType === 'machineType' || masterType === 'machineGroup') {
          if (String(data[i][0] || '').trim() === String(targetVal || '').trim()) match = true;
      } else if (masterType === 'crop') {
          if (String(data[i][0] || '').trim() === String(targetVal || '').trim()) match = true;
      } else {
          if (data[i][0] === targetVal || data[i][1] === targetVal) match = true;
      }

      if (match) {
        sheet.deleteRow(i + 1);
        deleted = true;
        writeLog(userName, "マスタ削除", targetCrop ? `${targetVal}/${targetCrop}` : targetVal, `対象: ${sheetName}`);
        break;
      }
    }
    if (masterType === 'crop') {
      deleteCropFromSeikuMaster_(String(targetVal || '').trim());
      if (!deleted) writeLog(userName, "マスタ削除", targetVal, `対象: 生育記録マスタ`);
    }
  }

  SpreadsheetApp.flush();
  if (masterType === 'location') {
    return readLocationMasterDetails_();
  }
  if (masterType === 'machineType') {
    return getMachineTypeMasterList_();
  }
  if (masterType === 'machineGroup') {
    return getMachineGroupMasterList_();
  }
  if (masterType === 'crop') {
    return readMergedCropMasterList_();
  }
  if (masterType === 'container') {
    return readContainerMasterList_();
  }
  const newData = sheet.getDataRange().getValues();
  const returnHeaders = newData[0].map(h => String(h).trim());
  if (masterType === 'tool') {
    return newData.slice(1).filter(r => r[1]).map(r => ({ id: r[0], name: r[1], workCategory: r[3] || "" }));
  } else if (masterType === 'material') {
    return newData.slice(1).filter(r => r[1]).map(r => ({ id: r[0], name: r[1], workCategory: r[2] || "", unit: r[4] || "" }));
  } else if (masterType === 'work') {
    return readWorkMasterList_(sheet);
  } else {
    return newData.slice(1).map(r=>r[0]).filter(String);
  }
}

/** 作業マスタに同名の作業名があるか（excludeName は編集時の自分自身を除外） */
function workMasterNameExists_(sheet, headers, name, excludeName) {
  const keyIdx = headers.indexOf('作業名');
  if (keyIdx < 0) return false;
  const target = String(name || "").trim();
  if (!target) return false;
  const exclude = excludeName != null ? String(excludeName).trim() : null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const n = String(data[i][keyIdx] || "").trim();
    if (!n) continue;
    if (exclude !== null && n === exclude) continue;
    if (n === target) return true;
  }
  return false;
}

/** 作業マスタ必須ヘッダーを保証（欠けていれば末尾に追加） */
function ensureWorkMasterHeaders_(sheet) {
  const required = ['作業名', 'カテゴリ', '作物名', '詳細作業名', '作物別詳細作業'];
  let lastCol = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  let changed = false;
  required.forEach(name => {
    if (headers.indexOf(name) < 0) {
      if (name === '作物名') {
        const aliasIdx = findWorkCropColumnIndex_(headers);
        if (aliasIdx >= 0) {
          sheet.getRange(1, aliasIdx + 1).setValue('作物名');
          headers[aliasIdx] = '作物名';
          changed = true;
          return;
        }
      }
      if (name === 'カテゴリ') {
        const aliasIdx = findWorkCategoryColumnIndex_(headers);
        if (aliasIdx >= 0) return;
      }
      if (name === '詳細作業名') {
        const aliasIdx = findWorkDetailColumnIndex_(headers);
        if (aliasIdx >= 0) return;
      }
      lastCol += 1;
      sheet.getRange(1, lastCol).setValue(name);
      headers.push(name);
      changed = true;
    }
  });
  if (changed) {
    SpreadsheetApp.flush();
    lastCol = Math.max(sheet.getLastColumn(), 1);
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  }
  return headers;
}

/** 作業マスタ1行に値を反映（担当部署など未指定列は維持） */
function applyWorkMasterValuesToRow_(rowVals, headers, value) {
  const map = buildWorkMasterColumnMap_(value || {});
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').trim();
    if (map[h] !== undefined) rowVals[i] = map[h];
  }
  const idxName = headers.indexOf('作業名');
  const idxCat = findWorkCategoryColumnIndex_(headers);
  const idxCrop = findWorkCropColumnIndex_(headers);
  const idxDetail = findWorkDetailColumnIndex_(headers);
  const idxCropDetails = headers.indexOf('作物別詳細作業');

  if (idxName >= 0) rowVals[idxName] = String((value && value.name) || '').trim();
  if (idxCat >= 0) rowVals[idxCat] = String((value && value.category) || '圃場作業').trim() || '圃場作業';
  if (idxCrop >= 0) rowVals[idxCrop] = String((value && value.cropName) || '').trim();
  if (idxDetail >= 0) rowVals[idxDetail] = String((value && value.detailWorks) || '').trim();
  if (idxCropDetails >= 0) {
    const cd = value && value.cropDetails ? JSON.stringify(value.cropDetails) : '';
    rowVals[idxCropDetails] = cd;
  }
  return rowVals;
}

/** 作業マスタ一覧を返す */
function readWorkMasterList_(sheet) {
  const headers = ensureWorkMasterHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const idxName = headers.indexOf('作業名');
  const idxCategory = findWorkCategoryColumnIndex_(headers);
  const idxCrop = findWorkCropColumnIndex_(headers);
  const idxDetail = findWorkDetailColumnIndex_(headers);
  const idxCropDetails = headers.indexOf('作物別詳細作業');

  return data.slice(1).filter(r => idxName >= 0 && String(r[idxName] || '').trim()).map(r => {
    const cropStr = idxCrop >= 0 ? String(r[idxCrop] || '').trim() : '';
    const crops = cropStr ? cropStr.split(/[,、]/).map(s => s.trim()).filter(Boolean) : [];
    let cropDetails = null;
    if (idxCropDetails >= 0 && r[idxCropDetails]) {
      try {
        cropDetails = JSON.parse(r[idxCropDetails]);
      } catch(e) {
        cropDetails = null;
      }
    }
    return {
      name: String(r[idxName] || '').trim(),
      category: idxCategory >= 0 ? (String(r[idxCategory] || '').trim() || '圃場作業') : '圃場作業',
      cropName: cropStr,
      crops: crops,
      cropDetails: cropDetails,
      detailWorks: idxDetail >= 0 && r[idxDetail] ? String(r[idxDetail]).trim() : ''
    };
  });
}

/** 作業マスタのカテゴリ列を解決（専用の「カテゴリ」列。担当部署列とは別物） */
function findWorkCategoryColumnIndex_(headers) {
  const candidates = ['カテゴリ', '作業カテゴリ', 'カテゴリー', '作業カテゴリー'];
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 作業マスタの作物名列を解決 */
function findWorkCropColumnIndex_(headers) {
  const candidates = ['作物名', '作物', '品種', '作物・品種'];
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 作業マスタの詳細作業列を解決 */
function findWorkDetailColumnIndex_(headers) {
  const candidates = ['詳細作業名', '詳細作業', '詳細', '詳細作業（カンマ区切り）'];
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 作業マスタ追加/編集用の列名→値マップ（担当部署列は部署用のため変更しない） */
function buildWorkMasterColumnMap_(value) {
  const category = value.category || "圃場作業";
  const details = value.detailWorks || "";
  const cropName = value.cropName != null ? String(value.cropName).trim() : "";
  const cd = value && value.cropDetails ? JSON.stringify(value.cropDetails) : "";
  return {
    '作業名': value.name,
    'カテゴリ': category,
    '作業カテゴリ': category,
    'カテゴリー': category,
    '作業カテゴリー': category,
    '作物名': cropName,
    '作物': cropName,
    '品種': cropName,
    '作物・品種': cropName,
    '詳細作業名': details,
    '詳細作業': details,
    '詳細': details,
    '詳細作業（カンマ区切り）': details,
    '作物別詳細作業': cd
  };
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

  const ss = TENANT_SS;
  const schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) throw new Error("作業予定シートがありません");

  const today = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
  const workName = "⚠️問題対応: " + reportText;
  
  // A:作業名, B:担当部署(運営), C:作物名(空), D:圃場名, E:予定日, F:期限日, G:時間(空), H:適合者, I:完了日(空), J:写真URL, K:場所ID
  schedSheet.appendRow([workName, "運営", "", nameStr, today, today, "", author, "", urls.join(" , "), polyId]);

  writeLog(author, "問題報告", nameStr, `内容: ${reportText}`);
  return true;
}

function addFieldStatusToMaster(statusName) {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('圃場設定マスタ');
  if (!sheet) return statusName;
  const data = sheet.getDataRange().getValues();
  let emptyRow = 2;
  while (emptyRow <= data.length && (data[emptyRow-1] && data[emptyRow-1][2])) emptyRow++;
  sheet.getRange(emptyRow, 3).setValue(statusName);
  return statusName;
}

function addCropToMaster(cropData) {
  const name = String((cropData && cropData.name) || '').trim();
  if (!name) throw new Error('作物名を入力してください');
  const density = Number((cropData && cropData.density) || 0) || 0;
  manageMasterData('crop', 'add', { name: name, density: density }, 'system');
  return { name: name, density: density };
}
function deleteCropFromMaster(cropName) {
  const name = String(cropName || '').trim();
  if (!name) throw new Error('作物名を指定してください');
  manageMasterData('crop', 'delete', { name: name }, 'system');
  return name;
}

/** 生育記録マスタ + 作物マスタを統合した作物リスト */
function readMergedCropMasterList_() {
  const ss = TENANT_SS;
  const map = {};
  for (let sheetName of ['作物マスタ', '生育記録マスタ']) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) continue;
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const n = String(data[i][0] || '').trim();
      if (!n) continue;
      if (!map[n]) {
        map[n] = { name: n, density: Number(data[i][1]) || 0 };
      } else if (!map[n].density && data[i][1]) {
        map[n].density = Number(data[i][1]) || 0;
      }
    }
  }
  return Object.keys(map).sort((a, b) => a.localeCompare(b, 'ja')).map(k => map[k]);
}

/** コンテナマスタシート確保（1行＝コンテナ種類×品目） */
function ensureContainerMasterSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('コンテナマスタ');
  if (!sheet) {
    sheet = ss.insertSheet('コンテナマスタ');
    sheet.appendRow(['コンテナ種類', '品目', '内容単位', '内容個数']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), 4);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h).trim());
    if (!headers[0]) sheet.getRange(1, 1).setValue('コンテナ種類');
    // 旧「対応品目」→「品目」
    if (!headers[1] || headers[1] === '対応品目') sheet.getRange(1, 2).setValue('品目');
    if (!headers[2]) sheet.getRange(1, 3).setValue('内容単位');
    if (!headers[3]) sheet.getRange(1, 4).setValue('内容個数');
    migrateContainerMasterToPerCrop_(sheet);
  }
  return sheet;
}

/**
 * 旧形式（対応品目をカンマ複数／空＝共通）を
 * 「コンテナ種類×品目」1行形式へ展開。共通（品目空）は削除。
 */
function migrateContainerMasterToPerCrop_(sheet) {
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  let needsRewrite = false;
  const newRows = [];
  const seenPair = {};
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] || '').trim();
    if (!name) continue;
    const rawCrop = String(data[i][1] || '').trim();
    const crops = parseContainerCrops_(rawCrop);
    const contentUnit = String(data[i][2] || '').trim();
    const contentQtyRaw = data[i][3];
    const contentQty = (contentQtyRaw !== '' && contentQtyRaw != null) ? Number(contentQtyRaw) || 0 : '';
    if (!crops.length) {
      // 旧・共通行は使わない
      needsRewrite = true;
      continue;
    }
    if (crops.length > 1 || /[,、，]/.test(rawCrop)) needsRewrite = true;
    crops.forEach(crop => {
      const key = name + '\t' + crop;
      if (seenPair[key]) {
        needsRewrite = true;
        return;
      }
      seenPair[key] = true;
      newRows.push([name, crop, contentUnit, contentQty === '' ? '' : contentQty]);
    });
  }
  if (!needsRewrite) return;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow, 4).clearContent();
  }
  if (newRows.length) {
    sheet.getRange(2, 1, 1 + newRows.length, 4).setValues(newRows);
  }
}

function parseContainerCrops_(raw) {
  return String(raw || '')
    .split(/[,、，]/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => s !== '共通' && s !== '__common__');
}

function formatContainerCrops_(crops) {
  if (Array.isArray(crops)) {
    return crops.map(s => String(s || '').trim()).filter(Boolean)
      .filter(s => s !== '共通' && s !== '__common__').join(',');
  }
  return parseContainerCrops_(crops).join(',');
}

/**
 * コンテナマスタ一覧（1要素＝種類×品目）。
 * legacyNames: 作業マスタから拾った旧コンテナ名（空マスタ時に移行しない／品目必須のためスキップ）
 */
function readContainerMasterList_(legacyNames) {
  const sheet = ensureContainerMasterSheet_();
  const data = sheet.getDataRange().getValues();
  const list = [];
  const seenPair = {};
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0] || '').trim();
    const crop = String(data[i][1] || '').trim();
    if (!name || !crop) continue;
    if (crop === '共通' || crop === '__common__') continue;
    const key = name + '\t' + crop;
    if (seenPair[key]) continue;
    seenPair[key] = true;
    const contentUnit = String(data[i][2] || '').trim();
    const contentQtyRaw = data[i][3];
    const contentQty = (contentQtyRaw !== '' && contentQtyRaw != null) ? Number(contentQtyRaw) || 0 : '';
    list.push({
      name: name,
      crop: crop,
      crops: [crop],
      cropName: crop,
      contentUnit: contentUnit,
      contentQty: contentQty
    });
  }
  // 旧データ移行用レガシー名は品目不明のため自動登録しない
  list.sort((a, b) => {
    const n = String(a.name).localeCompare(String(b.name), 'ja');
    return n !== 0 ? n : String(a.crop).localeCompare(String(b.crop), 'ja');
  });
  return list;
}

/** ロット記録シートに内容単位・内容個数・内容内訳ヘッダーを確保 */
function ensureLotRecordContentHeaders_(lotSheet) {
  if (!lotSheet) return;
  const lastCol = Math.max(lotSheet.getLastColumn(), 13);
  const headers = lotSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  // A〜J既存。K:内容単位 L:内容個数 M:内容内訳
  if (headers.length < 10 || headers[9] !== '拠点') {
    lotSheet.getRange(1, 10).setValue('拠点').setFontWeight('bold').setBackground('#e0e0e0');
  }
  if (!headers[10] || headers[10] !== '内容単位') {
    lotSheet.getRange(1, 11).setValue('内容単位').setFontWeight('bold').setBackground('#e0e0e0');
  }
  if (!headers[11] || headers[11] !== '内容個数') {
    lotSheet.getRange(1, 12).setValue('内容個数').setFontWeight('bold').setBackground('#e0e0e0');
  }
  if (!headers[12] || headers[12] !== '内容内訳') {
    lotSheet.getRange(1, 13).setValue('内容内訳').setFontWeight('bold').setBackground('#e0e0e0');
  }
}

/**
 * 生育記録マスタの作物名を同期。
 * originalName が空なら新規追加。newName があれば置換/追加。
 */
function syncCropNameInSeikuMaster_(originalName, newName, density) {
  const sheet = TENANT_SS.getSheetByName('生育記録マスタ');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const orig = String(originalName || '').trim();
  const name = String(newName || '').trim();
  if (!name) return;
  const dens = (density != null) ? Number(density) || 0 : 0;

  if (orig) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() === orig) {
        sheet.getRange(i + 1, 1).setValue(name);
        if (sheet.getLastColumn() >= 2) sheet.getRange(i + 1, 2).setValue(dens);
        return;
      }
    }
  }
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === name) {
      if (sheet.getLastColumn() >= 2 && dens) sheet.getRange(i + 1, 2).setValue(dens);
      return;
    }
  }
  let emptyRow = 2;
  while (emptyRow <= data.length && data[emptyRow - 1] && data[emptyRow - 1][0]) emptyRow++;
  sheet.getRange(emptyRow, 1, 1, 2).setValues([[name, dens]]);
}

function deleteCropFromSeikuMaster_(cropName) {
  const sheet = TENANT_SS.getSheetByName('生育記録マスタ');
  if (!sheet) return;
  const name = String(cropName || '').trim();
  if (!name) return;
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0] || '').trim() === name) {
      // A列のみクリア（他列の栽培ステージ等を壊さない）
      sheet.getRange(i + 1, 1, 1, Math.min(2, sheet.getLastColumn())).clearContent();
    }
  }
}

/** 作業マスタのカテゴリ列をリネーム */
function renameWorkMasterCategory_(oldName, newName) {
  const sheet = TENANT_SS.getSheetByName('作業マスタ');
  if (!sheet) return;
  const orig = String(oldName || '').trim();
  const next = String(newName || '').trim();
  if (!orig || !next || orig === next) return;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  const headers = data[0].map(h => String(h).trim());
  const catIdx = findWorkCategoryColumnIndex_(headers);
  if (catIdx < 0) return;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][catIdx] || '').trim() === orig) {
      sheet.getRange(i + 1, catIdx + 1).setValue(next);
    }
  }
}

/** 作業マスタの作物名列をリネーム（カンマ区切り複数にも対応） */
function renameWorkMasterCrop_(oldName, newName) {
  const sheet = TENANT_SS.getSheetByName('作業マスタ');
  if (!sheet) return;
  const orig = String(oldName || '').trim();
  const next = String(newName || '').trim();
  if (!orig || !next || orig === next) return;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  const headers = data[0].map(h => String(h).trim());
  const cropIdx = findWorkCropColumnIndex_(headers);
  if (cropIdx < 0) return;
  for (let i = 1; i < data.length; i++) {
    const raw = String(data[i][cropIdx] || '').trim();
    if (!raw) continue;
    const parts = raw.split(/[,、]/).map(s => s.trim()).filter(Boolean);
    let changed = false;
    const updated = parts.map(p => {
      if (p === orig) { changed = true; return next; }
      return p;
    });
    if (changed) {
      sheet.getRange(i + 1, cropIdx + 1).setValue(updated.join(','));
    }
  }
}

function getToukiDetails(idsStr) {
  if (!idsStr) return [];
  const ids = idsStr.split(',').map(s => s.trim());
  const sheet = TENANT_SS.getSheetByName('登記');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  return data.filter(row => ids.includes(String(row[0]))).map(row => ({ id: row[0], address: row[2], area: row[3], owner: row[4], type: row[5] }));
}

function saveToukiData(data, hojoId) {
  const sheet = TENANT_SS.getSheetByName('登記');
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
  const ss = TENANT_SS, hojoSheet = ss.getSheetByName('圃場'), toukiSheet = ss.getSheetByName('登記');
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
  const ss = TENANT_SS;
  let result = [];
  
  // 圃場シート
  const fieldSheet = ss.getSheetByName('圃場');
  if (fieldSheet) {
    const data = fieldSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      try {
        let photos = [];
        try { if (data[i][9]) photos = JSON.parse(data[i][9]); } catch(e){}
        let coords = [];
        try { coords = JSON.parse(data[i][5] || "[]"); } catch (e) {
          console.warn('圃場 coords 不正のためスキップ:', data[i][0], e);
          continue;
        }
        if (!Array.isArray(coords)) coords = [];
        
        result.push({
          id: data[i][0],
          name: data[i][1],
          location: data[i][2],
          condition: data[i][3],
          area: data[i][4],
          coords: coords,
          color: (coords.length === 1) ? data[i][6] : "",
          author: data[i][8],
          photos: photos,
          status: data[i][10],
          toukiId: data[i][11],
          ridgeDir: data[i][13],
          ridgeWidth: data[i][14],
          uneSimData: data[i][15],
          water_status: data[i][16] || 'stopped'
        });
        let manureData = {};
        try { if (data[i][17]) manureData = JSON.parse(data[i][17]); } catch(e){}
        
        result[result.length - 1].manure_status = manureData.manure_status || 'none';
        result[result.length - 1].manure_deadline = manureData.manure_deadline || '';
        result[result.length - 1].manure_scheduled_date = manureData.manure_scheduled_date || '';
        result[result.length - 1].manure_cancel_reason = manureData.manure_cancel_reason || '';
        result[result.length - 1].manure_has_pin = manureData.manure_has_pin || false;
        result[result.length - 1].manure_route_selected = manureData.manure_route_selected || false;
        result[result.length - 1].transplant_jun = manureData.transplant_jun || '';

        // S列(19): 圃場メモ（鶏糞CAD風）
        let fieldMemo = null;
        try {
          if (data[i][18]) {
            fieldMemo = (typeof data[i][18] === 'string') ? JSON.parse(data[i][18]) : data[i][18];
          }
        } catch (e) { fieldMemo = null; }
        result[result.length - 1].fieldMemo = fieldMemo;
      } catch (rowErr) {
        console.warn('圃場行の読込スキップ:', data[i][0], rowErr);
      }
    }
  }
  
  // 看板シート
  const signSheet = ss.getSheetByName('看板');
  if (signSheet) {
    const data = signSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      try {
        let photos = [];
        try {
          if (data[i][9] && data[i][9] !== "[]") photos = JSON.parse(data[i][9]);
          else if (data[i][6] && data[i][6] !== "[]") photos = JSON.parse(data[i][6]);
        } catch(e){}
        let coords = [];
        try { coords = JSON.parse(data[i][2] || "[]"); } catch (e) {
          console.warn('看板 coords 不正のためスキップ:', data[i][0], e);
          continue;
        }
        if (!Array.isArray(coords)) coords = [];
        
        result.push({
          id: data[i][0],
          name: data[i][1],
          coords: coords,
          color: data[i][3],
          author: data[i][5],
          signFunction: data[i][7] || "一般看板", // ★ここが超重要！H列（看板機能）をアプリに送る！
          photos: photos,
          uneSimData: data[i][10] // K列(11)
        });
      } catch (rowErr) {
        console.warn('看板行の読込スキップ:', data[i][0], rowErr);
      }
    }
  }
  
  return result;
}
// ==========================================
// 圃場・看板の新規保存
// ==========================================
function savePolygonsBatch(paramsList) {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('圃場');
  const now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm");
  
  let rowsToAppend = [];
  let insertedIds = [];
  
  for (let i = 0; i < paramsList.length; i++) {
    const params = paramsList[i];
    const newId = Utilities.getUuid();
    insertedIds.push(newId);
    
    rowsToAppend.push([
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
      params.parentId || ""      // M列: 親ID
    ]);
  }
  
  if (rowsToAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
  }
  
  return insertedIds;
}

function savePolygon(params) {
  const ss = TENANT_SS;
  // 座標が1点なら看板、それ以上なら圃場と判定
  const isMarker = JSON.parse(params.coords).length === 1;
  const sheetName = isMarker ? '看板' : '圃場';
  const sheet = ss.getSheetByName(sheetName);
  
  const newId = Utilities.getUuid();
  const now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm");
  
  if (isMarker) {
    // 【看板シートの列構成】
    // A:ID, B:名前, C:座標, D:色/アイコン, E:登録日時, F:登録者, G:空白, H:看板機能, J:履歴, K:畝シミュレーションデータ
    sheet.appendRow([
      newId,
      params.name || "",
      params.coords,
      params.color || "",
      now,
      params.userName || "",
      "", 
      params.signFunction || "機能なし",
      "", // I列
      "[]", // J列
      params.uneSimData || "" // K列: 畝シミュレーションデータ
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
      params.ridgeWidth || "",
      params.uneSimData || ""    // P列: 畝シミュレーションデータ
    ]);
  }
  
  writeLog(params.userName, "図形登録", params.name, `対象: ${sheetName}`);
  return newId;
}

function savePolygonBatch(params) {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('圃場');
  const now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm");
  const newIds = [];
  
  if (!params.polygons || params.polygons.length === 0) return [];
  
  const rows = params.polygons.map(p => {
    const newId = Utilities.getUuid();
    newIds.push(newId);
    return [
      newId,
      p.name || "",
      p.location || "",
      p.condition || "",
      p.area || 0,
      p.coords,
      p.color || "",
      now,
      p.userName || "",
      "[]",
      p.status || "",
      p.toukiId || "",
      "",
      p.ridgeDir || "",
      p.ridgeWidth || "",
      p.uneSimData || ""
    ];
  });
  
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  
  writeLog(params.polygons[0].userName, "図形登録(一括)", `${params.polygons.length}件の圃場`, `対象: 圃場`);
  return newIds;
}

// ==========================================
// 圃場・看板情報の更新処理
// ==========================================
function updatePolygon(params) {
  const ss = TENANT_SS;
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
    // 【看板】 B(2):名前, C(3):座標, D(4):色, H(8):看板機能, J(10):履歴, K(11):畝シミュレーションデータ
    sheet.getRange(targetRow, 2).setValue(newName);
    sheet.getRange(targetRow, 3).setValue(coords);
    sheet.getRange(targetRow, 4).setValue(color);
    if (params.signFunction !== undefined) sheet.getRange(targetRow, 8).setValue(params.signFunction);
    if (params.uneSimData !== undefined) sheet.getRange(targetRow, 11).setValue(params.uneSimData);
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
    if (params.water_status !== undefined) sheet.getRange(targetRow, 17).setValue(params.water_status); // Q列: 水管理ステータス
    if (params.manureData !== undefined) sheet.getRange(targetRow, 18).setValue(params.manureData); // R列: 鶏糞散布用データ
    
    if (params.ridgeDir !== undefined) sheet.getRange(targetRow, 14).setValue(params.ridgeDir); // N列(あれば)
    if (params.ridgeWidth !== undefined) sheet.getRange(targetRow, 15).setValue(params.ridgeWidth); // O列(あれば)
    if (params.uneSimData !== undefined) {
      if (!checkAdminRole(userName)) {
        throw new Error("管理者権限がないため、CAD（給水口）データの更新はできません。");
      }
      sheet.getRange(targetRow, 16).setValue(params.uneSimData); // P列(畝データ)
      
      // 畝シートにも保存
      try {
        let uneSheet = ss.getSheetByName('畝');
        if (!uneSheet) {
          uneSheet = ss.insertSheet('畝');
          uneSheet.appendRow(['圃場ID', '圃場名', '畝番号', '更新日時']);
        }
        
        let uneData = uneSheet.getDataRange().getValues();
        let newUneData = [];
        let header = uneData.length > 0 ? uneData[0] : ['圃場ID', '圃場名', '畝番号', '更新日時'];
        newUneData.push(header);
        
        // 既存の同じ圃場IDの畝データを除外
        for (let i = 1; i < uneData.length; i++) {
          if (uneData[i][0] !== id) {
            newUneData.push(uneData[i]);
          }
        }
        
        let simDataObj = JSON.parse(params.uneSimData);
        if (simDataObj.unePolygons && simDataObj.unePolygons.length > 0) {
          let timestamp = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
          for (let i = 0; i < simDataObj.unePolygons.length; i++) {
            newUneData.push([id, newName, i + 1, timestamp]);
          }
        }
        
        uneSheet.clearContents();
        if (newUneData.length > 0) {
          uneSheet.getRange(1, 1, newUneData.length, newUneData[0].length).setValues(newUneData);
        }
      } catch (e) {
        console.error("畝シートの更新に失敗しました: " + e.message);
      }
      
      // 図面履歴シートにも保存
      try {
        let historySheet = ss.getSheetByName('図面履歴');
        if (!historySheet) {
          historySheet = ss.insertSheet('図面履歴');
          historySheet.appendRow(['圃場ID', '圃場名', '更新日時', 'データ']);
        }
        let historyDate = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
        historySheet.appendRow([id, newName, historyDate, params.uneSimData]);
      } catch (e) {
        console.error("図面履歴シートの更新に失敗しました: " + e.message);
      }
    }
    

    sheet.getRange(targetRow, historyCol).setValue(JSON.stringify(newPhotos)); // J列: 履歴
  }

  writeLog(userName, "情報更新", newName, oldName !== newName ? `名前変更: ${oldName} -> ${newName}` : "属性変更");
  return true;
}
// ==========================================
// 圃場の分割
// ==========================================
function splitField(params) {
  const ss = TENANT_SS;
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
    targetRowData[14] || "",      // O: 畝幅
    targetRowData[15] || ""       // P: 畝データ
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

  const ss = TENANT_SS;
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
  if (!checkAdminRole(user)) throw new Error("管理者権限がないため、削除できません。"); 
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

function deletePolygonBatchData(ids, user) {
  if (!checkAdminRole(user)) throw new Error("管理者権限がないため、削除できません。");
  const ss = TENANT_SS;
  const sheets = ['圃場', '看板'];
  
  let rowsToDelete = { '圃場': [], '看板': [] };
  let names = [];
  
  for (let s of sheets) {
    let sheet = ss.getSheetByName(s);
    if (!sheet) continue;
    let data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (ids.includes(data[i][0])) {
        rowsToDelete[s].push(i + 1);
        names.push(data[i][1]);
      }
    }
  }

  let hasHojoDeleted = false;
  
  for (let s of sheets) {
    let sheet = ss.getSheetByName(s);
    if (!sheet) continue;
    let r = rowsToDelete[s].sort((a, b) => b - a);
    for (let rowIdx of r) {
      sheet.deleteRow(rowIdx);
      if (s === '圃場') hasHojoDeleted = true;
    }
  }
  
  if (hasHojoDeleted) syncToukiMapping();
  writeLog(user, "図形削除(一括)", names.join(", "), `システムID: ${ids.length}件`);
  return "DELETED_BATCH";
}



function findSheetAndRowById(id) {
  const sheets = ['圃場', '看板'];
  for (let s of sheets) {
    let sheet = TENANT_SS.getSheetByName(s);
    if (!sheet) continue;
    let data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) { if (data[i][0] === id) return { sheet, rowIndex: i + 1, rowData: data[i] }; }
  } return null;
}

function getOrCreateRecordSheet(sheetName) {
  const ss = TENANT_SS; let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheetName === '看板記録') { sheet.appendRow(["日時", "圃場名", "登録者", "写真URL", "システムID"]); } 
    else if (sheetName === '作業記録') { sheet.appendRow(["記録時間", "圃場名", "記録者", "作業日", "作業名", "作物名", "開始時間", "終了時間", "人数", "合計時間", "進捗状況", "写真URL", "システムID", "今回作業畝", "次回開始畝"]); }
    else if (sheetName === 'ロット記録') { sheet.appendRow(["ロットID", "生成日時", "生成者", "作物名", "圃場名", "コンテナ種類", "初期コンテナ数", "残コンテナ数", "ステータス", "拠点", "内容単位", "内容個数", "内容内訳"]); }
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
  const ss = TENANT_SS;
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
if (recordType === 'work') rs.appendRow([today+" "+time, nameStr, author, recordData.workDate||"", recordData.workName||"", recordData.crop||"", recordData.startTime||"", recordData.endTime||"", recordData.workerCount||"1", recordData.totalTime||"", recordData.progressStatus||"", urls.join(", "), recordId, recordData.workedRidges||"", recordData.nextRidge||""]);
    else if (parentType === '看板') rs.appendRow([today+" "+time, nameStr, author, urls.join(", "), recordId]);
    else rs.appendRow([today+" "+time, nameStr, author, recordData.crop||"", recordData.startTime||"", recordData.endTime||"", recordData.mowing?"済":"", recordData.weeding?"済":"", recordData.drainage?"済":"", recordData.bug?"有":"", recordData.disease?"有":"", recordData.harvestDate||"", recordData.survivalRate||"", recordData.leafLength||"", recordData.harvestSize||"", recordData.harvestAmount||"", recordData.fieldStatus||"", recordData.ph||"", recordData.flower?"有":"", recordData.notes||"", urls.join(", "), recordId]);
    
  writeLog(author, "記録一括追加", nameStr, `タイプ: ${rsName}`);

  let firstEx = [];
  
  for (let i = 0; i < ids.length; i++) {
    const found = findSheetAndRowById(ids[i]);
    if (!found) continue;
    const isHojo = found.sheet.getName() === '圃場';
    const pc = 10;
    let ex = []; if (found.rowData[pc-1]) { try { ex = JSON.parse(found.rowData[pc-1]); } catch(e) {} }
    if (ex.length === 0 && found.rowData[6]) { try { ex = JSON.parse(found.rowData[6]); } catch(e) {} }
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
  const pType = found.sheet.getName(), pc = 10; let ex = []; if (found.rowData[pc-1]) { try { ex = JSON.parse(found.rowData[pc-1]); } catch(e) {} } if (ex.length === 0 && found.rowData[6]) { try { ex = JSON.parse(found.rowData[6]); } catch(e) {} }
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
  const rs = TENANT_SS.getSheetByName(rsName);
  if (rs) {
    const d = rs.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (recordType === 'work') {
          if (d[i][12] === recordId) { 
            const r = i + 1;
            rs.getRange(r, 4).setValue(newData.workDate||""); rs.getRange(r, 5).setValue(newData.workName||""); rs.getRange(r, 6).setValue(newData.crop||""); rs.getRange(r, 7).setValue(newData.startTime||""); rs.getRange(r, 8).setValue(newData.endTime||""); rs.getRange(r, 9).setValue(newData.workerCount||"1"); rs.getRange(r, 10).setValue(newData.totalTime||""); rs.getRange(r, 11).setValue(newData.progressStatus||""); rs.getRange(r, 12).setValue(tgt.urls.join(" , ")); rs.getRange(r, 14).setValue(newData.workedRidges||""); rs.getRange(r, 15).setValue(newData.nextRidge||"");
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
  const pc = 10; let ex = []; if (found.rowData[pc-1]) { try { ex = JSON.parse(found.rowData[pc-1]); } catch(e) {} } if (ex.length === 0 && found.rowData[6]) { try { ex = JSON.parse(found.rowData[6]); } catch(e) {} }
  const updated = ex.filter(item => item.id !== recordId && item.url !== recordId); found.sheet.getRange(found.rowIndex, pc).setValue(JSON.stringify(updated)); 
  writeLog(user, "記録削除", found.rowData[1], `対象ID: ${recordId}`);
  return updated;
}

// ==========================================
// 作業予定と地図ステータスの取得（部署自動判定を追加）
// ==========================================
function getScheduleData() {
  const ss = TENANT_SS;
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
        activeSchedules.push({
          workName,
          dept,
          cropName,
          fieldName,
          schedDate: schedDateStr,
          deadline: deadlineStr,
          hours,
          person,
          isOverdue,
          isCultivation: String(sData[i][10] || '').indexOf('cp:') === 0,
          trays: hours,
          tag: person
        });
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
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
  const targetDateStr = params.date
    ? Utilities.formatDate(new Date(params.date.replace(/-/g, '/')), "JST", "yyyy/MM/dd")
    : Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd");
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

  // ② 指定日の「作業記録」から、指定拠点＆指定作物の「収穫」を行った畑を自動検索
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
           if (recordDate === targetDateStr && wName.includes('収穫') && cropName === params.crop && fieldLoc === params.location) {
              harvestedFields.push(fieldName);
           }
         }
       } catch(e){}
    }
  }
  
  // 重複排除してカンマ区切りに
  const fieldNamesStr = [...new Set(harvestedFields)].join(' , ') || "圃場指定なし（単独ロット）";
  
  // ③ ロット記録に保存（内容単位・内容個数はクライアント入力を優先、なければマスタ）
  const lotSheet = getOrCreateRecordSheet('ロット記録');
  ensureLotRecordContentHeaders_(lotSheet);

  const lotId = "L-" + Utilities.formatDate(new Date(), "JST", "MMddHHmm") + Math.floor(Math.random()*10);
  const containerType = String(params.containerType || '').trim();
  const cropName = String(params.crop || '').trim();
  let contentUnit = String(params.contentUnit || '').trim();
  let contentQty = '';
  let contentDetail = '';

  const masterList = readContainerMasterList_();
  const masterHit = masterList.find(c =>
    String(c.name || '').trim() === containerType && String(c.crop || '').trim() === cropName
  );
  if (!contentUnit && masterHit) {
    contentUnit = String(masterHit.contentUnit || '').trim();
  }

  // コンテナごとの内容個数配列（あれば合計・代表値を算出）
  let qtyList = [];
  if (Array.isArray(params.contentQtys) && params.contentQtys.length > 0) {
    qtyList = params.contentQtys.map(function (v) {
      const n = Number(v);
      return (isFinite(n) && n >= 0) ? n : 0;
    });
  }
  const mode = String(params.contentMode || (qtyList.length ? 'individual' : 'uniform')).trim() || 'uniform';

  if (qtyList.length > 0) {
    const total = qtyList.reduce(function (s, n) { return s + n; }, 0);
    const allSame = qtyList.every(function (n) { return n === qtyList[0]; });
    contentQty = allSame ? qtyList[0] : (Math.round((total / qtyList.length) * 1000) / 1000);
    contentDetail = JSON.stringify({
      mode: mode,
      unit: contentUnit,
      qtys: qtyList,
      total: total,
      uniformQty: params.uniformQty != null ? Number(params.uniformQty) : (allSame ? qtyList[0] : ''),
      remainderCount: params.remainderCount != null ? Number(params.remainderCount) : 0,
      remainderQty: params.remainderQty != null ? Number(params.remainderQty) : ''
    });
  } else if (params.contentQty !== '' && params.contentQty != null) {
    const parsed = Number(params.contentQty);
    if (isFinite(parsed) && parsed >= 0) contentQty = parsed;
  } else if (masterHit && masterHit.contentQty !== '' && masterHit.contentQty != null) {
    contentQty = Number(masterHit.contentQty) || 0;
  }

  // A:ID, B:日時, C:生成者, D:作物名, E:圃場名, F:コンテナ種類, G:初期数, H:残数, I:ステータス, J:拠点, K:内容単位, L:内容個数, M:内容内訳
  lotSheet.appendRow([
    lotId,
    targetDateStr + " " + time,
    params.author,
    params.crop,
    fieldNamesStr,
    containerType,
    params.count,
    params.count,
    "使用中",
    params.location,
    contentUnit,
    contentQty === '' ? '' : contentQty,
    contentDetail
  ]);

  const totalForLog = qtyList.length
    ? qtyList.reduce(function (s, n) { return s + n; }, 0)
    : ((Number(params.count) || 0) * (Number(contentQty) || 0));
  writeLog(params.author, "一括ロット生成", lotId, `拠点: ${params.location}, 日付: ${targetDateStr}, 作物: ${params.crop}, 内容: ${contentQty}${contentUnit}, 合計: ${totalForLog}, 自動紐付: ${fieldNamesStr}`);
  return {
    lotId: lotId,
    fields: fieldNamesStr,
    contentUnit: contentUnit,
    contentQty: contentQty,
    contentTotal: totalForLog,
    contentMode: mode,
    contentQtys: qtyList
  };
}

/** 作業記録の収穫量（harvestQty.pendingLot）をロット化済みにする */
function markHarvestQtyLotResolved(params) {
  params = params || {};
  const items = Array.isArray(params.items) ? params.items : [];
  const lotId = String(params.lotId || '').trim();
  const userName = String(params.userName || '').trim() || 'システム';
  let updated = 0;

  items.forEach(function (item) {
    if (!item) return;
    const polyId = String(item.polyId || '').trim();
    const recordId = String(item.recordId || '').trim();
    if (!polyId || !recordId) return;
    const found = findSheetAndRowById(polyId);
    if (!found) return;
    const pc = 10;
    let ex = [];
    if (found.rowData[pc - 1]) {
      try { ex = JSON.parse(found.rowData[pc - 1]); } catch (e) {}
    }
    if (ex.length === 0 && found.rowData[6]) {
      try { ex = JSON.parse(found.rowData[6]); } catch (e) {}
    }
    const tgt = ex.find(function (row) {
      return row && (row.id === recordId || row.url === recordId);
    });
    if (!tgt || !tgt.data) return;
    if (!tgt.data.harvestQty || typeof tgt.data.harvestQty !== 'object') {
      tgt.data.harvestQty = {};
    }
    tgt.data.harvestQty.pendingLot = false;
    if (lotId) tgt.data.harvestQty.lotId = lotId;
    found.sheet.getRange(found.rowIndex, pc).setValue(JSON.stringify(ex));
    updated++;
  });

  if (updated > 0) {
    writeLog(userName, '収穫量ロット化', lotId || '-', `作業記録 ${updated} 件を未ロット化解除`);
  }
  return { success: true, updated: updated, lotId: lotId };
}

/**
 * ロット記録一覧を返す。
 * params.status: 'all' | 'active' | '使用中' | '出荷済' | '完了' など
 * params.location: 拠点名（空ならすべて）
 * params.limit: 最大件数（既定 200）
 */
function getLotList(params) {
  params = params || {};
  const statusFilter = String(params.status || 'all').trim();
  const locationFilter = String(params.location || '').trim();
  const limit = Math.max(1, Math.min(500, parseInt(params.limit, 10) || 200));
  const lotSheet = ssGetLotSheet_();
  if (!lotSheet) return { lots: [], total: 0 };

  ensureLotRecordContentHeaders_(lotSheet);
  const data = lotSheet.getDataRange().getValues();
  if (data.length <= 1) return { lots: [], total: 0 };

  const head = data[0].map(h => String(h).trim());
  const idx = {
    lotId: 0,
    createdAt: 1,
    author: 2,
    crop: 3,
    fields: 4,
    containerType: 5,
    initialCount: 6,
    remain: 7,
    status: 8,
    location: head.indexOf('拠点') >= 0 ? head.indexOf('拠点') : 9,
    contentUnit: head.indexOf('内容単位') >= 0 ? head.indexOf('内容単位') : 10,
    contentQty: head.indexOf('内容個数') >= 0 ? head.indexOf('内容個数') : 11,
    contentDetail: head.indexOf('内容内訳') >= 0 ? head.indexOf('内容内訳') : 12
  };

  const lots = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lotId = String(row[idx.lotId] || '').trim();
    if (!lotId) continue;
    const status = String(row[idx.status] || '').trim() || '使用中';
    const location = String(row[idx.location] || '').trim() || '未設定';

    if (statusFilter === 'active') {
      if (status === '完了' || status === '出荷済') continue;
    } else if (statusFilter !== 'all' && statusFilter) {
      if (status !== statusFilter) continue;
    }
    if (locationFilter && locationFilter !== 'all' && location !== locationFilter) continue;

    let createdAt = row[idx.createdAt];
    if (createdAt instanceof Date && !isNaN(createdAt.getTime())) {
      createdAt = Utilities.formatDate(createdAt, 'JST', 'yyyy/MM/dd HH:mm');
    } else {
      createdAt = String(createdAt || '').trim();
    }

    let contentDetail = '';
    let contentTotal = '';
    let contentQtys = [];
    try {
      const rawDetail = idx.contentDetail >= 0 ? row[idx.contentDetail] : '';
      if (rawDetail) {
        const parsed = (typeof rawDetail === 'string') ? JSON.parse(rawDetail) : rawDetail;
        if (parsed && typeof parsed === 'object') {
          contentDetail = parsed;
          if (Array.isArray(parsed.qtys)) contentQtys = parsed.qtys;
          if (parsed.total != null && parsed.total !== '') contentTotal = parsed.total;
        }
      }
    } catch (e) {}

    lots.push({
      rowIndex: i + 1,
      lotId: lotId,
      createdAt: createdAt,
      author: String(row[idx.author] || '').trim(),
      crop: String(row[idx.crop] || '').trim(),
      fields: String(row[idx.fields] || '').trim(),
      containerType: String(row[idx.containerType] || '').trim(),
      initialCount: row[idx.initialCount] != null ? row[idx.initialCount] : '',
      remain: row[idx.remain] != null ? row[idx.remain] : '',
      status: status,
      location: location,
      contentUnit: String(row[idx.contentUnit] || '').trim(),
      contentQty: row[idx.contentQty] != null && row[idx.contentQty] !== '' ? row[idx.contentQty] : '',
      contentDetail: contentDetail,
      contentQtys: contentQtys,
      contentTotal: contentTotal
    });
  }

  // 新しい順（下の行が新しい想定。生成日時でもソート）
  lots.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt), 'ja'));
  const total = lots.length;
  return { lots: lots.slice(0, limit), total: total };
}

function updateLotRecord(params) {
  params = params || {};
  const userName = String(params.userName || '').trim();
  if (!userName) throw new Error('ユーザー名が必要です');

  const lotId = String(params.lotId || '').trim();
  if (!lotId) throw new Error('ロットIDが必要です');

  const lotSheet = ssGetLotSheet_();
  if (!lotSheet) throw new Error('ロット記録シートが見つかりません');

  ensureLotRecordContentHeaders_(lotSheet);
  const data = lotSheet.getDataRange().getValues();
  if (data.length <= 1) throw new Error('更新対象のロットがありません');

  const head = data[0].map(h => String(h).trim());
  const idx = {
    lotId: 0,
    crop: 3,
    fields: 4,
    containerType: 5,
    initialCount: 6,
    remain: 7,
    status: 8,
    location: head.indexOf('拠点') >= 0 ? head.indexOf('拠点') : 9,
    contentUnit: head.indexOf('内容単位') >= 0 ? head.indexOf('内容単位') : 10,
    contentQty: head.indexOf('内容個数') >= 0 ? head.indexOf('内容個数') : 11
  };

  const rowIndex = parseInt(params.rowIndex, 10) || 0;
  let targetRow = 0;
  if (rowIndex >= 2 && rowIndex <= data.length && String(data[rowIndex - 1][idx.lotId] || '').trim() === lotId) {
    targetRow = rowIndex;
  } else {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idx.lotId] || '').trim() === lotId) {
        targetRow = i + 1;
        break;
      }
    }
  }
  if (!targetRow) throw new Error('更新対象のロットが見つかりません');

  const crop = String(params.crop || '').trim();
  const fields = String(params.fields || '').trim();
  const containerType = String(params.containerType || '').trim();
  const location = String(params.location || '').trim();
  const contentUnit = String(params.contentUnit || '').trim();
  const status = String(params.status || '').trim() || '使用中';

  if (!crop) throw new Error('作物名を入力してください');
  if (!containerType) throw new Error('コンテナ種類を入力してください');
  if (!location) throw new Error('拠点を入力してください');

  const initialCount = Number(params.initialCount);
  const remain = Number(params.remain);
  if (!isFinite(initialCount) || initialCount < 0) throw new Error('初期コンテナ数は0以上の数値で入力してください');
  if (!isFinite(remain) || remain < 0) throw new Error('残コンテナ数は0以上の数値で入力してください');
  if (remain > initialCount) throw new Error('残コンテナ数は初期コンテナ数以下にしてください');

  let contentQty = '';
  if (params.contentQty !== '' && params.contentQty != null) {
    const parsedQty = Number(params.contentQty);
    if (!isFinite(parsedQty) || parsedQty < 0) throw new Error('内容個数は0以上の数値で入力してください');
    contentQty = parsedQty;
  }

  lotSheet.getRange(targetRow, idx.crop + 1).setValue(crop);
  lotSheet.getRange(targetRow, idx.fields + 1).setValue(fields);
  lotSheet.getRange(targetRow, idx.containerType + 1).setValue(containerType);
  lotSheet.getRange(targetRow, idx.initialCount + 1).setValue(initialCount);
  lotSheet.getRange(targetRow, idx.remain + 1).setValue(remain);
  lotSheet.getRange(targetRow, idx.status + 1).setValue(status);
  lotSheet.getRange(targetRow, idx.location + 1).setValue(location);
  lotSheet.getRange(targetRow, idx.contentUnit + 1).setValue(contentUnit);
  lotSheet.getRange(targetRow, idx.contentQty + 1).setValue(contentQty);

  writeLog(userName, 'ロット編集', lotId, `作物:${crop}, 種類:${containerType}, 初期:${initialCount}, 残:${remain}, 状態:${status}, 拠点:${location}`);

  return { success: true, lotId: lotId, rowIndex: targetRow };
}

function ssGetLotSheet_() {
  try {
    return TENANT_SS ? TENANT_SS.getSheetByName('ロット記録') : null;
  } catch (e) {
    return null;
  }
}

// ==========================================
// 📦 出荷記録処理
// ==========================================
function saveGlobalShipping(params) {
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
  
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
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
  const invSheet = ss.getSheetByName('在庫記録');
  invSheet.deleteRow(params.rowIndex); // 行を削除
  return recalcStock(params.materialId); // 再計算して新しい在庫を返す
}

function editInventoryHistory(params) {
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
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
  const sheet = ensureNoukiMasterSheet();
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

  const photo1Url = params.photos && params.photos.length > 0 ? saveImage(params.photos[0]) : (params.photo || "");
  const photo2Url = params.photos && params.photos.length > 1 ? saveImage(params.photos[1]) : (params.photo2 || "");
  const signName = params.signName || "";
  const signId = params.signId || "";
  const fuel = params.fuel || params.fuelType || "";
  
  // A–R + S–Y(空) + Z以降(統一拡張列)
  const row = buildNoukiMachineRow({
    id: newId,
    name: params.name,
    model: params.model || params.modelType || "",
    workCategory: params.workCategory || "",
    photo: photo1Url,
    photo2: photo2Url,
    signName: signName,
    signId: signId,
    category: params.category || "",
    purchaseDate: params.purchaseDate || "",
    userName: params.userName || "",
    parts: params.parts || "",
    currentLocName: params.currentLocName || signName,
    currentLocId: params.currentLocId || signId,
    symptoms: params.symptoms || "",
    targetMachineIds: params.targetMachineIds || "",
    fuel: fuel,
    machineNumber: params.machineNumber || params.serialNo || "",
    group: params.group || "",
    type: params.type || "",
    location: params.location || "",
    status: params.status || "使用可能",
    lat: params.lat || "",
    lng: params.lng || "",
    maintenanceSettings: params.maintenanceSettings || []
  });
  // appendRow はシート列幅と不一致で失敗することがあるため明示範囲に書く
  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, row.length).setValues([row]);

  writeLog(params.userName, "農機新規登録", params.name, `定位置: ${signName}`);
  
  return parseNoukiMachineRow(row);
}
// ==========================================
// 資材マスタの編集
// ==========================================
function editMaterial(params) {
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
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
// 品種作型登録 (ファイル付き)
// ==========================================
function saveCroptypeWithFile(params) {
  try {
    let fileUrls = [];
    
    // Process files array if exists
    if (params.files && Array.isArray(params.files) && params.files.length > 0) {
      const folderName = "情熱MAP品種情報";
      let folders = DriveApp.getFoldersByName(folderName);
      let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
      
      params.files.forEach(f => {
        if (f.base64Data && f.fileName) {
          let byteString = Utilities.base64Decode(f.base64Data);
          let blob = Utilities.newBlob(byteString, f.mimeType || 'application/octet-stream', f.fileName);
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fileUrls.push(file.getUrl());
        }
      });
    } else if (params.fileData && params.fileName) { // fallback
      let dataStr = params.fileData;
      let splitBase = dataStr.split(',');
      let type = splitBase[0].split(';')[0].replace('data:', '');
      let byteString = Utilities.base64Decode(splitBase[1]);
      let blob = Utilities.newBlob(byteString, type, params.fileName);
      
      const folderName = "情熱MAP品種情報";
      let folders = DriveApp.getFoldersByName(folderName);
      let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
      
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileUrls.push(file.getUrl());
    }
    
    let fileUrl = fileUrls.join(',');
    
    // Save to 作型DB
    const ss = TENANT_SS;
    let sheet = ss.getSheetByName('作型DB');
    if (!sheet) {
      sheet = ss.insertSheet('作型DB');
      sheet.appendRow(['作物', '品種', 'まき時期', '産地', '播種', '定植', '収穫', 'ファイルURL', '特性', 'メーカー']);
    }
    
    const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
    
    let fileUrlColIndex = headers.indexOf('ファイルURL') + 1;
    if (fileUrlColIndex === 0) {
      fileUrlColIndex = headers.length + 1;
      sheet.getRange(1, fileUrlColIndex).setValue('ファイルURL');
      headers.push('ファイルURL');
    }
    
    let charColIndex = headers.indexOf('特性') + 1;
    if (charColIndex === 0) {
      charColIndex = headers.length + 1;
      sheet.getRange(1, charColIndex).setValue('特性');
      headers.push('特性');
    }
    
    let makerColIndex = headers.indexOf('メーカー') + 1;
    if (makerColIndex === 0) {
      makerColIndex = headers.length + 1;
      sheet.getRange(1, makerColIndex).setValue('メーカー');
      headers.push('メーカー');
    }
    
    let harvestSeasonColIndex = headers.indexOf('とる時期') + 1;
    if (harvestSeasonColIndex === 0) {
      harvestSeasonColIndex = headers.length + 1;
      sheet.getRange(1, harvestSeasonColIndex).setValue('とる時期');
      headers.push('とる時期');
    }
    
    const data = sheet.getDataRange().getValues();
    let updated = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(params.crop).trim() && 
          String(data[i][1]).trim() === String(params.variety).trim() && 
          String(data[i][2] || '').trim() === String(params.season || '').trim() && 
          String(data[i][3] || '').trim() === String(params.climate || '').trim()) {
        
        sheet.getRange(i + 1, 5).setValue(JSON.stringify(params.sowing || []));
        sheet.getRange(i + 1, 6).setValue(JSON.stringify(params.planting || []));
        sheet.getRange(i + 1, 7).setValue(JSON.stringify(params.harvesting || []));
        if (fileUrl) {
          // If already exists, we might want to append? 
          // For now, overwrite or keep new ones if provided.
          sheet.getRange(i + 1, fileUrlColIndex).setValue(fileUrl);
        }
        if (params.characteristics) {
          sheet.getRange(i + 1, charColIndex).setValue(params.characteristics);
        }
        if (params.maker) {
          sheet.getRange(i + 1, makerColIndex).setValue(params.maker);
        }
        if (params.harvestSeason) {
          sheet.getRange(i + 1, harvestSeasonColIndex).setValue(params.harvestSeason);
        }
        updated = true;
        break;
      }
    }
    
    if (!updated) {
      let newRow = new Array(headers.length).fill('');
      newRow[0] = params.crop;
      newRow[1] = params.variety;
      newRow[2] = params.season || '';
      newRow[3] = params.climate || '';
      newRow[4] = JSON.stringify(params.sowing || []);
      newRow[5] = JSON.stringify(params.planting || []);
      newRow[6] = JSON.stringify(params.harvesting || []);
      newRow[fileUrlColIndex - 1] = fileUrl;
      newRow[charColIndex - 1] = params.characteristics || '';
      newRow[makerColIndex - 1] = params.maker || '';
      newRow[harvestSeasonColIndex - 1] = params.harvestSeason || '';
      sheet.appendRow(newRow);
    }
    
    return { success: true, message: "作型を保存しました", url: fileUrl };
  } catch(e) {
    return { success: false, message: e.message };
  }
}
// ==========================================
// 看板の連携IDを「看板」シートのI列に保存
// ==========================================
function updateSignLink(params) {
  const ss = TENANT_SS;
  const sh = ss.getSheetByName('看板');
  if(!sh) return false;
  const data = sh.getDataRange().getValues();
  const numColumns = sh.getDataRange().getNumColumns();
  for(let i=1; i<data.length; i++) {
    if(data[i][0] === params.id) {
      if(numColumns >= 9) sh.getRange(i+1, 9).setValue(params.linkedSigns); // I列は9番目
      return true;
    }
  }
  return false;
}
// ==========================================
// 🪚 道具マスタへの新規登録
// ==========================================
function addToolToMaster(params) {
  const ss = TENANT_SS;
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
  const ss = TENANT_SS;
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
  const sheet = TENANT_SS.getSheetByName('道具マスタ');
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
  const sheet = TENANT_SS.getSheetByName('道具マスタ');
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
  const sheet = ensureNoukiMasterSheet();
  const data = sheet.getDataRange().getValues();
  let targetRowIndex = -1;
  let existing = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(params.machineId)) {
      targetRowIndex = i + 1;
      existing = parseNoukiMachineRow(data[i]);
      break;
    }
  }
  if (targetRowIndex === -1) throw new Error("指定された農機が見つかりません。");

  const merged = Object.assign({}, existing, {
    name: params.name != null ? params.name : existing.name,
    model: params.model != null ? params.model : (params.modelType != null ? params.modelType : existing.model),
    workCategory: params.workCategory != null ? params.workCategory : existing.workCategory,
    purchaseDate: params.purchaseDate != null ? params.purchaseDate : existing.purchaseDate,
    machineNumber: params.machineNumber != null ? params.machineNumber : (params.serialNo != null ? params.serialNo : existing.machineNumber),
    group: params.group != null ? params.group : existing.group,
    type: params.type != null ? params.type : existing.type,
    location: params.location != null ? params.location : existing.location,
    fuel: params.fuel != null ? params.fuel : (params.fuelType != null ? params.fuelType : existing.fuel),
    status: params.status != null ? params.status : existing.status,
    signId: params.signId != null ? params.signId : existing.signId,
    signName: params.signName != null ? params.signName : existing.signName
  });
  const row = buildNoukiMachineRow(merged);
  sheet.getRange(targetRowIndex, 1, 1, row.length).setValues([row]);
  return true;
}

// ==========================================
// 🚜 農機・車両マスタからの削除
// ==========================================
function deleteMachineFromMaster(params) {
  const sheet = TENANT_SS.getSheetByName('農機マスタ');
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
// 🗺️ 短縮URLを展開して座標を取得する関数（オブジェクト形式で返す版）
// ==========================================
function getMapCoordinates(params) {
  var url = params.url;
  var maxRedirects = 10;
  var loopCount = 0;
  
  try {
    // リダイレクトを追跡
    while (loopCount < maxRedirects) {
      var response = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
      var headers = response.getHeaders();
      var responseCode = response.getResponseCode();
      
      if (responseCode >= 300 && responseCode < 400 && headers['Location']) {
        var nextUrl = headers['Location'];
        if (nextUrl.startsWith('/')) { nextUrl = "https://www.google.com" + nextUrl; }
        url = nextUrl;
        loopCount++;
      } else {
        break; 
      }
    }
    
    // 展開された最終的なURLから座標を探す
    var latitude, longitude;
    var regexPin = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;
    var regexAt = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    var regexQ = /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/;
    var regexLl = /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/;

    var match = url.match(regexPin);
    if (match) { latitude = match[1]; longitude = match[2]; } 
    else {
      match = url.match(regexAt);
      if (match) { latitude = match[1]; longitude = match[2]; } 
      else {
        match = url.match(regexQ);
        if (match) { latitude = match[1]; longitude = match[2]; } 
        else {
          match = url.match(regexLl);
          if (match) { latitude = match[1]; longitude = match[2]; }
        }
      }
    }
    
    // 【重要】HTML側が期待している通り「success, lat, lng」の形式で返す！
    if (latitude && longitude) {
      return { success: true, lat: parseFloat(latitude), lng: parseFloat(longitude), expandedUrl: url };
    } else {
      return { success: false, error: "展開後のURLから座標が見つかりませんでした。", expandedUrl: url };
    }
    
  } catch (e) {
    return { success: false, error: "通信エラー: " + e.message };
  }
}
function testAuth() {
  UrlFetchApp.fetch("https://www.google.com");
}

// ==========================================
// 過去の図面履歴の取得
// ==========================================
function getPolygonDrawingHistory(params) {
  try {
    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('図面履歴');
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; // データがない場合

    const history = [];
    const targetId = String(params.id || "");

    // 後ろから検索して最新の20件だけ取得する
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === targetId) {
        let dateVal = data[i][2];
        let dateStr = "";
        if (dateVal instanceof Date) {
          dateStr = Utilities.formatDate(dateVal, "JST", "yyyy/MM/dd HH:mm:ss");
        } else {
          dateStr = String(dateVal || "");
        }

        let dataVal = data[i][3];

        history.push({
          date: dateStr,
          data: dataVal ? String(dataVal) : ""
        });

        if (history.length >= 20) break;
      }
    }

    return history;
  } catch(e) {
    throw new Error("履歴取得エラー: " + e.message);
}}

// ==========================================
// 圃場メモ（鶏糞CAD風）保存・履歴
// ==========================================
function ensureFieldMemoHistorySheet_(ss) {
  let sheet = ss.getSheetByName('圃場メモ履歴');
  if (!sheet) {
    sheet = ss.insertSheet('圃場メモ履歴');
    sheet.appendRow(['圃場ID', '圃場名', '作業日', '更新日時', '更新者', 'JSON']);
  }
  return sheet;
}

function ensureFieldMemoColumnHeader_(sheet) {
  try {
    const header = sheet.getRange(1, 19).getValue();
    if (!header) sheet.getRange(1, 19).setValue('圃場メモ');
  } catch (e) {}
}

function saveFieldMemo(params) {
  const ss = TENANT_SS;
  if (!ss) throw new Error('スプレッドシートが未設定です');
  const id = String(params.id || '');
  if (!id) throw new Error('圃場IDがありません');

  const sheet = ss.getSheetByName('圃場');
  if (!sheet) throw new Error('圃場シートが見つかりません');
  ensureFieldMemoColumnHeader_(sheet);

  const data = sheet.getDataRange().getValues();
  let targetRow = -1;
  let fieldName = '';
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      targetRow = i + 1;
      fieldName = String(data[i][1] || '');
      break;
    }
  }
  if (targetRow === -1) throw new Error('対象の圃場が見つかりません');

  let memoObj = params.fieldMemo;
  if (typeof memoObj === 'string') {
    try { memoObj = JSON.parse(memoObj); } catch (e) { throw new Error('メモデータの形式が不正です'); }
  }
  if (!memoObj || typeof memoObj !== 'object') throw new Error('メモデータがありません');

  const userName = params.userName || memoObj.updatedBy || '不明';
  const workDate = memoObj.workDate || Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
  const updatedAt = Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss');
  memoObj.workDate = workDate;
  memoObj.updatedAt = updatedAt;
  memoObj.updatedBy = userName;

  const jsonStr = JSON.stringify(memoObj);
  sheet.getRange(targetRow, 19).setValue(jsonStr); // S列

  const historySheet = ensureFieldMemoHistorySheet_(ss);
  historySheet.appendRow([id, fieldName || params.name || '', workDate, updatedAt, userName, jsonStr]);

  writeLog(userName, '圃場メモ保存', fieldName || id, '作業日: ' + workDate);
  return { success: true, fieldMemo: memoObj };
}

function getFieldMemoHistory(params) {
  try {
    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('圃場メモ履歴');
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const history = [];
    const targetId = String(params.id || '');

    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) !== targetId) continue;

      let workDate = data[i][2];
      let updatedAt = data[i][3];
      if (workDate instanceof Date) workDate = Utilities.formatDate(workDate, 'JST', 'yyyy-MM-dd');
      else workDate = String(workDate || '');
      if (updatedAt instanceof Date) updatedAt = Utilities.formatDate(updatedAt, 'JST', 'yyyy/MM/dd HH:mm:ss');
      else updatedAt = String(updatedAt || '');

      let dataVal = data[i][5];
      history.push({
        workDate: workDate,
        date: updatedAt,
        updatedBy: String(data[i][4] || ''),
        data: dataVal ? String(dataVal) : ''
      });
      if (history.length >= 20) break;
    }
    return history;
  } catch (e) {
    throw new Error('圃場メモ履歴取得エラー: ' + e.message);
  }
}

// ==========================================
// 📍 トラッキングデータの保存
// ==========================================
function saveTrackingData(params) {
  try {
    const ss = TENANT_SS;
    let sheet = ss.getSheetByName('トラッキング');
    if (!sheet) {
      sheet = ss.insertSheet('トラッキング');
      sheet.appendRow(['日時', 'ユーザー名', '緯度', '経度', '種類']);
    }
    
    const timeStr = params.time ? new Date(params.time).toISOString() : new Date().toISOString();
    const type = params.type || '移動';
    sheet.appendRow([timeStr, params.userName, params.lat, params.lng, type]);
    
    return "success";
  } catch(e) {
    throw new Error("トラッキング保存エラー: " + e.message);
  }
}

// ==========================================
// 📍 トラッキングデータの取得
// ==========================================
function getTrackingData(params) {
  try {
    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('トラッキング');
    
    const allUsers = [];
    const meiboSheet = ss.getSheetByName('名簿');
    if (meiboSheet) {
      const meiboData = meiboSheet.getDataRange().getValues();
      for (let i = 1; i < meiboData.length; i++) {
        const userName = String(meiboData[i][2] || '').trim();
        if (userName) {
          allUsers.push(userName);
        }
      }
    }

    if (!sheet) return { trackingData: [], allUsers: allUsers };
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { trackingData: [], allUsers: allUsers };
    
    let startRow = 2;
    let numRows = lastRow - 1;
    let targetDateStr = null;
    let daysBack = null;
    const filterUser = (params && params.userName) ? String(params.userName).replace(/\s+/g, '') : '';
    const attendanceOnly = !!(params && params.attendanceOnly);
    
    if (params && params.targetDate) {
      targetDateStr = params.targetDate;
      startRow = Math.max(2, lastRow - 9999);
      numRows = lastRow - startRow + 1;
    } else if (params && params.days) {
      daysBack = Math.max(1, Math.min(90, parseInt(params.days, 10) || 30));
      startRow = Math.max(2, lastRow - 14999);
      numRows = lastRow - startRow + 1;
    } else {
      startRow = Math.max(2, lastRow - 1999);
      numRows = lastRow - startRow + 1;
    }
    
    const values = sheet.getRange(startRow, 1, numRows, 5).getValues();
    
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const cutoff = daysBack ? (now - daysBack * oneDay) : null;
    
    function isAttendanceType(type) {
      const t = String(type || '');
      return t === '出勤' || t === 'アプリ起動' || t === '出勤取消' || t === '退勤' || t.indexOf('退勤(') === 0;
    }
    
    const data = [];
    for (let i = 0; i < values.length; i++) {
      const timeStr = values[i][0];
      const userName = values[i][1];
      const lat = values[i][2];
      const lng = values[i][3];
      const type = values[i][4];
      
      const tObj = new Date(timeStr);
      if (isNaN(tObj.getTime())) continue;

      if (filterUser) {
        const rowUser = String(userName || '').replace(/\s+/g, '');
        if (!rowUser) continue;
        if (rowUser !== filterUser && filterUser.indexOf(rowUser) < 0 && rowUser.indexOf(filterUser) < 0) continue;
      }

      if (attendanceOnly && !isAttendanceType(type)) continue;
      
      if (targetDateStr) {
        const y = tObj.getFullYear();
        const m = String(tObj.getMonth() + 1).padStart(2, '0');
        const d = String(tObj.getDate()).padStart(2, '0');
        if (`${y}-${m}-${d}` === targetDateStr) {
          data.push({ type: type, time: timeStr, userName: userName, lat: lat, lng: lng });
        }
      } else if (cutoff != null) {
        if (tObj.getTime() >= cutoff) {
          data.push({ type: type, time: timeStr, userName: userName, lat: lat, lng: lng });
        }
      } else {
        if (now - tObj.getTime() <= oneDay) {
          data.push({ type: type, time: timeStr, userName: userName, lat: lat, lng: lng });
        }
      }
    }
    
    return { trackingData: data, allUsers: allUsers };
  } catch(e) {
    throw new Error("トラッキング取得エラー: " + e.message);
  }
}

// ==========================================
// 📍 作業記録の開始時間ヒント（軽量・高速）
// 出勤時刻＋指定日の最遅終了時刻だけを返す
// ==========================================
function getWorkRecordTimeHints(params) {
  try {
    const userName = String((params && params.userName) || '').replace(/\s+/g, '');
    const todayYmd = Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
    const dateYmd = String((params && params.dateYmd) || todayYmd).trim() || todayYmd;
    const result = {
      dateYmd: dateYmd,
      todayYmd: todayYmd,
      clockInTime: '',
      clockInDateYmd: '',
      latestEndTime: '',
      open: false
    };
    if (!userName) return result;

    // 1) 開いている出勤（トラッキング）— getOpenClockInStatus と同じ軽量スキャン
    try {
      const openSt = getOpenClockInStatus({ userName: userName });
      if (openSt && openSt.open) {
        result.open = true;
        result.clockInTime = openSt.clockInTime || '';
        result.clockInDateYmd = openSt.clockInDateYmd || '';
        result.lunchRegistered = !!openSt.lunchRegistered;
        result.lunchEnabled = !!openSt.lunchEnabled;
        result.lunchStart = openSt.lunchStart || '';
        result.lunchEnd = openSt.lunchEnd || '';
        // 対象日の出勤なら開始候補に使える
        if (result.clockInDateYmd === dateYmd) {
          // ok
        } else if (result.clockInDateYmd && result.clockInDateYmd !== dateYmd) {
          // 別日の未退勤。開始時間には使わない（forgot扱い）
          result.clockInTime = '';
        }
      }
    } catch (e) {}

    // 2) 作業記録シートから指定日・本人の最遅終了時間
    const sheet = TENANT_SS.getSheetByName('作業記録');
    if (!sheet || sheet.getLastRow() <= 1) return result;

    const lastRow = sheet.getLastRow();
    // 直近最大3000行だけ見る（当日分は末尾付近に集中しやすい）
    const startRow = Math.max(2, lastRow - 2999);
    const numRows = lastRow - startRow + 1;
    // A〜H: 記録時間,圃場名,記録者,作業日,作業名,作物名,開始,終了
    const values = sheet.getRange(startRow, 1, numRows, 8).getValues();
    let latestEnd = '';

    const normDate = (v) => {
      if (v instanceof Date && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, 'JST', 'yyyy-MM-dd');
      }
      const s = String(v || '').trim();
      const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (!m) return '';
      return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    };
    const normTime = (v) => {
      if (v instanceof Date && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, 'JST', 'HH:mm');
      }
      const s = String(v || '').trim();
      const m = s.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return '';
      return ('0' + m[1]).slice(-2) + ':' + m[2];
    };

    for (let i = 0; i < values.length; i++) {
      const rowUser = String(values[i][2] || '').replace(/\s+/g, '');
      if (!rowUser) continue;
      if (rowUser !== userName && userName.indexOf(rowUser) < 0 && rowUser.indexOf(userName) < 0) continue;
      const rowDate = normDate(values[i][3]);
      if (rowDate !== dateYmd) continue;
      const endTime = normTime(values[i][7]);
      if (endTime && endTime > latestEnd) latestEnd = endTime;
    }

    if (latestEnd === '12:00') latestEnd = '13:00';
    result.latestEndTime = latestEnd;
    return result;
  } catch (e) {
    throw new Error('作業時間ヒント取得エラー: ' + e.message);
  }
}

// ==========================================
// 📍 未退勤（開いている出勤）の有無をサーバーで判定
// ==========================================
function getOpenClockInStatus(params) {
  try {
    const userName = String((params && params.userName) || '').replace(/\s+/g, '');
    if (!userName) return { open: false, forgot: false, lunchRegistered: false };

    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('トラッキング');
    const todayYmd = Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
    if (!sheet || sheet.getLastRow() <= 1) {
      return { open: false, forgot: false, lunchRegistered: false, todayYmd: todayYmd };
    }

    const lastRow = sheet.getLastRow();
    const startRow = Math.max(2, lastRow - 4999);
    const numRows = lastRow - startRow + 1;
    const values = sheet.getRange(startRow, 1, numRows, 5).getValues();

    const padHm = (hm) => {
      const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return String(hm || '');
      return ('0' + m[1]).slice(-2) + ':' + m[2];
    };

    let openIn = null;
    let lunch = null;
    for (let i = 0; i < values.length; i++) {
      const rowUser = String(values[i][1] || '').replace(/\s+/g, '');
      if (!rowUser) continue;
      if (rowUser !== userName && userName.indexOf(rowUser) < 0 && rowUser.indexOf(userName) < 0) continue;

      const type = String(values[i][4] || '');
      const tObj = new Date(values[i][0]);
      if (isNaN(tObj.getTime())) continue;

      const isIn = (type === '出勤' || type === 'アプリ起動');
      const isOut = (type === '退勤' || type.indexOf('退勤(') === 0);
      const isCancel = (type === '出勤取消');

      if (isIn) {
        openIn = { ms: tObj.getTime() };
        lunch = null;
      } else if (isOut || isCancel) {
        openIn = null;
        lunch = null;
      } else if (openIn) {
        if (type === '昼休憩なし') {
          lunch = { registered: true, enabled: false, start: '', end: '' };
        } else if (type.indexOf('昼休憩') === 0) {
          const m = type.match(/昼休憩[（(]\s*(\d{1,2}:\d{2})\s*[-〜~－–]\s*(\d{1,2}:\d{2})\s*[）)]/);
          if (m) {
            lunch = { registered: true, enabled: true, start: padHm(m[1]), end: padHm(m[2]) };
          } else {
            lunch = { registered: true, enabled: true, start: '', end: '' };
          }
        }
      }
    }

    if (!openIn) {
      return { open: false, forgot: false, lunchRegistered: false, todayYmd: todayYmd };
    }

    const clockInDateYmd = Utilities.formatDate(new Date(openIn.ms), 'JST', 'yyyy-MM-dd');
    const clockInTime = Utilities.formatDate(new Date(openIn.ms), 'JST', 'HH:mm');
    return {
      open: true,
      forgot: clockInDateYmd < todayYmd,
      clockInDateYmd: clockInDateYmd,
      clockInTime: clockInTime,
      todayYmd: todayYmd,
      lunchRegistered: !!(lunch && lunch.registered),
      lunchEnabled: !!(lunch && lunch.enabled),
      lunchStart: (lunch && lunch.start) || '',
      lunchEnd: (lunch && lunch.end) || ''
    };
  } catch (e) {
    throw new Error('出退勤状態取得エラー: ' + e.message);
  }
}

// trigger clasp


function saveCultivationPlans(year, crop, planDataArray) {
  try {
    const ss = TENANT_SS;
    let sheet = ss.getSheetByName('栽培計画');
    if (!sheet) {
      sheet = ss.insertSheet('栽培計画');
      sheet.appendRow(['タイムスタンプ', '年度', 'ID', '作物', '品種', '計画データ(JSON)']);
    } else {
      const lastCol = sheet.getLastColumn();
      if (lastCol === 0) {
        sheet.appendRow(['タイムスタンプ', '年度', 'ID', '作物', '品種', '計画データ(JSON)']);
      } else {
        const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        if (headers.length < 3 || headers[1] !== '年度' || headers[2] !== 'ID') {
           sheet.clear();
           sheet.appendRow(['タイムスタンプ', '年度', 'ID', '作物', '品種', '計画データ(JSON)']);
        }
      }
    }
    
    // 1. Delete existing rows for this year and crop
    if (sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow(), 6).getValues();
      for (let i = data.length - 1; i >= 0; i--) {
        if (String(data[i][1]) === String(year) && String(data[i][3]) === String(crop)) {
          sheet.deleteRow(i + 2);
        }
      }
    }
    
    // 2. Append new rows（常に未実行=planned として保存。実行は executeCultivationPlans）
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    for (const plan of planDataArray) {
       plan.status = 'planned';
       delete plan.executedAt;
       sheet.appendRow([
          timestamp,
          year,
          plan.id,
          plan.crop,
          plan.variety,
          JSON.stringify(plan)
       ]);
       try {
         appendCultivationMaster({
           crop: plan.crop,
           variety: plan.variety,
           holes: plan.holes,
           rows: plan.rows,
           pSpace: plan.pSpace,
           rSpace: plan.rSpace,
           yieldPerSeedling: plan.yieldPerPlant || plan.yieldPerSeedling || '',
           itemsPerPack: plan.itemsPerPack || ''
         });
       } catch (appendErr) {}
    }
    
    return { status: 'success', message: '栽培計画を未実行計画として保存しました' };
  } catch(e) {
    throw new Error("栽培計画保存エラー: " + e.message);
  }
}

function getCultivationPlans(year, crop) {
  try {
    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('栽培計画');
    if (!sheet) return [];
    
    if (sheet.getLastRow() <= 1) return [];
    
    const data = sheet.getRange(2, 1, sheet.getLastRow(), 6).getValues();
    const results = [];
    
    for (let i = 0; i < data.length; i++) {
       const row = data[i];
       if (String(row[1]) === String(year) && String(row[3]) === String(crop)) {
          try {
             const planData = JSON.parse(row[5]);
             results.push(planData);
          } catch(e) {}
       }
    }
    return results;
  } catch(e) {
    throw new Error("栽培計画取得エラー: " + e.message);
  }
}

function getSavedCultivationPlanList() {
  try {
    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('栽培計画');
    if (!sheet || sheet.getLastRow() <= 1) return [];
    
    const data = sheet.getRange(2, 1, sheet.getLastRow(), 6).getValues();
    const map = {};
    
    for (let i = 0; i < data.length; i++) {
       const row = data[i];
       const year = String(row[1]);
       const crop = String(row[3]);
       if (!year || !crop) continue;
       
       let status = 'planned';
       try {
         const planData = JSON.parse(row[5]);
         if (planData && planData.status === 'executed') status = 'executed';
       } catch (e) {}
       
       const key = year + "_" + crop;
       if (!map[key]) {
           map[key] = {
             year: year,
             crop: crop,
             count: 0,
             plannedCount: 0,
             executedCount: 0,
             lastUpdated: row[0]
           };
       }
       map[key].count++;
       if (status === 'executed') map[key].executedCount++;
       else map[key].plannedCount++;
       if (new Date(row[0]) > new Date(map[key].lastUpdated)) {
           map[key].lastUpdated = row[0];
       }
    }
    
    return Object.values(map).sort((a, b) => b.year.localeCompare(a.year));
  } catch(e) {
    throw new Error("栽培計画リスト取得エラー: " + e.message);
  }
}

/** 保存済み栽培計画を年度＋作物単位で削除 */
function deleteSavedCultivationPlans(year, crop) {
  try {
    const ss = TENANT_SS;
    if (!ss) return { success: false, message: 'スプレッドシート未設定' };
    const sheet = ss.getSheetByName('栽培計画');
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, deleted: 0, message: '削除対象はありませんでした' };
    }

    const targetYear = String(year || '').trim();
    const targetCrop = String(crop || '').trim();
    if (!targetYear || !targetCrop) {
      return { success: false, message: '年度と作物は必須です' };
    }

    const data = sheet.getRange(2, 1, sheet.getLastRow(), 6).getValues();
    let deleted = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][1]) === targetYear && String(data[i][3]) === targetCrop) {
        sheet.deleteRow(i + 2);
        deleted++;
      }
    }
    SpreadsheetApp.flush();
    return {
      success: true,
      deleted: deleted,
      message: deleted > 0
        ? `${targetYear}年 ${targetCrop} の計画を${deleted}件削除しました`
        : '削除対象はありませんでした'
    };
  } catch (e) {
    return { success: false, message: '栽培計画削除エラー: ' + e.message };
  }
}

/** 半旬インデックスへ正規化（オブジェクト or フラット番号） */
function cpHarvestFlatIndex_(h) {
  if (h == null) return -1;
  if (typeof h === 'number' && isFinite(h)) return Math.floor(h);
  if (typeof h === 'object') {
    if (h.monthIndex != null && (h.periodIndex != null || h.period != null)) {
      const p = h.periodIndex != null ? h.periodIndex : h.period;
      return Number(h.monthIndex) * 6 + Number(p);
    }
  }
  return -1;
}

/** 1計画の半旬別収穫量配列(108)を算出 */
function computePlanHarvestByPeriod_(plan) {
  const PERIODS = 108;
  const amounts = [];
  for (let i = 0; i < PERIODS; i++) amounts.push(0);
  if (!plan) return amounts;

  let harvesting = [];
  if (plan.tasks && Array.isArray(plan.tasks.harvesting)) harvesting = plan.tasks.harvesting;
  else if (Array.isArray(plan.harvesting)) harvesting = plan.harvesting;
  if (!harvesting.length) return amounts;

  const cells = [];
  for (let i = 0; i < harvesting.length; i++) {
    const h = harvesting[i];
    const flat = cpHarvestFlatIndex_(h);
    if (flat < 0 || flat >= PERIODS) continue;
    cells.push({
      flatIndex: flat,
      amount: (h && typeof h === 'object' && h.amount != null) ? Number(h.amount) : null
    });
  }
  if (!cells.length) return amounts;

  const yieldTotal = Number(plan.yield) || 0;
  const ratios = Array.isArray(plan.harvestRatios) ? plan.harvestRatios : [];
  let totalRatio = 0;
  for (let i = 0; i < ratios.length; i++) totalRatio += (Number(ratios[i]) || 0);

  for (let index = 0; index < cells.length; index++) {
    let cellYield = 0;
    if (yieldTotal > 0) {
      if (totalRatio > 0) {
        cellYield = Math.floor(yieldTotal * (Number(ratios[index]) || 0) / totalRatio);
      } else {
        cellYield = Math.floor(yieldTotal / cells.length);
      }
    } else if (cells[index].amount != null && cells[index].amount > 0) {
      cellYield = Math.floor(cells[index].amount);
    }
    amounts[cells[index].flatIndex] += cellYield;
  }
  return amounts;
}

/**
 * 年度の栽培計画から作物別・半旬別の収穫量サマリーを返す
 * planned / executed を分離
 */
function getCultivationHarvestSummary(year) {
  try {
    const ss = TENANT_SS;
    if (!ss) return { success: false, message: 'スプレッドシート未設定' };
    const sheet = ss.getSheetByName('栽培計画');
    const targetYear = String(year || '').trim() || String(new Date().getFullYear());
    const PERIODS = 108;
    const cropMap = {};

    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow(), 6).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][1]) !== targetYear) continue;
        let plan = null;
        try {
          plan = JSON.parse(data[i][5]);
        } catch (e) {
          continue;
        }
        if (!plan) continue;
        const crop = String(plan.crop || data[i][3] || '').trim();
        if (!crop) continue;
        if (!cropMap[crop]) {
          cropMap[crop] = {
            crop: crop,
            planned: [],
            executed: []
          };
          for (let p = 0; p < PERIODS; p++) {
            cropMap[crop].planned.push(0);
            cropMap[crop].executed.push(0);
          }
        }
        const amounts = computePlanHarvestByPeriod_(plan);
        const status = (plan.status === 'executed') ? 'executed' : 'planned';
        const target = cropMap[crop][status];
        for (let p = 0; p < PERIODS; p++) {
          target[p] += amounts[p] || 0;
        }
      }
    }

    const crops = Object.keys(cropMap).sort().map(function(k) {
      const row = cropMap[k];
      let plannedTotal = 0;
      let executedTotal = 0;
      for (let p = 0; p < PERIODS; p++) {
        plannedTotal += row.planned[p];
        executedTotal += row.executed[p];
      }
      return {
        crop: row.crop,
        planned: row.planned,
        executed: row.executed,
        plannedTotal: plannedTotal,
        executedTotal: executedTotal,
        total: plannedTotal + executedTotal
      };
    });

    return { success: true, year: targetYear, periods: PERIODS, crops: crops };
  } catch (e) {
    return { success: false, message: '収穫サマリー取得エラー: ' + e.message };
  }
}

/**
 * 指定圃場が栽培計画の圃場選択に含まれていれば、その計画の畝間(rSpace)等を返す。
 * 畝選択ID (fieldId#une#N) にも対応。最新の計画を優先。
 */
function getCultivationRidgeParamsForField(fieldId) {
  try {
    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('栽培計画');
    if (!sheet || sheet.getLastRow() <= 1) return null;

    const target = String(fieldId || '').trim();
    if (!target) return null;

    const parentMatch = target.match(/^(.+)#une#\d+$/);
    const parentId = parentMatch ? parentMatch[1] : target;

    const data = sheet.getRange(2, 1, sheet.getLastRow(), 6).getValues();
    let best = null;
    let bestTime = 0;

    for (let i = 0; i < data.length; i++) {
      let plan = null;
      try {
        plan = JSON.parse(data[i][5]);
      } catch (e) {
        continue;
      }
      if (!plan || !Array.isArray(plan.fieldIds) || plan.fieldIds.length === 0) continue;

      const matched = plan.fieldIds.some(function(fid) {
        const s = String(fid || '');
        if (!s) return false;
        if (s === target || s === parentId) return true;
        if (s.indexOf(parentId + '#une#') === 0) return true;
        if (target.indexOf(s + '#une#') === 0) return true;
        return false;
      });
      if (!matched) continue;

      const rSpace = parseFloat(plan.rSpace);
      if (!rSpace || rSpace <= 0) continue;

      const ts = data[i][0] ? new Date(data[i][0]).getTime() : 0;
      if (!best || ts >= bestTime) {
        bestTime = ts;
        best = {
          rSpace: rSpace,
          crop: plan.crop || String(data[i][3] || ''),
          variety: plan.variety || String(data[i][4] || ''),
          planId: plan.id || '',
          year: String(data[i][1] || ''),
          updatedAt: data[i][0] || ''
        };
      }
    }
    return best;
  } catch (e) {
    throw new Error('栽培計画畝間取得エラー: ' + e.message);
  }
}

/** 栽培カレンダーの periodIndex(0-5) → 月内の開始日・終了日 */
function cpPeriodDayRange(year, month, periodIndex) {
  const lastDay = new Date(year, month, 0).getDate();
  const startDay = Math.min(periodIndex * 5 + 1, lastDay);
  let endDay = (periodIndex >= 5) ? lastDay : Math.min(periodIndex * 5 + 5, lastDay);
  return { startDay: startDay, endDay: endDay };
}

function cpCellToDateParts(planYear, cell) {
  const monthIndex = (cell.monthIndex != null) ? Number(cell.monthIndex) : 0;
  const month = Number(cell.month) || ((monthIndex % 12) + 1);
  const periodIndex = (cell.periodIndex != null) ? Number(cell.periodIndex) : Number(cell.period) || 0;
  const y = monthIndex >= 12 ? (Number(planYear) + 1) : Number(planYear);
  const range = cpPeriodDayRange(y, month, periodIndex);
  return {
    year: y,
    month: month,
    periodIndex: periodIndex,
    start: new Date(y, month - 1, range.startDay),
    end: new Date(y, month - 1, range.endDay)
  };
}

function formatCpPeriodLabel(planYear, sowingCells) {
  if (!sowingCells || sowingCells.length === 0) return '';
  const periodNames = ['上前', '上後', '中前', '中後', '下前', '下後'];
  const parts = sowingCells.map(c => cpCellToDateParts(planYear, c));
  parts.sort((a, b) => a.start - b.start);
  const first = parts[0];
  const last = parts[parts.length - 1];
  const fLabel = first.month + '月' + (periodNames[first.periodIndex] || '');
  const lLabel = last.month + '月' + (periodNames[last.periodIndex] || '');
  if (fLabel === lLabel) return fLabel;
  return fLabel + '〜' + lLabel;
}

function resolveCpFieldDisplayName_(fieldId) {
  const ss = TENANT_SS;
  const idStr = String(fieldId || '');
  const m = idStr.match(/^(.+)#une#(\d+)$/);
  const baseId = m ? m[1] : idStr;
  const uneIndex = m ? parseInt(m[2], 10) : null;

  const sheet = ss.getSheetByName('圃場');
  if (!sheet || sheet.getLastRow() <= 1) return idStr;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(baseId)) {
      const name = String(data[i][1] || baseId);
      if (uneIndex == null) return name;
      // 畝ラベル（CADデータから）
      let uneLabel = '畝' + (uneIndex + 1);
      try {
        const uneSim = data[i][15];
        if (uneSim) {
          const parsed = (typeof uneSim === 'string') ? JSON.parse(uneSim) : uneSim;
          const list = parsed && parsed.unePolygons ? parsed.unePolygons : (Array.isArray(parsed) ? parsed : []);
          const une = list[uneIndex];
          if (une && une.customLabel) uneLabel = String(une.customLabel);
          else if (une && une.group) uneLabel = String(une.group) + '-' + (uneIndex + 1);
        }
      } catch (e) {}
      return name + '(' + uneLabel + ')';
    }
  }
  return idStr;
}

/**
 * 定植の最も早い半旬順に、作物ごとへタグを割り当て（例: キャベツ1）
 * plans 配列内のオブジェクトを直接更新する
 */
function assignCultivationPlanTags_(plans) {
  if (!plans || plans.length === 0) return;
  const groups = {};
  plans.forEach(plan => {
    const planting = (plan.tasks && plan.tasks.planting) ? plan.tasks.planting : [];
    let earliest = 9999;
    planting.forEach(c => {
      const mIdx = Number(c.monthIndex);
      const pIdx = (c.periodIndex != null) ? Number(c.periodIndex) : Number(c.period);
      if (!isNaN(mIdx) && !isNaN(pIdx)) {
        const idx = mIdx * 6 + pIdx;
        if (idx < earliest) earliest = idx;
      }
    });
    const crop = plan.crop || '';
    if (!groups[crop]) groups[crop] = [];
    groups[crop].push({ plan: plan, earliest: earliest });
  });
  Object.keys(groups).forEach(crop => {
    groups[crop].sort((a, b) => a.earliest - b.earliest);
    groups[crop].forEach((item, index) => {
      item.plan.tag = crop + (index + 1);
    });
  });
}

/**
 * 未実行の栽培計画を「実行」し、播種を作業予定へ登録する
 * params: { year, crop, planIds?: string[] }
 */
function executeCultivationPlans(params) {
  try {
    const year = params.year;
    const crop = params.crop;
    if (!year || !crop) throw new Error('年度と作物が必要です');

    const plans = getCultivationPlans(year, crop);
    if (!plans || plans.length === 0) {
      return { success: false, message: '対象の栽培計画がありません' };
    }

    let targets = plans.filter(p => p.status !== 'executed');
    if (params.planIds && params.planIds.length > 0) {
      const idSet = {};
      params.planIds.forEach(id => { idSet[String(id)] = true; });
      targets = plans.filter(p => idSet[String(p.id)]);
    }

    if (targets.length === 0) {
      return { success: false, message: '実行対象の未実行計画がありません（既に実行済みの可能性があります）' };
    }

    // 実行時に定植の早い順でタグを自動割り当て（作物ごと: キャベツ1, キャベツ2...）
    assignCultivationPlanTags_(plans);

    const ss = TENANT_SS;
    let schedSheet = ss.getSheetByName('作業予定');
    if (!schedSheet) {
      schedSheet = ss.insertSheet('作業予定');
      schedSheet.appendRow(['作業名', '担当部署', '作物名', '圃場名', '予定日', '期限日', '時間', '適合者', '完了日', '写真URL', '場所ID']);
    }

    // 既存の同一計画由来の播種行を削除（再実行用）
    if (schedSheet.getLastRow() > 1) {
      const sData = schedSheet.getRange(2, 1, schedSheet.getLastRow(), 11).getValues();
      const targetIds = {};
      targets.forEach(p => { targetIds['cp:' + p.id] = true; });
      for (let i = sData.length - 1; i >= 0; i--) {
        const placeId = String(sData[i][10] || '');
        const marker = placeId.split('|')[0];
        if (targetIds[marker]) {
          schedSheet.deleteRow(i + 2);
        }
      }
    }

    let created = 0;
    const executedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

    targets.forEach(plan => {
      const sowing = (plan.tasks && plan.tasks.sowing) ? plan.tasks.sowing : [];
      if (sowing.length === 0) return;

      const parts = sowing.map(c => cpCellToDateParts(year, c));
      parts.sort((a, b) => a.start - b.start);
      const startDate = parts[0].start;
      const endDate = parts[parts.length - 1].end;
      const periodLabel = formatCpPeriodLabel(year, sowing);

      const trays = plan.trays || 0;
      const unit = (Number(plan.holes) === 1) ? '粒' : '枚';
      const traysLabel = trays + unit;

      const fieldIds = plan.fieldIds || [];
      const fieldNames = fieldIds.length > 0
        ? fieldIds.map(resolveCpFieldDisplayName_).join(', ')
        : '(圃場未選択)';

      const placeId = 'cp:' + plan.id + (fieldIds.length ? '|' + fieldIds.join(',') : '');

      // A作業名 B部署 C作物(品種) D圃場 E予定 F期限 G枚数 Hタグ I完了 J写真 K場所ID
      // 作業名に期間を含め、一覧で品種・タグ・枚数・期間が分かるようにする
      const workName = '播種 ' + traysLabel + ' [' + periodLabel + ']';
      schedSheet.appendRow([
        workName,
        '',
        plan.variety || plan.crop || '',
        fieldNames,
        startDate,
        endDate,
        traysLabel,
        plan.tag || '',
        '',
        '',
        placeId
      ]);
      created++;

      plan.status = 'executed';
      plan.executedAt = executedAt;
    });

    // 計画シートを更新（実行済みステータスを反映）
    const planSheet = ss.getSheetByName('栽培計画');
    if (planSheet && planSheet.getLastRow() > 1) {
      const data = planSheet.getRange(2, 1, planSheet.getLastRow(), 6).getValues();
      const planMap = {};
      plans.forEach(p => { planMap[String(p.id)] = p; });
      targets.forEach(p => { planMap[String(p.id)] = p; });

      for (let i = 0; i < data.length; i++) {
        if (String(data[i][1]) === String(year) && String(data[i][3]) === String(crop)) {
          const pid = String(data[i][2]);
          if (planMap[pid]) {
            planSheet.getRange(i + 2, 6).setValue(JSON.stringify(planMap[pid]));
          }
        }
      }
    }

    SpreadsheetApp.flush();
    return {
      success: true,
      message: created + '件の播種を作業予定に登録しました（タグは定植順に自動割り当て）',
      created: created,
      executed: targets.length
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}


function getCultivationMaster() {
  try {
    const ss = TENANT_SS;
    let sheet = ss.getSheetByName('栽培計画マスタ');
    if (!sheet) {
      sheet = ss.insertSheet('栽培計画マスタ');
      sheet.appendRow(['作物', '品種', '穴数', '条数', '株間', '畝間', '収穫係数', '定植面積', '1苗当たり収量', '1P当たり入り数']);
    } else {
      const lastCol = sheet.getLastColumn();
      const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      let needsHeaderUpdate = false;
      if (headers.length < 9 || headers[8] !== '1苗当たり収量') {
          sheet.getRange(1, 9).setValue('1苗当たり収量');
      }
      if (headers.length < 10 || headers[9] !== '1P当たり入り数') {
          sheet.getRange(1, 10).setValue('1P当たり入り数');
      }
    }
    const data = sheet.getDataRange().getValues();
    let master = {
      crops: {}, 
      holes: [],
      rows: [],
      pSpace: [],
      rSpace: [],
      yields: [],
      areas: [],
      fields: [], // 追加：圃場情報
      yieldPerSeedling: [], // 1苗当たり収量
      itemsPerPack: [], // 1P当たり入り数
      presets: {} // プリセット情報
    };
    
    // 圃場情報の取得
    const polySheet = ss.getSheetByName('圃場');
    if (polySheet) {
      const polyData = polySheet.getDataRange().getValues();
      if (polyData.length > 1) {
        for (let i = 1; i < polyData.length; i++) {
          let r = polyData[i];
          if (r[0]) {
             // A:ID, B:圃場の名前, E:圃場面積
             master.fields.push({
               id: String(r[0]),
               name: String(r[1]),
               area: Number(r[4]) || 0
             });
          }
        }
      }
    }
    
    // 拠点マスタから拠点リストを取得して返す（栽培計画モーダル用）
    const locationDetails = readLocationMasterDetails_();
    master.locations = locationDetails.map(l => l.name);
    master.locationDetails = locationDetails;
    
    // データがない場合はマスタの反映処理をスキップしますが、プリセット取得処理には進みます
    for (let i = 1; i < data.length; i++) {
      let r = data[i];
      let c = String(r[0]).trim();
      let v = String(r[1]).trim();
      if (c) {
        if (!master.crops[c]) master.crops[c] = [];
        if (v && !master.crops[c].includes(v)) master.crops[c].push(v);
      }
      if (r[2] !== '' && !master.holes.includes(r[2])) master.holes.push(r[2]);
      if (r[3] !== '' && !master.rows.includes(r[3])) master.rows.push(r[3]);
      if (r[4] !== '' && !master.pSpace.includes(r[4])) master.pSpace.push(r[4]);
      if (r[5] !== '' && !master.rSpace.includes(r[5])) master.rSpace.push(r[5]);
      if (r[6] !== '' && !master.yields.includes(r[6])) master.yields.push(r[6]);
      if (r[7] !== '' && !master.areas.includes(r[7])) master.areas.push(r[7]);
      if (r[8] !== undefined && r[8] !== '' && !master.yieldPerSeedling.includes(r[8])) master.yieldPerSeedling.push(r[8]);
      if (r[9] !== undefined && r[9] !== '' && !master.itemsPerPack.includes(r[9])) master.itemsPerPack.push(r[9]);
    }
    
    // 作型DBの取得
    master.croptypesDB = [];
    const croptypeSheet = ss.getSheetByName('作型DB');
    if (!croptypeSheet) {
      ss.insertSheet('作型DB').appendRow(['作物', '品種', 'まき時期', '産地', '播種', '定植', '収穫', 'ファイルURL']);
    } else {
      const dbData = croptypeSheet.getDataRange().getValues();
      const headers = (dbData[0] || []).map(h => String(h || '').trim());
      const fileUrlCol = headers.indexOf('ファイルURL');
      let charCol = headers.indexOf('特性');
      if (charCol === -1) charCol = headers.indexOf('特性(タグ)');
      const makerCol = headers.indexOf('メーカー');
      const harvestSeasonCol = headers.indexOf('とる時期');
      for (let i = 1; i < dbData.length; i++) {
        let r = dbData[i];
        if (r[0] && r[1]) {
          try {
            master.croptypesDB.push({
              crop: String(r[0]),
              variety: String(r[1]),
              season: String(r[2] || ''),
              climate: String(r[3] || ''),
              sowing: r[4] ? JSON.parse(r[4]) : [],
              planting: r[5] ? JSON.parse(r[5]) : [],
              harvesting: r[6] ? JSON.parse(r[6]) : [],
              fileUrl: fileUrlCol !== -1 ? String(r[fileUrlCol] || '') : '',
              characteristics: charCol !== -1 ? String(r[charCol] || '') : '',
              maker: makerCol !== -1 ? String(r[makerCol] || '') : '',
              harvestSeason: harvestSeasonCol !== -1 ? String(r[harvestSeasonCol] || '') : ''
            });
          } catch(e) { console.log('JSON parse error in croptypesDB', e); }
        }
      }
    }
    
    // プリセット情報の取得
    const presetSheet = ensurePresetSheetHeaders_(ss);
    const presetData = presetSheet.getDataRange().getValues();
    const presetHeaders = presetData[0] ? presetData[0].map(h => String(h || '').trim()) : [];
    const locCol = presetHeaders.indexOf('拠点');
    const cropCol = presetHeaders.indexOf('作物');
    const nameCol = presetHeaders.indexOf('プリセット名');
    const holesCol = presetHeaders.indexOf('穴数');
    const rowsCol = presetHeaders.indexOf('条数');
    const pSpaceCol = presetHeaders.indexOf('株間');
    const rSpaceCol = presetHeaders.indexOf('畝間');
    const yieldCol = presetHeaders.indexOf('1苗当たり収量');
    const packCol = presetHeaders.indexOf('1P当たり入り数');
    const urlCol = presetHeaders.indexOf('ファイルURL');
    
    for (let i = 1; i < presetData.length; i++) {
      let r = presetData[i];
      let loc = locCol !== -1 ? String(r[locCol] || '').trim() : '';
      let pc = cropCol !== -1 ? String(r[cropCol] || '').trim() : '';
      let pName = nameCol !== -1 ? String(r[nameCol] || '').trim() : '';
      if (pc && pName) {
        if (!master.presets[pc]) master.presets[pc] = [];
        master.presets[pc].push({
          location: loc,
          crop: pc,
          name: pName,
          holes: holesCol !== -1 ? (r[holesCol] || '') : '',
          rows: rowsCol !== -1 ? (r[rowsCol] || '') : '',
          pSpace: pSpaceCol !== -1 ? (r[pSpaceCol] || '') : '',
          rSpace: rSpaceCol !== -1 ? (r[rSpaceCol] || '') : '',
          yieldPerSeedling: yieldCol !== -1 ? (r[yieldCol] || '') : '',
          itemsPerPack: packCol !== -1 ? (r[packCol] || '') : '',
          fileUrl: urlCol !== -1 ? r[urlCol] : ''
        });
        // プリセットに保存されている数値を各プルダウンの選択肢にも反映する
        if (holesCol !== -1 && r[holesCol] !== '' && r[holesCol] !== undefined && !master.holes.includes(r[holesCol])) master.holes.push(r[holesCol]);
        if (rowsCol !== -1 && r[rowsCol] !== '' && r[rowsCol] !== undefined && !master.rows.includes(r[rowsCol])) master.rows.push(r[rowsCol]);
        if (pSpaceCol !== -1 && r[pSpaceCol] !== '' && r[pSpaceCol] !== undefined && !master.pSpace.includes(r[pSpaceCol])) master.pSpace.push(r[pSpaceCol]);
        if (rSpaceCol !== -1 && r[rSpaceCol] !== '' && r[rSpaceCol] !== undefined && !master.rSpace.includes(r[rSpaceCol])) master.rSpace.push(r[rSpaceCol]);
        if (yieldCol !== -1 && r[yieldCol] !== undefined && r[yieldCol] !== '' && !master.yieldPerSeedling.includes(r[yieldCol])) master.yieldPerSeedling.push(r[yieldCol]);
        if (packCol !== -1 && r[packCol] !== undefined && r[packCol] !== '' && !master.itemsPerPack.includes(r[packCol])) master.itemsPerPack.push(r[packCol]);
        // プリセットの作物名だけ作物選択肢に反映（プリセット名は品種候補にしない）
        if (!master.crops[pc]) master.crops[pc] = [];
      }
    }

    // 作型DBの作物・品種も選択肢へ反映
    if (master.croptypesDB && master.croptypesDB.length > 0) {
      master.croptypesDB.forEach(ct => {
        const c = String(ct.crop || '').trim();
        const v = String(ct.variety || '').trim();
        if (!c) return;
        if (!master.crops[c]) master.crops[c] = [];
        if (v && !master.crops[c].includes(v)) master.crops[c].push(v);
      });
    }

    return master;
  } catch(e) {
    return { error: e.message };
  }
}

// 手入力データをマスタへ追記する関数
function appendCultivationMaster(newData) {
  try {
    const ss = TENANT_SS;
    if (!ss) return { success: false, error: 'スプレッドシート未設定' };

    let sheet = ss.getSheetByName('栽培計画マスタ');
    if (!sheet) {
      sheet = ss.insertSheet('栽培計画マスタ');
      sheet.appendRow(['作物', '品種', '穴数', '条数', '株間', '畝間', '収穫係数', '定植面積', '1苗当たり収量', '1P当たり入り数']);
    }

    const crop = String((newData && newData.crop) || '').trim();
    const variety = String((newData && newData.variety) || '').trim();
    if (!crop || !variety) {
      return { success: false, error: '作物と品種は必須です' };
    }

    const holes = newData.holes;
    const rows = newData.rows;
    const pSpace = newData.pSpace;
    const rSpace = newData.rSpace;
    const yieldPerSeedling = newData.yieldPerSeedling;
    const itemsPerPack = newData.itemsPerPack;

    const hasVal = (v) => v !== '' && v !== null && v !== undefined;

    // 現在のデータを取得して重複チェック
    const data = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [['作物', '品種']];
    let isCropVarietyExist = false;
    let isHolesExist = !hasVal(holes);
    let isRowsExist = !hasVal(rows);
    let isPSpaceExist = !hasVal(pSpace);
    let isRSpaceExist = !hasVal(rSpace);
    let isYieldPerSeedlingExist = !hasVal(yieldPerSeedling);
    let isItemsPerPackExist = !hasVal(itemsPerPack);

    for (let i = 1; i < data.length; i++) {
        let r = data[i];
        if (String(r[0] || '').trim() === crop && String(r[1] || '').trim() === variety) {
          isCropVarietyExist = true;
        }
        if (hasVal(holes) && String(r[2]) === String(holes)) isHolesExist = true;
        if (hasVal(rows) && String(r[3]) === String(rows)) isRowsExist = true;
        if (hasVal(pSpace) && String(r[4]) === String(pSpace)) isPSpaceExist = true;
        if (hasVal(rSpace) && String(r[5]) === String(rSpace)) isRSpaceExist = true;
        if (hasVal(yieldPerSeedling) && String(r[8]) === String(yieldPerSeedling)) isYieldPerSeedlingExist = true;
        if (hasVal(itemsPerPack) && String(r[9]) === String(itemsPerPack)) isItemsPerPackExist = true;
    }

    // 全てが存在する場合は何もしない
    if (isCropVarietyExist && isHolesExist && isRowsExist && isPSpaceExist && isRSpaceExist && isYieldPerSeedlingExist && isItemsPerPackExist) {
        return { success: true, message: "既に存在します", added: false };
    }

    // 一つでも新しいものがあれば、新しい行として追加（各列は存在しない場合のみ書き込む）
    // 通常マスタシートは列ごとに独立した選択肢として読み込まれるため、1行にまとめて追加しても問題ありません
    sheet.appendRow([
        !isCropVarietyExist ? crop : '',
        !isCropVarietyExist ? variety : '',
        !isHolesExist && hasVal(holes) ? holes : '',
        !isRowsExist && hasVal(rows) ? rows : '',
        !isPSpaceExist && hasVal(pSpace) ? pSpace : '',
        !isRSpaceExist && hasVal(rSpace) ? rSpace : '',
        '', // 収穫係数
        '', // 定植面積
        !isYieldPerSeedlingExist && hasVal(yieldPerSeedling) ? yieldPerSeedling : '',
        !isItemsPerPackExist && hasVal(itemsPerPack) ? itemsPerPack : ''
    ]);
    SpreadsheetApp.flush();

    return { success: true, added: !isCropVarietyExist, crop: crop, variety: variety };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// 作型DBを一括保存する関数
function saveCroptypeDBBatch(params) {
  try {
    const croptypes = params.croptypes;
    if (!croptypes || croptypes.length === 0) return { success: true };
    
    for (let c of croptypes) {
        saveCroptypeDB(c);
    }
    return { success: true, message: "作型DBを一括更新しました" };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

// 作型DBを保存する関数
function saveCroptypeDB(params) {
  try {
    const ss = TENANT_SS;
    let sheet = ss.getSheetByName('作型DB');
    if (!sheet) {
      sheet = ss.insertSheet('作型DB');
      sheet.appendRow(['作物', '品種', 'まき時期', '産地', '播種', '定植', '収穫', '特性(タグ)', 'メーカー']);
    } else {
      // 既存シートに「特性(タグ)」「メーカー」カラムがない場合は追加
      const rawHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const headers = rawHeaders.map(h => h ? String(h).trim() : "");
      if (headers.indexOf('特性(タグ)') === -1) {
        sheet.getRange(1, headers.length + 1).setValue('特性(タグ)');
        headers.push('特性(タグ)');
      }
      if (headers.indexOf('メーカー') === -1) {
        sheet.getRange(1, headers.length + 1).setValue('メーカー');
        headers.push('メーカー');
      }
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const tagsColIndex = headers.indexOf('特性(タグ)') + 1; // 1-based index
    const makerColIndex = headers.indexOf('メーカー') + 1; // 1-based index
    
    let updated = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(params.crop).trim() && 
          String(data[i][1]).trim() === String(params.variety).trim() && 
          String(data[i][2] || '').trim() === String(params.season || '').trim() && 
          String(data[i][3] || '').trim() === String(params.climate || '').trim()) {
        
        sheet.getRange(i + 1, 5).setValue(JSON.stringify(params.sowing || []));
        sheet.getRange(i + 1, 6).setValue(JSON.stringify(params.planting || []));
        sheet.getRange(i + 1, 7).setValue(JSON.stringify(params.harvesting || []));
        if (tagsColIndex > 0) {
          sheet.getRange(i + 1, tagsColIndex).setValue(params.characteristics || '');
        }
        if (makerColIndex > 0) {
          sheet.getRange(i + 1, makerColIndex).setValue(params.maker || '');
        }
        updated = true;
        break;
      }
    }
    
    if (!updated) {
      let newRow = [
        params.crop,
        params.variety,
        params.season || '',
        params.climate || '',
        JSON.stringify(params.sowing || []),
        JSON.stringify(params.planting || []),
        JSON.stringify(params.harvesting || [])
      ];
      // ヘッダー長に合わせる
      while (newRow.length < headers.length) {
        newRow.push('');
      }
      if (tagsColIndex > 0) {
        newRow[tagsColIndex - 1] = params.characteristics || '';
      }
      if (makerColIndex > 0) {
        newRow[makerColIndex - 1] = params.maker || '';
      }
      sheet.appendRow(newRow);
    }
    SpreadsheetApp.flush();
    try {
      appendCultivationMaster({
        crop: params.crop,
        variety: params.variety,
        holes: '',
        rows: '',
        pSpace: '',
        rSpace: '',
        yieldPerSeedling: '',
        itemsPerPack: ''
      });
    } catch (e) {}
    return { success: true, message: "作型DBを更新しました" };
  } catch(e) {
    return { success: false, message: e.message };
  }
}
function ensurePresetSheetHeaders_(ss) {
  let sheet = ss.getSheetByName('栽培計画プリセット');
  if (!sheet) {
    sheet = ss.insertSheet('栽培計画プリセット');
    sheet.appendRow(['拠点', '作物', 'プリセット名', '穴数', '条数', '株間', '畝間', '1苗当たり収量', '1P当たり入り数', 'ファイルURL']);
    return sheet;
  }
  let data = sheet.getDataRange().getValues();
  if (data.length > 0) {
    let headers = data[0].map(h => String(h || '').trim());
    if (!headers.includes('拠点')) {
      sheet.insertColumnBefore(1);
      sheet.getRange(1, 1).setValue('拠点');
      SpreadsheetApp.flush();
    }
  } else {
    sheet.appendRow(['拠点', '作物', 'プリセット名', '穴数', '条数', '株間', '畝間', '1苗当たり収量', '1P当たり入り数', 'ファイルURL']);
  }
  return sheet;
}

// 栽培計画のプリセットを削除する関数
function deleteCultivationPreset(presetData) {
  try {
    const ss = TENANT_SS;
    const sheet = ensurePresetSheetHeaders_(ss);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h || '').trim());

    const locCol = headers.indexOf('拠点');
    const cropCol = headers.indexOf('作物');
    const nameCol = headers.indexOf('プリセット名');

    const targetLoc = String(presetData.location || '').trim();
    const targetCrop = String(presetData.crop || '').trim();
    const targetName = String(presetData.name || '').trim();

    for (let i = 1; i < data.length; i++) {
      const rLoc = locCol !== -1 ? String(data[i][locCol] || '').trim() : '';
      const rCrop = cropCol !== -1 ? String(data[i][cropCol] || '').trim() : '';
      const rName = nameCol !== -1 ? String(data[i][nameCol] || '').trim() : '';

      if (rLoc === targetLoc && rCrop === targetCrop && rName === targetName) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, message: '対象のプリセットが見つかりませんでした' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

// 栽培計画のプリセット名を変更する関数
function renameCultivationPreset(presetData) {
  try {
    const ss = TENANT_SS;
    const sheet = ensurePresetSheetHeaders_(ss);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h || '').trim());

    const locCol = headers.indexOf('拠点');
    const cropCol = headers.indexOf('作物');
    const nameCol = headers.indexOf('プリセット名');

    const targetLoc = String(presetData.location || '').trim();
    const targetCrop = String(presetData.crop || '').trim();
    const oldName = String(presetData.oldName || '').trim();

    for (let i = 1; i < data.length; i++) {
      const rLoc = locCol !== -1 ? String(data[i][locCol] || '').trim() : '';
      const rCrop = cropCol !== -1 ? String(data[i][cropCol] || '').trim() : '';
      const rName = nameCol !== -1 ? String(data[i][nameCol] || '').trim() : '';

      if (rLoc === targetLoc && rCrop === targetCrop && rName === oldName) {
        sheet.getRange(i + 1, nameCol + 1).setValue(presetData.newName);
        return { success: true };
      }
    }
    return { success: false, message: '対象のプリセットが見つかりませんでした' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 品種名を変更する（栽培計画マスタ・作型DB・プリセット名が品種と同名の場合）
 * params: { crop, oldName, newName }
 */
function renameCultivationVariety(params) {
  try {
    const crop = String((params && params.crop) || '').trim();
    const oldName = String((params && params.oldName) || '').trim();
    const newName = String((params && params.newName) || '').trim();
    if (!crop || !oldName || !newName) {
      return { success: false, message: '作物・旧品種名・新品種名は必須です' };
    }
    if (oldName === newName) return { success: true, message: '変更なし' };

    const ss = TENANT_SS;
    let updatedMaster = 0;
    let updatedCroptype = 0;
    let updatedPreset = 0;

    // 栽培計画マスタ: A作物 B品種
    const masterSheet = ss.getSheetByName('栽培計画マスタ');
    if (masterSheet && masterSheet.getLastRow() > 1) {
      const lastRow = masterSheet.getLastRow();
      const data = masterSheet.getRange(2, 1, lastRow, 2).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === crop && String(data[i][1] || '').trim() === oldName) {
          masterSheet.getRange(i + 2, 2).setValue(newName);
          updatedMaster++;
        }
      }
    }

    // 作型DB: 作物・品種列
    const croptypeSheet = ss.getSheetByName('作型DB');
    if (croptypeSheet && croptypeSheet.getLastRow() > 1) {
      const headers = croptypeSheet.getRange(1, 1, 1, croptypeSheet.getLastColumn()).getValues()[0]
        .map(h => String(h || '').trim());
      const cropCol = headers.indexOf('作物');
      const varietyCol = headers.indexOf('品種');
      if (cropCol !== -1 && varietyCol !== -1) {
        const lastRow = croptypeSheet.getLastRow();
        const data = croptypeSheet.getRange(2, 1, lastRow, croptypeSheet.getLastColumn()).getValues();
        for (let i = 0; i < data.length; i++) {
          if (String(data[i][cropCol] || '').trim() === crop
              && String(data[i][varietyCol] || '').trim() === oldName) {
            croptypeSheet.getRange(i + 2, varietyCol + 1).setValue(newName);
            updatedCroptype++;
          }
        }
      }
    }

    // プリセットシート: 作物が一致し、プリセット名が旧品種名と同名なら改名
    try {
      const presetSheet = ensurePresetSheetHeaders_(ss);
      if (presetSheet && presetSheet.getLastRow() > 1) {
        const data = presetSheet.getDataRange().getValues();
        const headers = data[0].map(h => String(h || '').trim());
        const cropCol = headers.indexOf('作物');
        const nameCol = headers.indexOf('プリセット名');
        if (cropCol !== -1 && nameCol !== -1) {
          for (let i = 1; i < data.length; i++) {
            if (String(data[i][cropCol] || '').trim() === crop
                && String(data[i][nameCol] || '').trim() === oldName) {
              presetSheet.getRange(i + 1, nameCol + 1).setValue(newName);
              updatedPreset++;
            }
          }
        }
      }
    } catch (e) {}

    return {
      success: true,
      message: '品種名を更新しました',
      updatedMaster: updatedMaster,
      updatedCroptype: updatedCroptype,
      updatedPreset: updatedPreset
    };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

// 栽培計画のプリセットを保存する関数
function saveCultivationPreset(presetData) {
  try {
    const ss = TENANT_SS;
    const sheet = ensurePresetSheetHeaders_(ss);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h || '').trim());

    const locCol = headers.indexOf('拠点');
    const cropCol = headers.indexOf('作物');
    const nameCol = headers.indexOf('プリセット名');

    const targetLoc = String(presetData.location || '').trim();
    const targetCrop = String(presetData.crop || '').trim();
    const targetName = String(presetData.name || '').trim();

    let updated = false;
    for (let i = 1; i < data.length; i++) {
      const rLoc = locCol !== -1 ? String(data[i][locCol] || '').trim() : '';
      const rCrop = cropCol !== -1 ? String(data[i][cropCol] || '').trim() : '';
      const rName = nameCol !== -1 ? String(data[i][nameCol] || '').trim() : '';

      if (rLoc === targetLoc && rCrop === targetCrop && rName === targetName) {
        const holesCol = headers.indexOf('穴数');
        const rowsCol = headers.indexOf('条数');
        const pSpaceCol = headers.indexOf('株間');
        const rSpaceCol = headers.indexOf('畝間');
        const yieldCol = headers.indexOf('1苗当たり収量');
        const packCol = headers.indexOf('1P当たり入り数');

        if (holesCol !== -1) sheet.getRange(i + 1, holesCol + 1).setValue(presetData.holes);
        if (rowsCol !== -1) sheet.getRange(i + 1, rowsCol + 1).setValue(presetData.rows);
        if (pSpaceCol !== -1) sheet.getRange(i + 1, pSpaceCol + 1).setValue(presetData.pSpace);
        if (rSpaceCol !== -1) sheet.getRange(i + 1, rSpaceCol + 1).setValue(presetData.rSpace);
        if (yieldCol !== -1) sheet.getRange(i + 1, yieldCol + 1).setValue(presetData.yieldPerSeedling);
        if (packCol !== -1) sheet.getRange(i + 1, packCol + 1).setValue(presetData.itemsPerPack);

        updated = true;
        break;
      }
    }

    if (!updated) {
      const row = new Array(headers.length).fill('');
      if (locCol !== -1) row[locCol] = targetLoc;
      if (cropCol !== -1) row[cropCol] = targetCrop;
      if (nameCol !== -1) row[nameCol] = targetName;
      if (headers.indexOf('穴数') !== -1) row[headers.indexOf('穴数')] = presetData.holes;
      if (headers.indexOf('条数') !== -1) row[headers.indexOf('条数')] = presetData.rows;
      if (headers.indexOf('株間') !== -1) row[headers.indexOf('株間')] = presetData.pSpace;
      if (headers.indexOf('畝間') !== -1) row[headers.indexOf('畝間')] = presetData.rSpace;
      if (headers.indexOf('1苗当たり収量') !== -1) row[headers.indexOf('1苗当たり収量')] = presetData.yieldPerSeedling;
      if (headers.indexOf('1P当たり入り数') !== -1) row[headers.indexOf('1P当たり入り数')] = presetData.itemsPerPack;

      sheet.appendRow(row);
    }

    SpreadsheetApp.flush();
    return { success: true, message: "保存完了" };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// 品種登録（ファイル付き）を保存する関数
function saveVarietyWithFile(params) {
  try {
    const ss = TENANT_SS;
    const sheet = ensurePresetSheetHeaders_(ss);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h || '').trim());

    let fileUrlColIndex = headers.indexOf('ファイルURL') + 1;
    if (fileUrlColIndex === 0) {
      fileUrlColIndex = headers.length + 1;
      sheet.getRange(1, fileUrlColIndex).setValue('ファイルURL');
    }

    let fileUrl = "";
    if (params.fileData && params.fileName) {
      let dataStr = params.fileData;
      if (dataStr.indexOf(',') !== -1) {
        dataStr = dataStr.split(',')[1];
      }
      const blob = Utilities.newBlob(Utilities.base64Decode(dataStr), params.fileType, params.fileName);

      const folderName = "情熱MAP品種情報";
      let folders = DriveApp.getFoldersByName(folderName);
      let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileUrl = file.getUrl();
    }

    const locCol = headers.indexOf('拠点');
    const cropCol = headers.indexOf('作物');
    const nameCol = headers.indexOf('プリセット名');

    const targetLoc = String(params.location || '').trim();
    const targetCrop = String(params.crop || '').trim();
    const targetName = String(params.name || '').trim();

    let updated = false;
    for (let i = 1; i < data.length; i++) {
      const rLoc = locCol !== -1 ? String(data[i][locCol] || '').trim() : '';
      const rCrop = cropCol !== -1 ? String(data[i][cropCol] || '').trim() : '';
      const rName = nameCol !== -1 ? String(data[i][nameCol] || '').trim() : '';

      if ((!targetLoc || !rLoc || rLoc === targetLoc) && rCrop === targetCrop && rName === targetName) {
        const holesCol = headers.indexOf('穴数');
        const rowsCol = headers.indexOf('条数');
        const pSpaceCol = headers.indexOf('株間');
        const rSpaceCol = headers.indexOf('畝間');
        const yieldCol = headers.indexOf('1苗当たり収量');
        const packCol = headers.indexOf('1P当たり入り数');

        if (holesCol !== -1) sheet.getRange(i + 1, holesCol + 1).setValue(params.holes);
        if (rowsCol !== -1) sheet.getRange(i + 1, rowsCol + 1).setValue(params.rows);
        if (pSpaceCol !== -1) sheet.getRange(i + 1, pSpaceCol + 1).setValue(params.pSpace);
        if (rSpaceCol !== -1) sheet.getRange(i + 1, rSpaceCol + 1).setValue(params.rSpace);
        if (yieldCol !== -1) sheet.getRange(i + 1, yieldCol + 1).setValue(params.yieldPerSeedling);
        if (packCol !== -1) sheet.getRange(i + 1, packCol + 1).setValue(params.itemsPerPack);

        if (fileUrl && fileUrlColIndex > 0) {
          sheet.getRange(i + 1, fileUrlColIndex).setValue(fileUrl);
        }
        updated = true;
        break;
      }
    }

    if (!updated) {
      let newRow = new Array(Math.max(headers.length, fileUrlColIndex)).fill('');
      if (locCol !== -1) newRow[locCol] = targetLoc;
      if (cropCol !== -1) newRow[cropCol] = targetCrop;
      if (nameCol !== -1) newRow[nameCol] = targetName;
      if (headers.indexOf('穴数') !== -1) newRow[headers.indexOf('穴数')] = params.holes;
      if (headers.indexOf('条数') !== -1) newRow[headers.indexOf('条数')] = params.rows;
      if (headers.indexOf('株間') !== -1) newRow[headers.indexOf('株間')] = params.pSpace;
      if (headers.indexOf('畝間') !== -1) newRow[headers.indexOf('畝間')] = params.rSpace;
      if (headers.indexOf('1苗当たり収量') !== -1) newRow[headers.indexOf('1苗当たり収量')] = params.yieldPerSeedling;
      if (headers.indexOf('1P当たり入り数') !== -1) newRow[headers.indexOf('1P当たり入り数')] = params.itemsPerPack;
      if (fileUrlColIndex > 0) newRow[fileUrlColIndex - 1] = fileUrl;
      sheet.appendRow(newRow);
    }

    SpreadsheetApp.flush();

    // 穴数・条数などはプリセットシートからマスタ読込時に反映する。
    // プリセット名を品種マスタへ追記しない（品種候補と混ざるため）。
    
    return { success: true, message: "栽培設定とファイルを保存しました", fileUrl: fileUrl };
  } catch (e) {
    return { success: false, message: e.message };
  }
}


function changeId(userId, password, newId) {
  if (!userId || !password || !newId) {
    return { success: false, message: "必須項目が入力されていません" };
  }
  const ss = TENANT_SS;
  if (!ss) return { success: false, message: "データベースに接続できません" };
  const sheet = ss.getSheetByName('名簿');
  if (!sheet) return { success: false, message: "名簿シートが見つかりません" };
  const data = sheet.getDataRange().getValues();
  
  // Check if newId already exists
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(newId)) {
      return { success: false, message: "指定された新しいIDは既に使用されています" };
    }
  }

  // Find user and change ID
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId) && String(data[i][1]) === String(password)) {
      sheet.getRange(i + 1, 1).setValue(newId); // A列(ID)を更新
      writeLog(data[i][2], "ID変更", "システム", "IDを変更しました");
      return { success: true, message: "IDを変更しました" };
    }
  }
  return { success: false, message: "現在のパスワードが正しくありません" };
}

// ==========================================
// 機械管理機能
// ==========================================
function getOrCreateSheet(sheetName, headers) {
  let sheet = TENANT_SS.getSheetByName(sheetName);
  if (!sheet) {
    sheet = TENANT_SS.insertSheet(sheetName);
    if (headers) sheet.appendRow(headers);
  }
  return sheet;
}

// ==========================================
// 農機マスタ（機械管理と統一）ヘルパー
// 列: A–R 既存 / S–Y(19–25) 未使用整備系 / Z–AF(26–32) 統一拡張
// ==========================================
const NOUKI_EXT_HEADERS = [
  'ID', '農機名', '型式', '作業分類', '写真', '写真2', '場所看板名', '場所看板id', '分類', '購入年月日',
  '登録者', '部品名', '現在地', '現在地看板id', '症状名', '対応農機ID', '燃料', '機械番号',
  '整備月', '説明書URL', '定期整備名', '整備時間1', '整備1', '整備時間2', '整備2',
  '機械グループ', '機種', '拠点', '稼働状況', 'lat', 'lng', 'maintenanceSettings'
];

function ensureNoukiMasterSheet() {
  let sheet = TENANT_SS.getSheetByName('農機マスタ');
  if (!sheet) {
    sheet = TENANT_SS.insertSheet('農機マスタ');
    // appendRow はシート列幅と不一致で落ちることがあるため setValues を使う
    sheet.getRange(1, 1, 1, NOUKI_EXT_HEADERS.length).setValues([NOUKI_EXT_HEADERS]);
    try { sheet.getRange(1, 1, 1, NOUKI_EXT_HEADERS.length).setFontWeight('bold').setBackground('#e0e0e0'); } catch (e) {}
    return sheet;
  }
  // 不足ヘッダーは1セルずつ埋める（「data has 7 / range has 32」列数不一致を避ける）
  const needed = NOUKI_EXT_HEADERS.length;
  let lastCol = 1;
  try { lastCol = Math.max(sheet.getLastColumn(), 1); } catch (e) { lastCol = 1; }
  for (let c = 1; c <= needed; c++) {
    let current = '';
    try {
      if (c <= lastCol) current = String(sheet.getRange(1, c).getValue() || '').trim();
    } catch (e) { current = ''; }
    if (!current) {
      try { sheet.getRange(1, c).setValue(NOUKI_EXT_HEADERS[c - 1]); } catch (e) {}
    }
  }
  return sheet;
}

function parseNoukiMachineRow(row) {
  let settings = [];
  try { settings = JSON.parse(row[31] || '[]'); } catch (e) { settings = []; }
  if (!Array.isArray(settings)) settings = [];
  const model = String(row[2] || "").trim();
  const fuel = String(row[16] || "").trim();
  const machineNumber = String(row[17] || "").trim();
  const latRaw = row[29];
  const lngRaw = row[30];
  return {
    id: String(row[0] || "").trim(),
    name: String(row[1] || "").trim(),
    model: model,
    workCategory: String(row[3] || ""),
    photo: String(row[4] || ""),
    photo2: String(row[5] || ""),
    signName: String(row[6] || ""),
    signId: String(row[7] || ""),
    category: String(row[8] || ""),
    purchaseDate: String(row[9] || "").trim(),
    userName: String(row[10] || ""),
    parts: String(row[11] || ""),
    currentLocName: String(row[12] || row[6] || ""),
    currentLocId: String(row[13] || row[7] || ""),
    symptoms: String(row[14] || ""),
    targetMachineIds: String(row[15] || ""),
    fuel: fuel,
    machineNumber: machineNumber,
    group: String(row[25] || ""),
    type: String(row[26] || ""),
    location: String(row[27] || ""),
    status: String(row[28] || "使用可能") || "使用可能",
    lat: (latRaw !== "" && latRaw != null) ? latRaw : null,
    lng: (lngRaw !== "" && lngRaw != null) ? lngRaw : null,
    maintenanceSettings: settings,
    // 互換エイリアス（旧 MachineMaster / machine.js）
    modelType: model,
    fuelType: fuel,
    serialNo: machineNumber
  };
}

function buildNoukiMachineRow(m) {
  const model = m.model != null ? m.model : (m.modelType || "");
  const fuel = m.fuel != null ? m.fuel : (m.fuelType || "");
  const machineNumber = m.machineNumber != null ? m.machineNumber : (m.serialNo || "");
  const signName = m.signName || "";
  const signId = m.signId || "";
  return [
    m.id || "",
    m.name || "",
    model,
    m.workCategory || "",
    m.photo || "",
    m.photo2 || "",
    signName,
    signId,
    m.category || "",
    m.purchaseDate || "",
    m.userName || "",
    m.parts || "",
    m.currentLocName != null ? m.currentLocName : signName,
    m.currentLocId != null ? m.currentLocId : signId,
    m.symptoms || "",
    m.targetMachineIds || "",
    fuel,
    machineNumber,
    "", "", "", "", "", "", "", // S–Y (19–25) 未使用
    m.group || "",
    m.type || "",
    m.location || "",
    m.status || "使用可能",
    (m.lat != null && m.lat !== "") ? m.lat : "",
    (m.lng != null && m.lng !== "") ? m.lng : "",
    typeof m.maintenanceSettings === "string" ? m.maintenanceSettings : JSON.stringify(m.maintenanceSettings || [])
  ];
}

function findNoukiMachineRowIndex(sheet, machineId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(machineId)) return i + 1;
  }
  return -1;
}

function migrateMachineMasterToNouki() {
  const oldSheet = TENANT_SS.getSheetByName('MachineMaster');
  if (!oldSheet) return 0;
  const nouki = ensureNoukiMasterSheet();
  const noukiData = nouki.getDataRange().getValues();
  const existingKeys = {};
  const existingIds = {};
  for (let i = 1; i < noukiData.length; i++) {
    if (!noukiData[i][1]) continue;
    existingIds[String(noukiData[i][0])] = true;
    const key = [String(noukiData[i][1] || "").trim(), String(noukiData[i][2] || "").trim(), String(noukiData[i][17] || "").trim()].join('|');
    existingKeys[key] = true;
  }
  const oldData = oldSheet.getDataRange().getValues();
  let migrated = 0;
  for (let i = 1; i < oldData.length; i++) {
    if (!oldData[i][0] && !oldData[i][1]) continue;
    const oldId = String(oldData[i][0] || "");
    const name = String(oldData[i][1] || "").trim();
    if (!name) continue;
    let settings = [];
    try { settings = JSON.parse(oldData[i][12] || '[]'); } catch (e) {}
    const model = String(oldData[i][6] || "").trim();
    const machineNumber = String(oldData[i][8] || "").trim();
    const key = [name, model, machineNumber].join('|');
    if (existingIds[oldId] || existingKeys[key]) continue;
    const newId = oldId.indexOf('MAC-') === 0 ? oldId : ('MAC-' + Utilities.getUuid().substring(0, 8));
    const row = buildNoukiMachineRow({
      id: newId,
      name: name,
      group: oldData[i][2] || "",
      location: oldData[i][3] || "",
      photo: oldData[i][4] || "",
      purchaseDate: oldData[i][5] || "",
      model: model,
      type: oldData[i][7] || "",
      machineNumber: machineNumber,
      status: oldData[i][9] || "使用可能",
      lat: oldData[i][10] || "",
      lng: oldData[i][11] || "",
      maintenanceSettings: settings,
      fuel: oldData[i][13] || "",
      workCategory: "",
      signName: "",
      signId: "",
      currentLocName: "",
      currentLocId: ""
    });
    const nextRow = nouki.getLastRow() + 1;
    nouki.getRange(nextRow, 1, 1, row.length).setValues([row]);
    existingIds[newId] = true;
    existingKeys[key] = true;
    migrated++;
  }
  return migrated;
}

function machine_loadAll() {
  migrateMachineMasterToNouki();
  const masterSheet = ensureNoukiMasterSheet();
  const maintSheet = getOrCreateSheet('MachineMaintenance', ['id', 'machineId', 'date', 'material', 'replaceParts', 'comment']);
  const fuelSheet = getOrCreateSheet('MachineFuel', ['id', 'machineId', 'date', 'hourMeter', 'fuelAmount', 'fuelCanStatus', 'capCheck']);

  let machines = {};
  let mData = masterSheet.getDataRange().getValues();
  for (let i = 1; i < mData.length; i++) {
    if (!mData[i][0] && !mData[i][1]) continue;
    if (!mData[i][1]) continue;
    const m = parseNoukiMachineRow(mData[i]);
    if (m.id) machines[m.id] = m;
  }

  let maintenanceRecords = [];
  let maintData = maintSheet.getDataRange().getValues();
  for (let i = 1; i < maintData.length; i++) {
    if (!maintData[i][0]) continue;
    maintenanceRecords.push({
      id: maintData[i][0], machineId: maintData[i][1], date: maintData[i][2], material: maintData[i][3], replaceParts: maintData[i][4], comment: maintData[i][5]
    });
  }

  let fuelRecords = [];
  let fData = fuelSheet.getDataRange().getValues();
  for (let i = 1; i < fData.length; i++) {
    if (!fData[i][0]) continue;
    fuelRecords.push({
      id: fData[i][0], machineId: fData[i][1], date: fData[i][2], hourMeter: fData[i][3], fuelAmount: fData[i][4], fuelCanStatus: fData[i][5], capCheck: fData[i][6]
    });
  }

  return { machines: machines, maintenanceRecords: maintenanceRecords, fuelRecords: fuelRecords };
}

function machine_saveMachine(p) {
  const sheet = ensureNoukiMasterSheet();
  let id = p.id || "";
  if (!id || String(id).indexOf('m_') === 0) {
    id = 'MAC-' + Utilities.getUuid().substring(0, 8);
  }
  const rowIdx = findNoukiMachineRowIndex(sheet, id);
  let existing = null;
  if (rowIdx !== -1) {
    existing = parseNoukiMachineRow(sheet.getRange(rowIdx, 1, 1, NOUKI_EXT_HEADERS.length).getValues()[0]);
  }

  const merged = Object.assign({}, existing || {}, p, {
    id: id,
    model: p.model != null ? p.model : (p.modelType != null ? p.modelType : (existing && existing.model) || ""),
    fuel: p.fuel != null ? p.fuel : (p.fuelType != null ? p.fuelType : (existing && existing.fuel) || ""),
    machineNumber: p.machineNumber != null ? p.machineNumber : (p.serialNo != null ? p.serialNo : (existing && existing.machineNumber) || ""),
    status: p.status || (existing && existing.status) || "使用可能",
    currentLocName: (p.currentLocName != null) ? p.currentLocName : (p.signName != null ? p.signName : (existing && existing.currentLocName) || ""),
    currentLocId: (p.currentLocId != null) ? p.currentLocId : (p.signId != null ? p.signId : (existing && existing.currentLocId) || ""),
    photo: p.photo != null ? p.photo : (existing && existing.photo) || "",
    photo2: p.photo2 != null ? p.photo2 : (existing && existing.photo2) || "",
    parts: p.parts != null ? p.parts : (existing && existing.parts) || "",
    symptoms: p.symptoms != null ? p.symptoms : (existing && existing.symptoms) || "",
    category: p.category != null ? p.category : (existing && existing.category) || "",
    targetMachineIds: p.targetMachineIds != null ? p.targetMachineIds : (existing && existing.targetMachineIds) || "",
    maintenanceSettings: p.maintenanceSettings != null ? p.maintenanceSettings : (existing && existing.maintenanceSettings) || []
  });

  // 写真 base64 があれば保存
  if (p.photoBase64) {
    try {
      const splitBase = String(p.photoBase64).split(',');
      const type = splitBase[0].split(';')[0].replace('data:', '');
      const byteString = Utilities.base64Decode(splitBase[1]);
      const blob = Utilities.newBlob(byteString, type, p.photoFilename || "machine.jpg");
      const folders = DriveApp.getFoldersByName("情熱MAP_農機写真");
      const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("情熱MAP_農機写真");
      merged.photo = folder.createFile(blob).getUrl();
    } catch (e) {}
  }

  const rowData = buildNoukiMachineRow(merged);
  if (rowIdx !== -1) {
    sheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
  } else {
    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);
  }
  return { success: true, machine: parseNoukiMachineRow(rowData) };
}

function updateNoukiMachineField(machineId, colIndex, value) {
  const sheet = ensureNoukiMasterSheet();
  const rowIdx = findNoukiMachineRowIndex(sheet, machineId);
  if (rowIdx === -1) return false;
  sheet.getRange(rowIdx, colIndex).setValue(value);
  return true;
}

function machine_saveStatus(p) {
  updateNoukiMachineField(p.id, 29, p.status); // AC列: 稼働状況
  return { success: true };
}

function machine_saveLocation(p) {
  const sheet = ensureNoukiMasterSheet();
  const rowIdx = findNoukiMachineRowIndex(sheet, p.id);
  if (rowIdx === -1) return { success: false };
  sheet.getRange(rowIdx, 30).setValue(p.lat); // AD: lat
  sheet.getRange(rowIdx, 31).setValue(p.lng); // AE: lng
  return { success: true };
}

function machine_saveMaintenanceSetting(p) {
  updateNoukiMachineField(p.id, 32, JSON.stringify(p.maintenanceSettings || [])); // AF
  return { success: true };
}

function machine_saveFuelType(p) {
  updateNoukiMachineField(p.id, 17, p.fuel || p.fuelType || ""); // Q: 燃料
  return { success: true };
}

function machine_saveMaintenance(p) {
  const sheet = getOrCreateSheet('MachineMaintenance');
  sheet.appendRow([p.id, p.machineId, p.date, p.material, p.replaceParts, p.comment]);
  return { success: true };
}

function machine_saveFuel(p) {
  const sheet = getOrCreateSheet('MachineFuel');
  sheet.appendRow([p.id, p.machineId, p.date, p.hourMeter, p.fuelAmount, p.fuelCanStatus, p.capCheck]);
  return { success: true };
}

// ==========================================
// 移動車両（軽トラ）管理
// ==========================================
function ensureVehicleMasterSheet() {
  const headers = ['id', 'plateNumber', 'photo', 'mileage', 'driveType', 'registrationDate', 'status', 'lat', 'lng'];
  const sheet = getOrCreateSheet('VehicleMaster', headers);
  const lastCol = Math.max(sheet.getLastColumn(), headers.length);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (String(existing[0] || '') !== 'id' || String(existing[7] || '') !== 'lat' || String(existing[8] || '') !== 'lng') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function vehicle_loadAll() {
  const sheet = ensureVehicleMasterSheet();
  let vehicles = {};
  let data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    vehicles[data[i][0]] = {
      id: data[i][0],
      plateNumber: data[i][1],
      photo: data[i][2] || '',
      mileage: data[i][3],
      driveType: data[i][4] || '',
      registrationDate: data[i][5] || '',
      status: data[i][6] || '使用可能',
      lat: data[i][7] || null,
      lng: data[i][8] || null
    };
  }
  return { vehicles: vehicles };
}

function vehicle_saveVehicle(p) {
  const sheet = ensureVehicleMasterSheet();
  const data = sheet.getDataRange().getValues();
  let rowIdx = -1;
  let existingPhoto = '';
  let existingLat = '';
  let existingLng = '';
  let existingStatus = '使用可能';
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.id) {
      rowIdx = i + 1;
      existingPhoto = data[i][2] || '';
      existingStatus = data[i][6] || '使用可能';
      existingLat = data[i][7] || '';
      existingLng = data[i][8] || '';
      break;
    }
  }

  let photoUrl = p.photo || existingPhoto || '';
  if (p.photoBase64) {
    const folders = DriveApp.getFoldersByName("情熱MAP_車両写真");
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("情熱MAP_車両写真");
    const parts = p.photoBase64.split(',');
    const type = parts[0].split(';')[0].replace('data:', '');
    const blob = Utilities.newBlob(Utilities.base64Decode(parts[1]), type, p.photoFilename || "vehicle.jpg");
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    photoUrl = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w800";
  }

  const rowData = [
    p.id,
    p.plateNumber || '',
    photoUrl,
    (p.mileage === 0 || p.mileage) ? p.mileage : '',
    p.driveType || '',
    p.registrationDate || '',
    p.status || existingStatus || '使用可能',
    (p.lat === 0 || p.lat) ? p.lat : existingLat,
    (p.lng === 0 || p.lng) ? p.lng : existingLng
  ];

  if (rowIdx !== -1) {
    sheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  return { success: true, photo: photoUrl };
}

function vehicle_saveLocation(p) {
  const sheet = ensureVehicleMasterSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.id) {
      sheet.getRange(i + 1, 8).setValue(p.lat);
      sheet.getRange(i + 1, 9).setValue(p.lng);
      break;
    }
  }
  return { success: true };
}

function vehicle_saveStatus(p) {
  const sheet = ensureVehicleMasterSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.id) {
      sheet.getRange(i + 1, 7).setValue(p.status || '使用可能');
      break;
    }
  }
  return { success: true };
}

function resetAllManureStatus(userName) {
  if (!checkAdminRole(userName)) throw new Error("管理者権限が必要です");
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('圃場');
  if (!sheet) throw new Error("圃場シートが見つかりません");
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    let existing = {};
    try { if (data[i][17]) existing = JSON.parse(data[i][17]); } catch (e) {}
    const resetManure = {
      manure_status: 'none',
      manure_deadline: '',
      manure_scheduled_date: '',
      manure_cancel_reason: '',
      manure_has_pin: false,
      manure_route_selected: false,
      transplant_jun: existing.transplant_jun || ''
    };
    sheet.getRange(i + 1, 18).setValue(JSON.stringify(resetManure));
    count++;
  }
  SpreadsheetApp.flush();
  writeLog(userName, "鶏糞ステータス全リセット", "全圃場", count + "件リセット");
  return { success: true, count: count };
}

function checkAdminRole(userName) {
  const sheet = TENANT_SS.getSheetByName('名簿');
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(userName)) {
      return String(data[i][3]) === '管理者';
    }
  }
  return false;
}

// ==========================================
// 作業記録の一時保存（全端末同期）
// ==========================================
function ensureTempWorkRecordSheet_() {
  const ss = TENANT_SS;
  if (!ss) throw new Error('データベースに接続できません');
  let sheet = ss.getSheetByName('作業一時保存');
  if (!sheet) {
    sheet = ss.insertSheet('作業一時保存');
    sheet.appendRow(['スタッフID', 'ユーザー名', '記録種別', '圃場ID', '圃場名', 'フォームJSON', '作業チップ', '選択圃場IDs', '保存日時']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#e0e0e0');
  }
  return sheet;
}

function saveTempWorkRecord(params) {
  const sheet = ensureTempWorkRecordSheet_();
  const userId = String(params.userId || '').trim();
  const recordType = String(params.type || 'work');
  if (!userId) throw new Error('ユーザーIDが必要です');

  const savedAt = params.savedAt || Utilities.formatDate(new Date(), 'JST', 'M/d HH:mm');
  const formJson = (typeof params.data === 'string') ? params.data : JSON.stringify(params.data || []);
  const polyIdsJson = (typeof params.selectedPolyIds === 'string')
    ? params.selectedPolyIds
    : JSON.stringify(params.selectedPolyIds || []);

  const rowVals = [
    userId,
    params.userName || '',
    recordType,
    params.polyId || '',
    params.polyName || '',
    formJson,
    params.selectedChipName || '',
    polyIdsJson,
    savedAt
  ];

  const data = sheet.getDataRange().getValues();
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId && String(data[i][2]) === recordType) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowVals.length).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }
  return { success: true, savedAt: savedAt };
}

function getTempWorkRecord(params) {
  const sheet = ensureTempWorkRecordSheet_();
  const userId = String(params.userId || '').trim();
  const recordType = String(params.type || 'work');
  if (!userId) return { success: true, draft: null };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId && String(data[i][2]) === recordType) {
      let formData = [];
      let selectedPolyIds = [];
      try { formData = JSON.parse(data[i][5] || '[]'); } catch (e) { formData = []; }
      try { selectedPolyIds = JSON.parse(data[i][7] || '[]'); } catch (e) { selectedPolyIds = []; }
      return {
        success: true,
        draft: {
          type: String(data[i][2] || recordType),
          polyId: data[i][3] || '',
          polyName: data[i][4] || '',
          data: formData,
          selectedChipName: data[i][6] || '',
          selectedPolyIds: selectedPolyIds,
          savedAt: data[i][8] || '',
          userName: data[i][1] || ''
        }
      };
    }
  }
  return { success: true, draft: null };
}

function clearTempWorkRecord(params) {
  const sheet = ensureTempWorkRecordSheet_();
  const userId = String(params.userId || '').trim();
  const recordType = String(params.type || '');
  if (!userId) return { success: true };

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === userId && (!recordType || String(data[i][2]) === recordType)) {
      sheet.deleteRow(i + 1);
    }
  }
  return { success: true };
}

// ========== 個人スケジュール / Gmail / 今日のGoogleカレンダー ==========
function ensurePersonalScheduleSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('個人スケジュール');
  if (!sheet) {
    sheet = ss.insertSheet('個人スケジュール');
    sheet.appendRow(['ID', 'ユーザーID', 'カテゴリ', '内容', '完了', '作成日時', '更新日時']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  return sheet;
}

function ensureMeiboGmailColumn_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('名簿');
  if (!sheet) throw new Error('名簿シートが見つかりません');
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 5)).getValues()[0];
  let gmailCol = -1;
  for (let c = 0; c < headers.length; c++) {
    if (String(headers[c]).indexOf('Gmail') >= 0 || String(headers[c]).indexOf('gmail') >= 0 || String(headers[c]) === 'メール') {
      gmailCol = c;
      break;
    }
  }
  if (gmailCol < 0) {
    gmailCol = 4;
    sheet.getRange(1, gmailCol + 1).setValue('Gmail');
  }
  return { sheet: sheet, gmailCol: gmailCol };
}

function getPersonalSchedule(params) {
  const userId = String((params && params.userId) || '').trim();
  if (!userId) return { priority: [], notes: [] };
  const sheet = ensurePersonalScheduleSheet_();
  const data = sheet.getDataRange().getValues();
  const priority = [];
  const notes = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) !== userId) continue;
    const item = {
      id: String(data[i][0]),
      category: String(data[i][2] || ''),
      text: String(data[i][3] || ''),
      done: String(data[i][4]) === 'TRUE' || data[i][4] === true,
      createdAt: data[i][5] ? Utilities.formatDate(new Date(data[i][5]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : ''
    };
    if (item.category === '留意事項') notes.push(item);
    else priority.push(item);
  }
  return { priority: priority, notes: notes };
}

function addPersonalScheduleItem(params) {
  const userId = String((params && params.userId) || '').trim();
  const category = String((params && params.category) || '最優先');
  const text = String((params && params.text) || '').trim();
  if (!userId) throw new Error('ユーザーIDがありません');
  if (!text) throw new Error('内容を入力してください');
  const cat = (category === '留意事項') ? '留意事項' : '最優先';
  const sheet = ensurePersonalScheduleSheet_();
  const id = Utilities.getUuid();
  const now = new Date();
  sheet.appendRow([id, userId, cat, text, false, now, now]);
  return { success: true, id: id };
}

function updatePersonalScheduleItem(params) {
  const id = String((params && params.id) || '').trim();
  if (!id) throw new Error('IDがありません');
  const sheet = ensurePersonalScheduleSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== id) continue;
    if (params.text !== undefined) sheet.getRange(i + 1, 4).setValue(String(params.text));
    if (params.done !== undefined) sheet.getRange(i + 1, 5).setValue(!!params.done);
    if (params.category !== undefined) {
      const cat = String(params.category) === '留意事項' ? '留意事項' : '最優先';
      sheet.getRange(i + 1, 3).setValue(cat);
    }
    sheet.getRange(i + 1, 7).setValue(new Date());
    return { success: true };
  }
  throw new Error('対象の予定が見つかりません');
}

function deletePersonalScheduleItem(params) {
  const id = String((params && params.id) || '').trim();
  if (!id) throw new Error('IDがありません');
  const sheet = ensurePersonalScheduleSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: true };
}

function getUserGmail(params) {
  const userId = String((params && params.userId) || '').trim();
  if (!userId) return { gmail: '' };
  const info = ensureMeiboGmailColumn_();
  const data = info.sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      return { gmail: String(data[i][info.gmailCol] || '').trim() };
    }
  }
  return { gmail: '' };
}

/**
 * HTML側から権限許可リンクを出すための認可情報。
 * ※Webアプリが「自分として実行」(USER_DEPLOYING) の場合、
 *   許可が必要なのはデプロイしたGoogleアカウント側です。
 */
function getScriptAuthorizationInfo(params) {
  const calendarScopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.readonly'
  ];
  try {
    let authInfo;
    try {
      authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, calendarScopes);
    } catch (eScopes) {
      authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    }
    const status = authInfo.getAuthorizationStatus();
    const statusStr = String(status);
    const url = authInfo.getAuthorizationUrl() || '';
    // 注意: 「NOT_REQUIRED」にも「REQUIRED」が含まれるため、単純な indexOf は使わない
    const needsAuth = (status === ScriptApp.AuthorizationStatus.REQUIRED)
      || (statusStr.indexOf('NOT_REQUIRED') < 0 && !!url);
    let effectiveUser = '';
    try { effectiveUser = Session.getEffectiveUser().getEmail() || ''; } catch (e1) {}
    return {
      success: true,
      status: statusStr,
      authorized: !needsAuth,
      needsAuth: needsAuth,
      url: needsAuth ? url : '',
      effectiveUser: effectiveUser,
      message: needsAuth
        ? 'Googleの権限許可が必要です。下のボタンから許可してください。'
        : '必要な権限は許可済みです。'
    };
  } catch (e) {
    return {
      success: false,
      authorized: false,
      needsAuth: false,
      url: '',
      effectiveUser: '',
      status: 'ERROR',
      message: String(e.message || e)
    };
  }
}

function saveUserGmail(params) {
  const userId = String((params && params.userId) || '').trim();
  const gmail = String((params && params.gmail) || '').trim();
  if (!userId) throw new Error('ユーザーIDがありません');
  if (gmail && gmail.indexOf('@') < 0) throw new Error('Gmailアドレスの形式が正しくありません');
  const info = ensureMeiboGmailColumn_();
  const data = info.sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      info.sheet.getRange(i + 1, info.gmailCol + 1).setValue(gmail);
      return { success: true, gmail: gmail };
    }
  }
  throw new Error('名簿にユーザーが見つかりません');
}

function getTodayGoogleCalendarEvents(params) {
  const userId = String((params && params.userId) || '').trim();
  const days = Math.max(1, Math.min(7, parseInt((params && params.days) || 2, 10) || 2));
  const gmailInfo = getUserGmail({ userId: userId });
  const gmail = String(gmailInfo.gmail || '').trim();
  if (!gmail) {
    return {
      success: false,
      gmail: '',
      events: [],
      message: 'マイページでGmailアカウントを登録してください。',
      calendarUrl: 'https://calendar.google.com/calendar/u/0/r/day'
    };
  }

  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  // days日分（今日〜）：終端は最終日の翌日 0:00（排他）
  const endExclusive = new Date(start.getTime());
  endExclusive.setDate(endExclusive.getDate() + days);
  const calendarUrl = 'https://calendar.google.com/calendar/u/0/r/day';
  const week = ['日', '月', '火', '水', '木', '金', '土'];

  try {
    let calendars = [];
    try {
      calendars = CalendarApp.getAllCalendars();
    } catch (e1) {
      calendars = [];
    }
    if (!calendars || !calendars.length) {
      try {
        const primary = CalendarApp.getCalendarById(gmail);
        if (primary) calendars = [primary];
      } catch (e2) {}
    }

    if (!calendars || !calendars.length) {
      return {
        success: false,
        gmail: gmail,
        events: [],
        message: 'カレンダーにアクセスできません。Googleカレンダー（' + gmail + '）を、このApps Scriptの実行アカウントに「予定の表示」権限で共有してください。',
        calendarUrl: calendarUrl
      };
    }

    const allEvents = [];
    const seenMap = {};
    calendars.forEach(function(cal) {
      try {
        if (cal.isHidden && cal.isHidden()) return;
        const calName = cal.getName() || 'カレンダー';
        const evs = cal.getEvents(start, endExclusive);
        evs.forEach(function(ev) {
          const idKey = (ev.getId ? ev.getId() : '') || (ev.getTitle() + '_' + ev.getStartTime().getTime());
          if (seenMap[idKey]) return;
          seenMap[idKey] = true;

          const st = ev.getStartTime();
          const allDay = ev.isAllDayEvent();
          let timeLabel = '終日';
          if (!allDay) {
            timeLabel = Utilities.formatDate(st, tz, 'HH:mm') + '〜' + Utilities.formatDate(ev.getEndTime(), tz, 'HH:mm');
          }
          const dateYmd = Utilities.formatDate(st, tz, 'yyyy-MM-dd');
          const dateLabel = Utilities.formatDate(st, tz, 'M/d') + '(' + week[st.getDay()] + ')';
          allEvents.push({
            title: ev.getTitle() || '(タイトルなし)',
            calendarName: calName,
            time: timeLabel,
            dateYmd: dateYmd,
            dateLabel: dateLabel,
            startMs: st.getTime(),
            location: ev.getLocation() || '',
            description: String(ev.getDescription() || '').substring(0, 200)
          });
        });
      } catch (eEv) {}
    });

    allEvents.sort(function(a, b) {
      return (a.startMs || 0) - (b.startMs || 0);
    });

    return {
      success: true,
      gmail: gmail,
      days: days,
      events: allEvents,
      message: allEvents.length ? '' : '今日・明日の予定はありません。',
      calendarUrl: calendarUrl
    };
  } catch (err) {
    return {
      success: false,
      gmail: gmail,
      events: [],
      message: 'カレンダー取得エラー: ' + String(err) + ' / カレンダーを実行アカウントへ共有するか、下のリンクからGoogleカレンダーを開いてください。',
      calendarUrl: calendarUrl
    };
  }
}

