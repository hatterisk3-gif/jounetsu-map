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
    else if (action === "signup") result = signupUser(params);
    else if (action === "adminAddUser") result = adminAddUser(params);
    else if (action === "listUsersForAdmin") result = listUsersForAdmin(params);
    else if (action === "updateUserRole") result = updateUserRole(params);
    else if (action === "getInitData") result = getInitData(); 
    else if (action === "getDeliveryDestinations") result = getDeliveryDestinations();
    else if (action === "saveDeliveryDestination") result = saveDeliveryDestination(params);
    else if (action === "deleteDeliveryDestination") result = deleteDeliveryDestination(params);
    else if (action === "savePolygon") result = savePolygon(params); 
    else if (action === "savePolygonBatch") result = savePolygonBatch(params); // ★一括保存用
    else if (action === "updatePolygon") result = updatePolygon(params); 
    else if (action === "deletePolygon") result = deletePolygonData(params.id, params.userName);
    else if (action === "deletePolygonBatch") result = deletePolygonBatchData(params.ids, params.userName);
    else if (action === "saveRecord") result = saveRecord(params.id, params.name, params.author, params.recordType, params.data, params.photos);
    else if (action === "updateRecordItem") result = updateRecordItem(params.id, params.recordId, params.recordType, params.data, params.photos, params.keptUrls, params.userName);
    else if (action === "deleteRecordItem") result = deleteRecordItem(params.id, params.recordId, params.userName);
    else if (action === "cancelClockInAndDeleteTodayWorkRecords") result = cancelClockInAndDeleteTodayWorkRecords(params);
    else if (action === "addFieldStatus") result = addFieldStatusToMaster(params.statusName);
    else if (action === "editFieldStatus") result = editFieldStatusInMaster(params.oldStatusName, params.newStatusName);
    else if (action === "deleteFieldStatus") result = deleteFieldStatusFromMaster(params.statusName);
    else if (action === "addFieldCondition") result = addFieldConditionToMaster(params.conditionName);
    else if (action === "editFieldCondition") result = editFieldConditionInMaster(params.oldConditionName, params.newConditionName);
    else if (action === "deleteFieldCondition") result = deleteFieldConditionFromMaster(params.conditionName);
    else if (action === "addClimateMaster") result = addClimateToMaster(params.climateName);
    else if (action === "editClimateMaster") result = editClimateInMaster(params.oldClimateName, params.newClimateName);
    else if (action === "deleteClimateMaster") result = deleteClimateFromMaster(params.climateName);
    else if (action === "addCrop") result = addCropToMaster(params.cropData);
    else if (action === "deleteCrop") result = deleteCropFromMaster(params.cropName);
    else if (action === "mergeFields") result = mergeFields(params.baseId, params.targetId, params.userName);
    else if (action === "splitField") result = splitField(params);
    else if (action === "saveTouki") result = saveToukiData(params.toukiData, params.targetHojoId);
    else if (action === "getToukiDetails") result = getToukiDetails(params.toukiIds);
    else if (action === "manageMaster") result = manageMasterData(params.masterType, params.manageAction, params.value, params.userName);
    else if (action === "importPesticideMasterRows") result = importPesticideMasterRows(params);
    else if (action === "importFertilizerMasterRows") result = importFertilizerMasterRows(params);
    else if (action === "importFertilizerCatalogChunk") result = importFertilizerCatalogChunk(params);
    else if (action === "searchFertilizerCatalog") result = searchFertilizerCatalog(params);
    else if (action === "getFertilizerCatalogStats") result = getFertilizerCatalogStats(params);
    else if (action === "importPesticideCatalogChunk") result = importPesticideCatalogChunk(params);
    else if (action === "searchPesticideCatalog") result = searchPesticideCatalog(params);
    else if (action === "getPesticideCatalogStats") result = getPesticideCatalogStats(params);
    else if (action === "getCropChemPlan") result = getCropChemPlan(params);
    else if (action === "saveCropChemPlan") result = saveCropChemPlan(params);
    else if (action === "listCropChemPlans") result = listCropChemPlans(params);
    else if (action === "deleteCropChemPlan") result = deleteCropChemPlan(params);
    else if (action === "getCropCostPlan") result = getCropCostPlan(params);
    else if (action === "saveCropCostPlan") result = saveCropCostPlan(params);
    else if (action === "listCropCostPlans") result = listCropCostPlans(params);
    else if (action === "deleteCropCostPlan") result = deleteCropCostPlan(params);
    else if (action === "calcCropCost") result = calcCropCost(params);
    else if (action === "getCropWorkPlan") result = getCropWorkPlan(params);
    else if (action === "saveCropWorkPlan") result = saveCropWorkPlan(params);
    else if (action === "listCropWorkPlans") result = listCropWorkPlans(params);
    else if (action === "deleteCropWorkPlan") result = deleteCropWorkPlan(params);
    else if (action === "previewCropWorkSchedule") result = previewCropWorkSchedule(params);
    else if (action === "getSowingProgress") result = getSowingProgress(params);
    else if (action === "getSowingNurseryBundle") result = getSowingNurseryBundle(params);
    else if (action === "getCurrentSowingPlanOptions") result = getCurrentSowingPlanOptions(params);
    else if (action === "getSowingNurseryFormOptions") result = getSowingNurseryFormOptions(params);
    else if (action === "manageCultivationListOption") result = manageCultivationListOption(params);
    else if (action === "saveSowingRecord") result = saveSowingRecord(params);
    else if (action === "getCropWorkProgressSummary") result = getCropWorkProgressSummary(params);
    else if (action === "getHarvestingFieldsSummary") result = getHarvestingFieldsSummary(params);
    else if (action === "getWeatherPlantingPriorities") result = getWeatherPlantingPriorities(params);
    else if (action === "getWorkDeptSettings") result = getWorkDeptSettings(params);
    else if (action === "updateWorkDeptSettings") result = updateWorkDeptSettings(params);
    else if (action === "updateScheduleRowDept") result = updateScheduleRowDept(params);
    else if (action === "saveDepartmentMaster") result = saveDepartmentMaster(params);
    else if (action === "updateUserDepts") result = updateUserDepts(params);
    else if (action === "getWorkRecordAnalysis") result = getWorkRecordAnalysis(params);
    else if (action === "saveManualData") result = saveManualData(params.manual);
    else if (action === "getManualList") result = getManualList();
    else if (action === "deleteManualData") result = deleteManualData(params.manualId);
    else if (action === "quotation_getInit") result = quotationGetInit_();
    else if (action === "quotation_list") result = quotationList_(params);
    else if (action === "quotation_save") result = quotationSave_(params);
    else if (action === "quotation_archive") result = quotationArchive_(params);
    else if (action === "lookupCultivationByTag") result = lookupCultivationByTag(params);
    else if (action === "saveGlobalHarvest") result = saveGlobalHarvest(params);
    else if (action === "markHarvestQtyLotResolved") result = markHarvestQtyLotResolved(params);
    else if (action === "saveGlobalShipping") result = saveGlobalShipping(params);
    else if (action === "updateInventory") result = updateInventory(params); // ★これを追加
    else if (action === "addMaterialToSign") result = addMaterialToSign(params); // ★これを追加
    else if (action === "getInventoryHistory") result = getInventoryHistory(params); // ★これを追加
    else if (action === "getScheduleData") result = getScheduleData();
    else if (action === "addWorkSchedule") result = addWorkSchedule(params);
    else if (action === "getOutsourceWorkData") result = getOutsourceWorkData();
    else if (action === "addOutsourceWorkRequest") result = addOutsourceWorkRequest(params);
    else if (action === "completeOutsourceWork") result = completeOutsourceWork(params);
    else if (action === "deleteOutsourceWork") result = deleteOutsourceWork(params);
    else if (action === "deleteWorkSchedule") result = deleteWorkSchedule(params);
    else if (action === "completeWorkSchedule") result = completeWorkSchedule(params);
    else if (action === "bulkCompleteWorkSchedule") result = bulkCompleteWorkSchedule(params);
    else if (action === "undoCompleteWorkSchedule") result = undoCompleteWorkSchedule(params);
    else if (action === "bulkUndoCompleteWorkSchedule") result = bulkUndoCompleteWorkSchedule(params);
    else if (action === "delegateCompleteWork") result = delegateCompleteWork(params);
    else if (action === "saveReport") result = saveReportData(params.id, params.name, params.author, params.text, params.photos);
    else if (action === "deleteInventoryHistory") result = deleteInventoryHistory(params);
    else if (action === "editInventoryHistory") result = editInventoryHistory(params);
    else if (action === "updateMachineLocations") result = updateMachineLocations(params);
    else if (action === "editMaterial") result = editMaterial(params);
    else if (action === "addMachineToSign") result = addMachineToSign(params);
    else if (action === "addMachinePart") result = addMachinePart(params);
    else if (action === "addMachineSymptom") result = addMachineSymptom(params);
    else if (action === "addMaintenanceContent") result = addMaintenanceContent(params);
    else if (action === "getRefuelHistory") result = getRefuelHistory();
    else if (action === "saveRefuelRecord") result = saveRefuelRecord(params);
    else if (action === "getMachineLastHourMeters") result = getMachineLastHourMeters();
    else if (action === "updateSignLink") result = updateSignLink(params);
    else if (action === 'addToolToMaster') result = addToolToMaster(params);
    else if (action === "updateToolStatus") result = updateToolStatus(params);
    else if (action === "getToolUsageHistory") result = getToolUsageHistory(params);
    else if (action === "saveCultivationPlans") result = saveCultivationPlans(params.year, params.crop, params.planDataArray, params.planType, params.planName, params);
    else if (action === "getCultivationPlans") result = getCultivationPlans(params.year, params.crop, params.planType, params.planName);
    else if (action === "previewCultivationPlanTags") result = previewCultivationPlanTags(params);
    else if (action === "executeCultivationPlans") result = executeCultivationPlans(params);
    else if (action === "getSavedCultivationPlanList") result = getSavedCultivationPlanList();
    else if (action === "getFarmBoardData") result = getFarmBoardData();
    else if (action === "completeFarmBoardTasks") result = completeFarmBoardTasks(params);
    else if (action === "deleteSavedCultivationPlans") result = deleteSavedCultivationPlans(params.year, params.crop, params.planType, params.planName);
    else if (action === "getCultivationHarvestSummary") result = getCultivationHarvestSummary(params.year);
    else if (action === "getCultivationPlanChartSummary") result = getCultivationPlanChartSummary(params);
    else if (action === "getCultivationRidgeParamsForField") result = getCultivationRidgeParamsForField(params.fieldId || params.id);
    else if (action === "getCultivationMaster") result = getCultivationMaster();
    else if (action === "appendCultivationMaster") result = appendCultivationMaster(params);
    else if (action === "saveCultivationPreset") result = saveCultivationPreset(params);
    else if (action === "deleteCultivationPreset") result = deleteCultivationPreset(params);
    else if (action === "renameCultivationPreset") result = renameCultivationPreset(params);
    else if (action === "renameCultivationVariety") result = renameCultivationVariety(params);
    else if (action === "deleteCultivationVariety") result = deleteCultivationVariety(params);
    else if (action === "updateVarietyMeta") result = updateVarietyMeta(params);
    else if (action === "saveCroptypeDB") result = saveCroptypeDB(params);
    else if (action === "saveCroptypeDBBatch") result = saveCroptypeDBBatch(params);
    else if (action === "saveVarietyWithFile") result = saveVarietyWithFile(params);
    else if (action === "saveCroptypeWithFile") result = saveCroptypeWithFile(params);
    else if (action === "deleteCroptypeDB") result = deleteCroptypeDB(params);
    else if (action === "editToolInMaster") result = editToolInMaster(params);
    else if (action === "deleteToolFromMaster") result = deleteToolFromMaster(params);
    else if (action === "editMachineInMaster") result = editMachineInMaster(params);
    else if (action === "deleteMachineFromMaster") result = deleteMachineFromMaster(params);
    else if (action === 'getMapCoordinates') result = getMapCoordinates(params);
    else if (action === 'parseWithGemini') result = parseWithGemini(params);
    else if (action === 'parseCropImageWithGemini') result = parseCropImageWithGemini(params);
    else if (action === "getPolygonDrawingHistory") result = getPolygonDrawingHistory(params);
    else if (action === "saveUserQualifications") result = saveUserQualifications(params.userName, params.qualifications);
    else if (action === "getUserQualifications") result = getUserQualifications(params.userName);
    else if (action === "saveClothingRules") result = saveClothingRules(params.rules);
    else if (action === "getClothingRules") result = getClothingRules();
    else if (action === "assignScheduleMember") result = assignScheduleMember(params.rowIndex, params.assignedUsers, params.scheduleKey);
    else if (action === "getUserTodayAssignedSchedules") result = getUserTodayAssignedSchedules(params.userName);
    else if (action === "saveFieldMemo") result = saveFieldMemo(params);
    else if (action === "getFieldMemoHistory") result = getFieldMemoHistory(params);
    else if (action === "saveTrackingData") result = saveTrackingData(params);
    else if (action === "getTrackingData") result = getTrackingData(params);
    else if (action === "getOpenClockInStatus") result = getOpenClockInStatus(params);
    else if (action === "updateOpenClockInTime") result = updateOpenClockInTime(params);
    else if (action === "getWorkRecordTimeHints") result = getWorkRecordTimeHints(params);
    else if (action === "resetAllManureStatus") result = resetAllManureStatus(params.userName);
    else if (action === "getProdMgmtCategories") result = getProdMgmtCategories();
    else if (action === "saveProdMgmtCategories") result = saveProdMgmtCategories(params.categories, params.userName);
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
    else if (action === "vehicle_deleteVehicle") result = vehicle_deleteVehicle(params);
    else if (action === "vehicle_saveLocation") result = vehicle_saveLocation(params);
    else if (action === "vehicle_saveStatus") result = vehicle_saveStatus(params);
    else if (action === "saveTempWorkRecord") result = saveTempWorkRecord(params);
    else if (action === "getTempWorkRecord") result = getTempWorkRecord(params);
    else if (action === "clearTempWorkRecord") result = clearTempWorkRecord(params);
    else if (action === "getPersonalSchedule") result = getPersonalSchedule(params);
    else if (action === "addPersonalScheduleItem") result = addPersonalScheduleItem(params);
    else if (action === "updatePersonalScheduleItem") result = updatePersonalScheduleItem(params);
    else if (action === "deletePersonalScheduleItem") result = deletePersonalScheduleItem(params);
    else if (action === "reorderPersonalScheduleItems") result = reorderPersonalScheduleItems(params);
    else if (action === "saveUserGmail") result = saveUserGmail(params);
    else if (action === "getUserGmail") result = getUserGmail(params);
    else if (action === "getTodayGoogleCalendarEvents") result = getTodayGoogleCalendarEvents(params);
    else if (action === "listGoogleCalendars") result = listGoogleCalendars(params);
    else if (action === "getUserCalendarIds") result = getUserCalendarIds(params);
    else if (action === "saveUserCalendarIds") result = saveUserCalendarIds(params);
    else if (action === "getScriptAuthorizationInfo") result = getScriptAuthorizationInfo(params);
    else if (action === "getLotList") result = getLotList(params);
    else if (action === "updateLotRecord") result = updateLotRecord(params);
    else if (action === "droneLobby_list") result = droneLobby_list(params);
    else if (action === "droneLobby_create") result = droneLobby_create(params);
    else if (action === "droneLobby_heartbeat") result = droneLobby_heartbeat(params);
    else if (action === "droneLobby_close") result = droneLobby_close(params);
    else if (action === "getAttendanceCalendar") result = getAttendanceCalendar(params);
    else if (action === "setLeaveDay") result = setLeaveDay(params);
    else if (action === "clearLeaveDay") result = clearLeaveDay(params);
    else if (action === "saveWeeklyOffDays") result = saveWeeklyOffDays(params);
    else if (action === "setWorkDayException") result = setWorkDayException(params);
    else if (action === "getAttendanceSettings") result = getAttendanceSettings(params);
    else if (action === "saveAttendanceSettings") result = saveAttendanceSettings(params);
    else if (action === "updateStaffHireDate") result = updateStaffHireDate(params);
    else if (action === "getAttendanceStaffList") result = getAttendanceStaffList(params);
    else if (action === "getStaffClockBoard") result = getStaffClockBoard(params);
    else if (action === "confirmStaffClockOut") result = confirmStaffClockOut(params);
    else if (action === "getFrequentClockInTimes") result = getFrequentClockInTimes(params);
    else if (action === "ideaBoard_list") result = ideaBoard_list(params);
    else if (action === "ideaBoard_save") result = ideaBoard_save(params);
    else if (action === "ideaBoard_setStatus") result = ideaBoard_setStatus(params);
    else if (action === "ideaBoard_addMemo") result = ideaBoard_addMemo(params);
    else if (action === "ideaBoard_addCategory") result = ideaBoard_addCategory(params);
    else if (action === "estimateWorkDuration") result = estimateWorkDuration(params);
    else if (action === "dayPlan_list") result = dayPlan_list(params);
    else if (action === "dayPlan_save") result = dayPlan_save(params);
    else if (action === "dayPlan_update") result = dayPlan_update(params);
    else if (action === "dayPlan_delete") result = dayPlan_delete(params);
    else if (action === "dayPlan_options") result = dayPlan_options(params);
    else if (action === "getOpsIndex") result = getOpsIndex(params);
    else if (action === "saveOpsRoute") result = saveOpsRoute(params);
    else if (action === "deleteOpsRoute") result = deleteOpsRoute(params);

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
- maker/crop/climate/variety があれば文字列、grainCountは「コート」または「生種」、characteristics は短い配列。無い項目は null。
JSONのみ:
{"maker":null,"crop":null,"climate":null,"variety":null,"grainCount":null,"characteristics":[],"types":[{"sowing":[{"start_month":1,"start_period":"中","end_month":2,"end_period":"上"}],"planting":[{"start_month":3,"start_period":"上","end_month":3,"end_period":"中"}],"harvesting":[{"start_month":5,"start_period":"上","end_month":6,"end_period":"下"}]}]}`;

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

/** 組織IDからテナントSpreadsheet IDを解決する（ログイン／サインアップ共用） */
function resolveTenantSpreadsheetId_(orgId) {
  let masterSS;
  try {
    masterSS = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
  } catch (e) {
    throw new Error("マスターデータベースにアクセスできません");
  }

  const masterSheet = masterSS.getSheetByName('組織一覧');
  if (!masterSheet) throw new Error("マスターDBに「組織一覧」シートがありません");

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
  targetSpreadsheetId = String(targetSpreadsheetId || '');
  if (targetSpreadsheetId.indexOf('spreadsheets/d/') >= 0) {
    const match = targetSpreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      targetSpreadsheetId = match[1];
    }
  }
  if (!targetSpreadsheetId) {
    throw new Error("組織のデータベースIDを解決できません");
  }
  return targetSpreadsheetId;
}

function openTenantByOrgId_(orgId) {
  const targetSpreadsheetId = resolveTenantSpreadsheetId_(orgId || 'default');
  try {
    TENANT_SS = SpreadsheetApp.openById(targetSpreadsheetId);
  } catch (e) {
    throw new Error("組織のデータベースにアクセスできません");
  }
  return targetSpreadsheetId;
}

function checkLogin(orgId, userId, password) {
  let targetSpreadsheetId;
  try {
    targetSpreadsheetId = openTenantByOrgId_(orgId);
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }

  const sheet = TENANT_SS.getSheetByName('名簿');
  if (!sheet) throw new Error("組織DBに「名簿」シートが見つかりません");
  let deptCol = -1;
  try {
    deptCol = ensureMeiboDeptColumn_().col;
  } catch (e) {}
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId) && String(data[i][1]) === String(password)) {
      writeLog(data[i][2], "ログイン", "システム", "ログイン成功");
      const dept = deptCol >= 0 ? (String(data[i][deptCol] || '').trim() || '') : '';
      return {
        success: true,
        name: data[i][2],
        role: data[i][3] || "作業員",
        dept: dept,
        spreadsheetId: targetSpreadsheetId
      };
    }
  }
  return { success: false, message: "IDまたはパスワードが正しくありません" };
}

/** 名簿へユーザーを1件追加（共通） */
function createMeiboUser_(ss, opts) {
  const userId = String((opts && opts.userId) || '').trim();
  const password = String((opts && opts.password) || '');
  const userName = String((opts && opts.userName) || '').trim();
  let role = String((opts && opts.role) || '作業員').trim() || '作業員';
  if (role !== '管理者' && role !== '作業員') role = '作業員';

  if (!userId || !password || !userName) {
    return { success: false, message: "スタッフID・表示名・パスワードは必須です" };
  }
  if (password.length < 4) {
    return { success: false, message: "パスワードは4文字以上で入力してください" };
  }
  if (!ss) return { success: false, message: "データベースに接続できません" };

  const sheet = ss.getSheetByName('名簿');
  if (!sheet) return { success: false, message: "名簿シートが見つかりません" };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === userId) {
      return { success: false, message: "このスタッフIDは既に登録されています" };
    }
  }

  // A:ID / B:PW / C:名前 / D:役割（以降の列は空のまま）
  const lastCol = Math.max(sheet.getLastColumn(), 4);
  const row = new Array(lastCol);
  for (let c = 0; c < lastCol; c++) row[c] = '';
  row[0] = userId;
  row[1] = password;
  row[2] = userName;
  row[3] = role;
  sheet.appendRow(row);

  return { success: true, userId: userId, userName: userName, role: role };
}

/** 自己登録（役割は作業員固定） */
function signupUser(params) {
  const p = params || {};
  let spreadsheetId;
  try {
    spreadsheetId = openTenantByOrgId_(p.orgId || 'default');
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }

  const created = createMeiboUser_(TENANT_SS, {
    userId: p.userId,
    password: p.password,
    userName: p.userName,
    role: '作業員'
  });
  if (!created.success) return created;

  try {
    writeLog(created.userName, "サインアップ", "システム", "自己登録: " + created.userId);
  } catch (e) {}

  return {
    success: true,
    message: "アカウントを登録しました",
    name: created.userName,
    role: '作業員',
    userId: created.userId,
    spreadsheetId: spreadsheetId
  };
}

/** 管理者によるユーザー追加（管理者ID/PW検証必須） */
function adminAddUser(params) {
  const p = params || {};
  let spreadsheetId;
  try {
    spreadsheetId = openTenantByOrgId_(p.orgId || 'default');
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }

  const adminId = String(p.adminUserId || '').trim();
  const adminPw = String(p.adminPassword || '');
  if (!adminId || !adminPw) {
    return { success: false, message: "管理者のログイン情報が必要です" };
  }

  const sheet = TENANT_SS.getSheetByName('名簿');
  if (!sheet) return { success: false, message: "名簿シートが見つかりません" };
  const data = sheet.getDataRange().getValues();
  let adminName = '';
  let adminOk = false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === adminId && String(data[i][1]) === adminPw) {
      const role = String(data[i][3] || '作業員').trim();
      if (role !== '管理者') {
        return { success: false, message: "管理者権限がありません" };
      }
      adminName = String(data[i][2] || adminId);
      adminOk = true;
      break;
    }
  }
  if (!adminOk) {
    return { success: false, message: "管理者のIDまたはパスワードが正しくありません" };
  }

  const roleToAdd = String(p.role || '作業員').trim() === '管理者' ? '管理者' : '作業員';
  const created = createMeiboUser_(TENANT_SS, {
    userId: p.userId,
    password: p.password,
    userName: p.userName,
    role: roleToAdd
  });
  if (!created.success) return created;

  try {
    writeLog(adminName, "ユーザー追加", created.userId, "役割:" + created.role + " / 名前:" + created.userName);
  } catch (e) {}

  return {
    success: true,
    message: "ユーザーを追加しました",
    name: created.userName,
    role: created.role,
    userId: created.userId,
    spreadsheetId: spreadsheetId
  };
}

/** 管理者認証（名簿照合）。成功時は管理者情報を返す */
function verifyMeiboAdmin_(adminUserId, adminPassword) {
  const adminId = String(adminUserId || '').trim();
  const adminPw = String(adminPassword || '');
  if (!adminId || !adminPw) {
    return { success: false, message: "管理者のログイン情報が必要です" };
  }
  if (!TENANT_SS) return { success: false, message: "データベースに接続できません" };
  const sheet = TENANT_SS.getSheetByName('名簿');
  if (!sheet) return { success: false, message: "名簿シートが見つかりません" };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === adminId && String(data[i][1]) === adminPw) {
      const role = String(data[i][3] || '作業員').trim();
      if (role !== '管理者') {
        return { success: false, message: "管理者権限がありません" };
      }
      return {
        success: true,
        row: i + 1,
        userId: adminId,
        userName: String(data[i][2] || adminId),
        role: role,
        sheet: sheet,
        data: data
      };
    }
  }
  return { success: false, message: "管理者のIDまたはパスワードが正しくありません" };
}

/** 管理者向け: ユーザー一覧（権限変更用） */
function listUsersForAdmin(params) {
  const p = params || {};
  try {
    if (!TENANT_SS) openTenantByOrgId_(p.orgId || 'default');
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }

  const admin = verifyMeiboAdmin_(p.adminUserId || p.userId, p.adminPassword || p.password);
  if (!admin.success) return admin;

  const users = [];
  let deptCol = -1;
  try {
    const info = ensureMeiboDeptColumn_();
    deptCol = info.col;
  } catch (e) {}
  for (let i = 1; i < admin.data.length; i++) {
    const uid = String(admin.data[i][0] || '').trim();
    if (!uid) continue;
    users.push({
      userId: uid,
      userName: String(admin.data[i][2] || '').trim(),
      role: String(admin.data[i][3] || '作業員').trim() || '作業員',
      dept: deptCol >= 0 ? (String(admin.data[i][deptCol] || '').trim() || '未設定') : '未設定'
    });
  }
  users.sort(function(a, b) {
    const ra = a.role === '管理者' ? 0 : 1;
    const rb = b.role === '管理者' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return String(a.userName || a.userId).localeCompare(String(b.userName || b.userId), 'ja');
  });
  let departments = ['運営', '未設定'];
  try { departments = getDeptList_(); } catch (e) {}
  return { success: true, users: users, departments: departments };
}

/** 管理者向け: ユーザー権限変更 */
function updateUserRole(params) {
  const p = params || {};
  try {
    if (!TENANT_SS) openTenantByOrgId_(p.orgId || 'default');
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }

  const admin = verifyMeiboAdmin_(p.adminUserId || p.userId, p.adminPassword || p.password);
  if (!admin.success) return admin;

  const targetUserId = String(p.targetUserId || '').trim();
  let newRole = String(p.newRole || '').trim();
  if (!targetUserId) return { success: false, message: "対象ユーザーが指定されていません" };
  if (newRole !== '管理者' && newRole !== '作業員') {
    return { success: false, message: "権限は「管理者」または「作業員」を指定してください" };
  }

  let targetRow = -1;
  let targetName = '';
  let currentRole = '';
  let adminCount = 0;
  for (let i = 1; i < admin.data.length; i++) {
    const uid = String(admin.data[i][0] || '').trim();
    const role = String(admin.data[i][3] || '作業員').trim() || '作業員';
    if (role === '管理者') adminCount++;
    if (uid === targetUserId) {
      targetRow = i + 1;
      targetName = String(admin.data[i][2] || uid);
      currentRole = role;
    }
  }
  if (targetRow < 0) return { success: false, message: "対象ユーザーが見つかりません" };
  if (currentRole === newRole) {
    return { success: true, message: "権限は変更されていません", userId: targetUserId, userName: targetName, role: newRole };
  }
  if (currentRole === '管理者' && newRole === '作業員' && adminCount <= 1) {
    return { success: false, message: "最後の管理者は作業員に変更できません" };
  }

  admin.sheet.getRange(targetRow, 4).setValue(newRole);
  try {
    writeLog(admin.userName, "権限変更", targetUserId, targetName + ": " + currentRole + " → " + newRole);
  } catch (e) {}

  return {
    success: true,
    message: "権限を変更しました",
    userId: targetUserId,
    userName: targetName,
    role: newRole,
    previousRole: currentRole
  };
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
    try { ensureWorkMasterHeaders_(workSheet); } catch (e) {}
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

      const idxCropDetails = headers.indexOf('作物別詳細作業');
      for (let i = 1; i < data.length; i++) {
        let wName = idxName >= 0 ? String(data[i][idxName] || "").trim() : "";
        if (wName) {
          let cat = idxCategory >= 0 && data[i][idxCategory] ? String(data[i][idxCategory]).trim() : "";
          if (!cat) cat = "圃場作業"; // デフォルト

          const cropStr = idxCrop >= 0 ? String(data[i][idxCrop] || "").trim() : "";
          let cropDetails = null;
          if (idxCropDetails >= 0 && data[i][idxCropDetails]) {
            try { cropDetails = JSON.parse(String(data[i][idxCropDetails])); }
            catch (e) { cropDetails = null; }
          }

          const uiFlags = readWorkMasterUiFlagsFromRow_(headers, data[i]);
          workMaster.push({ 
            category: cat, 
            name: wName,
            cropName: cropStr,
            crops: cropStr ? cropStr.split(/[,、]/).map(s => String(s).trim()).filter(Boolean) : [],
            cropDetails: cropDetails,
            detailWorks: idxDetail >= 0 && data[i][idxDetail] ? String(data[i][idxDetail]).trim() : "",
            showMachine: uiFlags.showMachine,
            showMaterial: uiFlags.showMaterial,
            showPesticide: uiFlags.showPesticide
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
  pdl.contentUnits = getContentUnitMasterList_(pdl.containers);
  try {
    maintenanceContents = maintenanceContents.concat(readMaintenanceContentMaster_());
  } catch (e) {
    console.warn('整備内容マスタ読み込みスキップ:', e);
  }
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

  // 🌟道具マスタの読み込み🌟
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
  // 🌟農薬マスタ
  try {
    pdl.pesticides = readPesticideMasterList_();
  } catch (peErr) {
    pdl.pesticides = [];
  }
  try {
    pdl.fertilizers = readFertilizerMasterList_();
  } catch (feErr) {
    pdl.fertilizers = [];
  }
  try {
    pdl.cropChemPlans = listCropChemPlansBrief_();
  } catch (ccpErr) {
    pdl.cropChemPlans = [];
  }
  try {
    pdl.costItems = readCostMasterList_();
  } catch (ciErr) {
    pdl.costItems = [];
  }
  try {
    pdl.cropCostPlans = listCropCostPlansBrief_();
  } catch (ccp2Err) {
    pdl.cropCostPlans = [];
  }
  try {
    pdl.cropWorkPlans = listCropWorkPlansBrief_();
  } catch (cwpErr) {
    pdl.cropWorkPlans = [];
  }
  try {
    pdl.nurseryLocations = readNurseryLocationList_();
  } catch (nlErr) {
    pdl.nurseryLocations = [];
  }
  try {
    pdl.cropCultSettings = readCropCultSettingList_();
  } catch (ccsErr) {
    pdl.cropCultSettings = [];
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

    
  

  try {
    pdl.deliveryDestinations = getDeliveryDestinations();
  } catch (ddErr) {
    pdl.deliveryDestinations = [];
  }

  // =========================================================
  // ★修正：履歴から見つけていただいた「完璧なreturn」に上書き！
  return { pdl, polygons: getSavedPolygons(), toukiList: getCol(['登記ID'], 0), activeLots, prodCategories: getProdMgmtCategories() };
  // =========================================================

} // ← これが getInitData を閉じる } です

function getDeliveryDestinations() {
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty('DELIVERY_DESTINATIONS_JSON');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn('getDeliveryDestinations error:', e);
    return [];
  }
}

function saveDeliveryDestination(params) {
  const dest = (params && (params.destination || params.dest)) ? (params.destination || params.dest) : params;
  if (!dest || !dest.name) return { success: false, message: '配送先名が必要です。' };
  const props = PropertiesService.getScriptProperties();
  let list = getDeliveryDestinations();

  const id = dest.id || ('dest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
  const newEntry = {
    id: id,
    name: String(dest.name).trim(),
    lat: dest.lat != null && dest.lat !== '' ? Number(dest.lat) : null,
    lng: dest.lng != null && dest.lng !== '' ? Number(dest.lng) : null,
    address: dest.address ? String(dest.address).trim() : '',
    updatedAt: new Date().toISOString()
  };

  const idx = list.findIndex(item => item.id === id || (item.name && item.name === newEntry.name));
  if (idx !== -1) {
    list[idx] = Object.assign({}, list[idx], newEntry);
  } else {
    list.unshift(newEntry);
  }
  props.setProperty('DELIVERY_DESTINATIONS_JSON', JSON.stringify(list));
  return { success: true, list: list, entry: newEntry };
}

function deleteDeliveryDestination(params) {
  const id = params ? (params.id || params.destId) : null;
  const name = params ? params.name : null;
  const props = PropertiesService.getScriptProperties();
  let list = getDeliveryDestinations();
  list = list.filter(item => item.id !== id && item.name !== name);
  props.setProperty('DELIVERY_DESTINATIONS_JSON', JSON.stringify(list));
  return { success: true, list: list };
}
  



/// =========================================
// 拠点マスタ（県・市・産地付き）
// =========================================
function ensureLocationMasterSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('拠点マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('拠点マスタ');
    sheet.appendRow(['拠点名', '県', '市', '産地', 'タグ略称']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e0e0e0');
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
    headers.push('産地');
  }
  if (headers.indexOf('タグ略称') === -1) {
    const col = headers.length + 1;
    sheet.getRange(1, col).setValue('タグ略称').setFontWeight('bold').setBackground('#e0e0e0');
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
  const idxTagAbbreviation = headers.indexOf('タグ略称');
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
      tagAbbreviation: idxTagAbbreviation >= 0 ? String(data[i][idxTagAbbreviation] || '').trim() : '',
      climate: climates.join(','),
      climates: climates
    });
  }
  return results;
}

function ensureMaintenanceContentMasterSheet_() {
  let sheet = TENANT_SS.getSheetByName('整備内容マスタ');
  if (!sheet) {
    sheet = TENANT_SS.insertSheet('整備内容マスタ');
    sheet.appendRow(['整備内容']);
    sheet.getRange(1, 1).setFontWeight('bold').setBackground('#e0e0e0');
  }
  return sheet;
}

function readMaintenanceContentMaster_() {
  const sheet = ensureMaintenanceContentMasterSheet_();
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
    .map(row => String(row[0] || '').trim())
    .filter(Boolean);
}

function addMaintenanceContent(params) {
  const name = String((params && (params.name || params.content)) || '').trim();
  if (!name) return { success: false, message: '整備内容を入力してください' };
  if (name.length > 80) return { success: false, message: '整備内容は80文字以内で入力してください' };

  const sheet = ensureMaintenanceContentMasterSheet_();
  const items = readMaintenanceContentMaster_();
  if (!items.includes(name)) sheet.appendRow([name]);
  const updated = readMaintenanceContentMaster_();
  return {
    success: true,
    message: items.includes(name) ? '既に登録されています' : '整備内容を追加しました',
    items: updated
  };
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
  if (masterType === 'costItem') {
    return manageCostMaster_(manageAction, value, userName);
  }
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
  else if (masterType === 'department' || masterType === 'dept') sheetName = '部署マスタ';
  else if (masterType === 'contentUnit') sheetName = 'コンテナ内容単位マスタ';
  else if (masterType === 'machineType') sheetName = '機種マスタ';
  else if (masterType === 'machineGroup') sheetName = '機械グループマスタ';
  else if (masterType === 'container') sheetName = 'コンテナマスタ';
  else if (masterType === 'pesticide') sheetName = '農薬マスタ';
  else if (masterType === 'fertilizer') sheetName = '肥料マスタ';
  else if (masterType === 'nurseryLocation') sheetName = '育苗場所マスタ';
  else if (masterType === 'cropCultSetting') sheetName = '作物栽培設定マスタ';
  
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
      if (masterType === 'workCategory') {
          sheet = ss.insertSheet(sheetName);
          sheet.appendRow(["カテゴリ名"]);
          sheet.appendRow(["圃場作業"]);
          sheet.appendRow(["事務作業"]);
          sheet.appendRow(["保全・整備"]);
      } else if (masterType === 'department' || masterType === 'dept') {
          sheet = ensureDeptMasterSheet_();
      } else if (masterType === 'contentUnit') {
          sheet = ensureContentUnitMasterSheet_();
      } else if (masterType === 'crop') {
          sheet = ensureCropMasterSheet_();
      } else if (masterType === 'container') {
          sheet = ensureContainerMasterSheet_();
      } else if (masterType === 'machineType') {
          sheet = ensureMachineTypeMasterSheet_();
      } else if (masterType === 'machineGroup') {
          sheet = ensureMachineGroupMasterSheet_();
      } else if (masterType === 'location') {
          sheet = ensureLocationMasterSheet_();
      } else if (masterType === 'pesticide') {
          sheet = ensurePesticideMasterSheet_();
      } else if (masterType === 'fertilizer') {
          sheet = ensureFertilizerMasterSheet_();
      } else if (masterType === 'nurseryLocation') {
          sheet = ensureNurseryLocationSheet_();
      } else if (masterType === 'cropCultSetting') {
          sheet = ensureCropCultSettingSheet_();
      } else {
          throw new Error(`${sheetName}が見つかりません`);
      }
  }

  if (masterType === 'crop') {
    sheet = ensureCropMasterSheet_();
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
  if (masterType === 'contentUnit') {
    sheet = ensureContentUnitMasterSheet_();
  }
  if (masterType === 'pesticide') {
    sheet = ensurePesticideMasterSheet_();
  }
  if (masterType === 'fertilizer') {
    sheet = ensureFertilizerMasterSheet_();
  }
  if (masterType === 'nurseryLocation') {
    sheet = ensureNurseryLocationSheet_();
  }
  if (masterType === 'cropCultSetting') {
    sheet = ensureCropCultSettingSheet_();
  }

  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(h => String(h).trim());

  if (manageAction === 'merge') {
    if (masterType !== 'work') throw new Error('統合できるのは作業マスタのみです');
    mergeWorkMasterConflict_(sheet, value, userName);
  }
  else if (manageAction === 'add') {
    if (masterType === 'crop') {
      const cropName = String((value && value.name) || '').trim();
      if (!cropName) throw new Error('作物名を入力してください');
      const density = Number((value && value.density) || 0) || 0;
      const tagAbbreviation = String((value && value.tagAbbreviation) || '').trim();
      const existing = sheet.getDataRange().getValues();
      for (let i = 1; i < existing.length; i++) {
        if (String(existing[i][0] || '').trim() === cropName) {
          throw new Error(`作物名「${cropName}」は既に登録されています`);
        }
      }
      assertTagAbbreviationUnique_(tagAbbreviation || cropName, {});
      sheet.appendRow([cropName, density, '', tagAbbreviation]);
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
      const tagAbbreviation = String(loc.tagAbbreviation || '').trim();
      assertTagAbbreviationUnique_(tagAbbreviation || name, {});
      const row = new Array(headers.length).fill('');
      row[0] = name;
      const prefIdx = headers.indexOf('県');
      const cityIdx = headers.indexOf('市');
      const climIdx = headers.indexOf('産地');
      const tagAbbrIdx = headers.indexOf('タグ略称');
      if (prefIdx >= 0) row[prefIdx] = String(loc.prefecture || '').trim();
      if (cityIdx >= 0) row[cityIdx] = String(loc.city || '').trim();
      if (climIdx >= 0) {
        const climates = loc.climates != null ? loc.climates : loc.climate;
        row[climIdx] = formatLocationClimates_(climates);
      }
      if (tagAbbrIdx >= 0) row[tagAbbrIdx] = tagAbbreviation;
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
    } else if (masterType === 'pesticide') {
      const rowObj = normalizePesticideMasterItem_(value);
      if (!rowObj.name) throw new Error('農薬名を入力してください');
      appendPesticideMasterRow_(sheet, rowObj);
      writeLog(userName, "マスタ追加", rowObj.name, `対象: ${sheetName} / 作物: ${rowObj.cropName || ''}`);
    } else if (masterType === 'fertilizer') {
      const rowObj = normalizeFertilizerMasterItem_(value);
      if (!rowObj.name) throw new Error('肥料名を入力してください');
      appendFertilizerMasterRow_(sheet, rowObj);
      writeLog(userName, "マスタ追加", rowObj.name, `対象: ${sheetName}`);
    } else if (masterType === 'nurseryLocation') {
      const loc = (typeof value === 'object' && value) ? value : { name: value };
      const polyId = String(loc.polyId || '').trim();
      const polyName = String(loc.polyName || '').trim();
      const locationName = String(loc.locationName || '').trim();
      const commonDir = String(loc.direction || '').trim();
      const commonNote = String(loc.note || '').trim();
      // 一括: plots:[{name,direction}] または names:['区画1','区画2']
      let plotItems = [];
      if (Array.isArray(loc.plots) && loc.plots.length) {
        plotItems = loc.plots.map(function(p) {
          if (typeof p === 'string') return { name: String(p || '').trim(), direction: commonDir, note: commonNote, polyId: polyId };
          return {
            name: String((p && (p.name || p.plotName)) || '').trim(),
            direction: String((p && p.direction) || commonDir).trim(),
            note: String((p && p.note) || commonNote).trim(),
            polyId: String((p && p.polyId) || polyId || '').trim()
          };
        }).filter(function(p) { return !!p.name; });
      } else if (Array.isArray(loc.names) && loc.names.length) {
        plotItems = loc.names.map(function(n) {
          return { name: String(n || '').trim(), direction: commonDir, note: commonNote };
        }).filter(function(p) { return !!p.name; });
      } else {
        const name = String(loc.name || '').trim();
        if (name) plotItems = [{ name: name, direction: commonDir, note: commonNote }];
      }
      if (!plotItems.length) throw new Error('育苗場所名（区画）を入力してください');
      const mapLat = (loc.mapLat === '' || loc.mapLat == null) ? '' : loc.mapLat;
      const mapLng = (loc.mapLng === '' || loc.mapLng == null) ? '' : loc.mapLng;
      const mapZoom = (loc.mapZoom === '' || loc.mapZoom == null) ? '' : loc.mapZoom;
      const addedNames = [];
      plotItems.forEach(function(p) {
        const newId = 'NUR-' + Utilities.getUuid().substring(0, 8);
        const rowPolyId = String(p.polyId || polyId || '').trim();
        sheet.appendRow([newId, p.name, rowPolyId, polyName, p.direction || '', p.note || '', locationName, mapLat, mapLng, mapZoom]);
        addedNames.push(p.name);
      });
      writeLog(userName, "マスタ追加", addedNames.join(', '), `対象: ${sheetName} / カテゴリ: ${polyName || '-'} / ${addedNames.length}件`);
    } else if (masterType === 'cropCultSetting') {
      const row = (typeof value === 'object' && value) ? value : { cropName: value };
      const cropName = String(row.cropName || row.name || '').trim();
      if (!cropName) throw new Error('作物名を入力してください');
      const existing = readCropCultSettingList_();
      if (existing.some(x => x.cropName === cropName)) throw new Error('作物「' + cropName + '」の栽培設定は既にあります');
      sheet.appendRow([cropName, (row.sowingHoles === '' || row.sowingHoles == null) ? '' : row.sowingHoles, String(row.note || '').trim()]);
      writeLog(userName, "マスタ追加", cropName, `対象: ${sheetName}`);
    } else {
      sheet.appendRow([value]);
    }
    if (masterType !== 'location' && masterType !== 'container' && masterType !== 'pesticide' && masterType !== 'fertilizer' && masterType !== 'nurseryLocation' && masterType !== 'cropCultSetting') {
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
      const tagAbbreviation = String(loc.tagAbbreviation || '').trim();
      assertTagAbbreviationUnique_(tagAbbreviation || newName, { excludeLocationName: originalName });
      const prefIdx = headers.indexOf('県');
      const cityIdx = headers.indexOf('市');
      const climIdx = headers.indexOf('産地');
      const tagAbbrIdx = headers.indexOf('タグ略称');
      let locFound = false;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === originalName) {
          sheet.getRange(i + 1, 1).setValue(newName);
          if (prefIdx >= 0) sheet.getRange(i + 1, prefIdx + 1).setValue(String(loc.prefecture || '').trim());
          if (cityIdx >= 0) sheet.getRange(i + 1, cityIdx + 1).setValue(String(loc.city || '').trim());
          if (climIdx >= 0) {
            const climates = loc.climates != null ? loc.climates : loc.climate;
            sheet.getRange(i + 1, climIdx + 1).setValue(formatLocationClimates_(climates));
          }
          if (tagAbbrIdx >= 0) sheet.getRange(i + 1, tagAbbrIdx + 1).setValue(tagAbbreviation);
          writeLog(userName, "マスタ編集", newName, `対象: ${sheetName} (元: ${originalName})`);
          locFound = true;
          break;
        }
      }
      if (!locFound) throw new Error('拠点「' + originalName + '」が拠点マスタにありません');
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
    } else if (masterType === 'contentUnit') {
      const originalName = String(value.originalName || '').trim();
      const newName = String((value.newData && value.newData.name) || value.name || '').trim();
      if (!originalName) throw new Error('変更前の単位名がありません');
      if (!newName) throw new Error('単位名を入力してください');
      if (newName !== originalName) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][0] || '').trim() === newName) {
            throw new Error(`単位名「${newName}」は既に登録されています`);
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
      if (!found) throw new Error(`単位「${originalName}」が見つかりません`);
      writeLog(userName, "マスタ編集", newName, `対象: ${sheetName} (元: ${originalName})`);
    } else if (masterType === 'crop') {
      const originalName = String(value.originalName || '').trim();
      const newData = value.newData || value || {};
      const newName = String(newData.name || '').trim();
      const newDensity = (newData.density != null && newData.density !== '') ? Number(newData.density) || 0 : null;
      const hasTagAbbr = Object.prototype.hasOwnProperty.call(newData, 'tagAbbreviation');
      const newTagAbbreviation = hasTagAbbr ? String(newData.tagAbbreviation || '').trim() : null;
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
      let tagAbbrToWrite = '';
      let colorToKeep = '';
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === originalName) {
          densityToWrite = (newDensity != null) ? newDensity : (Number(data[i][1]) || 0);
          colorToKeep = String(data[i][2] || '').trim();
          tagAbbrToWrite = (newTagAbbreviation != null)
            ? newTagAbbreviation
            : String(data[i][3] || '').trim();
          assertTagAbbreviationUnique_(tagAbbrToWrite || newName, { excludeCropName: originalName });
          sheet.getRange(i + 1, 1).setValue(newName);
          sheet.getRange(i + 1, 2).setValue(densityToWrite);
          if (colorToKeep) sheet.getRange(i + 1, 3).setValue(colorToKeep);
          sheet.getRange(i + 1, 4).setValue(tagAbbrToWrite);
          found = true;
          break;
        }
      }
      if (!found) {
        // 作物マスタに無い場合は追記（生育記録マスタ側だけの旧データ向け）
        densityToWrite = (newDensity != null) ? newDensity : 0;
        tagAbbrToWrite = (newTagAbbreviation != null) ? newTagAbbreviation : '';
        assertTagAbbreviationUnique_(tagAbbrToWrite || newName, { excludeCropName: originalName });
        sheet.appendRow([newName, densityToWrite, '', tagAbbrToWrite]);
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
    } else if (masterType === 'pesticide') {
      const id = String((value && value.id) || (value && value.originalId) || '').trim();
      if (!id) throw new Error('編集対象のIDがありません');
      const newData = normalizePesticideMasterItem_((value && value.newData) || value || {});
      if (!newData.name) throw new Error('農薬名を入力してください');
      const latest = sheet.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < latest.length; i++) {
        if (String(latest[i][0] || '').trim() !== id) continue;
        sheet.getRange(i + 1, 1, 1, 11).setValues([[
          id,
          newData.name,
          newData.activeIngredient,
          newData.volume,
          newData.manufacturer,
          newData.cropName,
          newData.dilution,
          newData.phiDays,
          newData.useTimingText,
          newData.regNumber,
          newData.note
        ]]);
        found = true;
        break;
      }
      if (!found) throw new Error('対象の農薬マスタ行が見つかりません');
      writeLog(userName, "マスタ編集", newData.name, `対象: ${sheetName} / id: ${id}`);
    } else if (masterType === 'fertilizer') {
      const id = String((value && value.id) || (value && value.originalId) || '').trim();
      if (!id) throw new Error('編集対象のIDがありません');
      const newData = normalizeFertilizerMasterItem_((value && value.newData) || value || {});
      if (!newData.name) throw new Error('肥料名を入力してください');
      const latest = sheet.getDataRange().getValues();
      let found = false;
      for (let i = 1; i < latest.length; i++) {
        if (String(latest[i][0] || '').trim() !== id) continue;
        sheet.getRange(i + 1, 1, 1, 11).setValues([[
          id,
          newData.name,
          newData.fertilizerType,
          newData.nitrogen,
          newData.phosphate,
          newData.potash,
          newData.components,
          newData.volumeAmount,
          newData.manufacturer,
          newData.regNumber,
          newData.note
        ]]);
        sheet.getRange(i + 1, 12).setValue(newData.volumeUnit);
        found = true;
        break;
      }
      if (!found) throw new Error('対象の肥料マスタ行が見つかりません');
      writeLog(userName, "マスタ編集", newData.name, `対象: ${sheetName} / id: ${id}`);
    } else if (masterType === 'nurseryLocation') {
      const polyName = String(value.originalName || value.polyName || '').trim();
      if (!polyName) throw new Error('場所カテゴリ名がありません');
      const newData = value.newData || {};
      const latest = sheet.getDataRange().getValues();
      const locIdx = headers.indexOf('拠点');
      const locCol = locIdx >= 0 ? locIdx + 1 : 7;
      let updated = 0;
      if (newData.locationName != null) {
        const locationName = String(newData.locationName || '').trim();
        for (let i = 1; i < latest.length; i++) {
          if (String(latest[i][3] || '').trim() !== polyName) continue;
          sheet.getRange(i + 1, locCol).setValue(locationName);
          updated++;
        }
        if (!updated) throw new Error('場所カテゴリ「' + polyName + '」が見つかりません');
        writeLog(userName, "マスタ編集", polyName + '→' + (locationName || '未設定'), `対象: ${sheetName} / 拠点紐づけ`);
      } else if (newData.mapLat != null || newData.mapLng != null || newData.mapZoom != null) {
        const latIdx = headers.indexOf('地図緯度');
        const lngIdx = headers.indexOf('地図経度');
        const zoomIdx = headers.indexOf('地図ズーム');
        const latCol = latIdx >= 0 ? latIdx + 1 : 8;
        const lngCol = lngIdx >= 0 ? lngIdx + 1 : 9;
        const zoomCol = zoomIdx >= 0 ? zoomIdx + 1 : 10;
        const mapLat = newData.mapLat != null ? newData.mapLat : '';
        const mapLng = newData.mapLng != null ? newData.mapLng : '';
        const mapZoom = newData.mapZoom != null ? newData.mapZoom : '';
        for (let i = 1; i < latest.length; i++) {
          if (String(latest[i][3] || '').trim() !== polyName) continue;
          sheet.getRange(i + 1, latCol).setValue(mapLat);
          sheet.getRange(i + 1, lngCol).setValue(mapLng);
          sheet.getRange(i + 1, zoomCol).setValue(mapZoom);
          updated++;
        }
        if (!updated) throw new Error('場所カテゴリ「' + polyName + '」が見つかりません');
        writeLog(userName, "マスタ編集", polyName + ' 地図初期位置', `対象: ${sheetName} / lat:${mapLat} lng:${mapLng} zoom:${mapZoom}`);
      } else {
        throw new Error('更新内容がありません');
      }
    }
  } 
  else if (manageAction === 'delete') {
    const data = sheet.getDataRange().getValues();
    const targetVal = value.id || value.name || value;
    const targetCrop = (typeof value === 'object' && value) ? String(value.crop || '').trim() : '';
    
    const keyIdx = masterType === 'work' ? headers.indexOf('作業名') : 0;
    let deleted = false;

    if (masterType === 'nurseryLocation') {
      const val = (typeof value === 'object' && value) ? value : { id: value, name: value };
      const targetId = String(val.id || '').trim();
      const polyName = String(val.polyName || '').trim();
      const plotName = String(val.plotName || val.name || '').trim();
      const direction = String(val.direction || '').trim();
      const plotNames = Array.isArray(val.plotNames)
        ? val.plotNames.map(function(n) { return String(n || '').trim(); }).filter(Boolean)
        : [];
      const plotNameSet = {};
      if (plotNames.length) {
        plotNames.forEach(function(n) { plotNameSet[n] = true; });
      } else if (plotName) {
        plotNameSet[plotName] = true;
      }
      const rowsToDelete = [];
      for (let i = 1; i < data.length; i++) {
        let match = false;
        if (targetId) {
          match = String(data[i][0] || '').trim() === targetId;
        } else if (polyName) {
          const rowPoly = String(data[i][3] || '').trim();
          if (rowPoly !== polyName) continue;
          const rowName = String(data[i][1] || '').trim();
          const rowDir = String(data[i][4] || '').trim();
          if (Object.keys(plotNameSet).length && direction) {
            match = !!plotNameSet[rowName] && rowDir === direction;
          } else if (Object.keys(plotNameSet).length) {
            match = !!plotNameSet[rowName];
          } else if (direction) {
            match = rowDir === direction;
          }
        } else {
          const tv = targetVal;
          match = String(data[i][0] || '').trim() === String(tv || '').trim()
            || String(data[i][1] || '').trim() === String(tv || '').trim();
        }
        if (match) rowsToDelete.push(i + 1);
      }
      if (!rowsToDelete.length) throw new Error('削除対象の育苗場所が見つかりません');
      rowsToDelete.sort(function(a, b) { return b - a; }).forEach(function(rowNum) {
        sheet.deleteRow(rowNum);
      });
      deleted = true;
      const labelParts = [];
      const deletedPlotLabels = Object.keys(plotNameSet);
      if (deletedPlotLabels.length > 1) {
        labelParts.push(deletedPlotLabels.join('、'));
      } else if (deletedPlotLabels.length === 1) {
        labelParts.push(deletedPlotLabels[0]);
      }
      if (direction) labelParts.push(direction);
      const label = labelParts.length ? labelParts.join('/') : (targetId || String(targetVal || ''));
      writeLog(userName, "マスタ削除", label + (rowsToDelete.length > 1 ? ' (' + rowsToDelete.length + '件)' : ''), `対象: ${sheetName} / ${polyName || '-'}`);
    } else for (let i = 1; i < data.length; i++) {
      let match = false;
      if (masterType === 'work') {
          if (keyIdx >= 0 && data[i][keyIdx] === targetVal) match = true;
      } else if (masterType === 'container') {
          const rowName = String(data[i][0] || '').trim();
          const rowCrop = String(data[i][1] || '').trim();
          if (rowName === String(targetVal || '').trim() && (!targetCrop || rowCrop === targetCrop)) match = true;
      } else if (masterType === 'pesticide') {
          if (String(data[i][0] || '').trim() === String(targetVal || '').trim()) match = true;
      } else if (masterType === 'fertilizer') {
          if (String(data[i][0] || '').trim() === String(targetVal || '').trim()) match = true;
      } else if (masterType === 'cropCultSetting') {
          if (String(data[i][0] || '').trim() === String(targetVal || '').trim()) match = true;
      } else if (masterType === 'location' || masterType === 'sign' || masterType === 'workCategory' || masterType === 'contentUnit' || masterType === 'machineType' || masterType === 'machineGroup') {
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
  if (masterType === 'contentUnit') {
    return getContentUnitMasterList_();
  }
  if (masterType === 'pesticide') {
    return readPesticideMasterList_();
  }
  if (masterType === 'fertilizer') {
    return readFertilizerMasterList_();
  }
  if (masterType === 'nurseryLocation') {
    return readNurseryLocationList_();
  }
  if (masterType === 'cropCultSetting') {
    return readCropCultSettingList_();
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

function splitWorkMasterTokens_(s) {
  return String(s == null ? '' : s).split(/[,、\n]/).map(function (x) {
    return String(x || '').trim();
  }).filter(Boolean);
}

function uniqWorkMasterTokens_(arr) {
  const seen = {};
  const out = [];
  (arr || []).forEach(function (p) {
    const t = String(p || '').trim();
    if (!t || seen[t]) return;
    seen[t] = true;
    out.push(t);
  });
  return out;
}

function mergeWorkMasterDetailStr_(a, b) {
  return uniqWorkMasterTokens_(splitWorkMasterTokens_(a).concat(splitWorkMasterTokens_(b))).join('、');
}

function mergeWorkMasterCropDetailsMaps_(maps) {
  const out = {};
  (maps || []).forEach(function (m) {
    if (!m) return;
    let obj = m;
    if (typeof m === 'string') {
      try { obj = JSON.parse(m); } catch (e) { obj = null; }
    }
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function (k) {
      out[k] = mergeWorkMasterDetailStr_(out[k], obj[k]);
    });
  });
  return out;
}

function orWorkMasterFlag_(a, b, c) {
  const vals = [a, b, c].map(parseWorkUiFlagValue_);
  if (vals.some(function (v) { return v === true; })) return true;
  const first = vals.find(function (v) { return v !== null; });
  return first == null ? null : first;
}

function mergeWorkMasterObjects_(keepObj, origObj, incoming, originalName) {
  keepObj = keepObj || {};
  origObj = origObj || null;
  incoming = incoming || {};
  const keepName = String(incoming.name || keepObj.name || '').trim();
  const crops = uniqWorkMasterTokens_([]
    .concat(keepObj.crops || splitWorkMasterTokens_(keepObj.cropName))
    .concat(origObj ? (origObj.crops || splitWorkMasterTokens_(origObj.cropName)) : [])
    .concat(incoming.crops || splitWorkMasterTokens_(incoming.cropName)));
  const cropDetails = mergeWorkMasterCropDetailsMaps_([
    keepObj.cropDetails,
    origObj && origObj.cropDetails,
    incoming.cropDetails
  ]);
  const detailWorks = mergeWorkMasterDetailStr_(
    mergeWorkMasterDetailStr_(keepObj.detailWorks, origObj && origObj.detailWorks),
    incoming.detailWorks
  );
  const aliasParts = []
    .concat(keepObj.aliases || splitWorkMasterTokens_(keepObj.aliasNames))
    .concat(origObj ? (origObj.aliases || splitWorkMasterTokens_(origObj.aliasNames)) : [])
    .concat(splitWorkMasterTokens_(incoming.aliasNames))
    .concat(incoming.aliases || []);
  if (originalName && originalName !== keepName) aliasParts.push(originalName);
  const aliases = uniqWorkMasterTokens_(aliasParts).filter(function (a) { return a !== keepName; });
  const category = String(incoming.category || (origObj && origObj.category) || keepObj.category || '圃場作業').trim() || '圃場作業';
  return {
    name: keepName,
    category: category,
    cropName: crops.join(','),
    crops: crops,
    cropDetails: cropDetails,
    detailWorks: detailWorks,
    aliasNames: aliases.join(', '),
    aliases: aliases,
    showMachine: orWorkMasterFlag_(keepObj.showMachine, origObj && origObj.showMachine, incoming.showMachine),
    showMaterial: orWorkMasterFlag_(keepObj.showMaterial, origObj && origObj.showMaterial, incoming.showMaterial),
    showPesticide: orWorkMasterFlag_(keepObj.showPesticide, origObj && origObj.showPesticide, incoming.showPesticide)
  };
}

/** 同名の作業マスタへ作物・詳細・別名を統合し、元の行があれば削除する */
function mergeWorkMasterConflict_(sheet, value, userName) {
  const workHeaders = ensureWorkMasterHeaders_(sheet);
  const incoming = (value && value.newData) ? value.newData : (value || {});
  const keepName = String(incoming.name || (value && value.name) || '').trim();
  const originalName = String((value && value.originalName) || '').trim();
  if (!keepName) throw new Error('作業名を入力してください');

  const list = readWorkMasterList_(sheet) || [];
  const keepObj = list.find(function (w) { return w && String(w.name || '').trim() === keepName; }) || null;
  const origObj = (originalName && originalName !== keepName)
    ? (list.find(function (w) { return w && String(w.name || '').trim() === originalName; }) || null)
    : null;
  if (!keepObj) throw new Error(`作業名「${keepName}」が見つかりません`);

  const merged = mergeWorkMasterObjects_(keepObj, origObj, incoming, originalName);
  const data = sheet.getDataRange().getValues();
  const keyIdx = workHeaders.indexOf('作業名');
  let keepRow = -1;
  let origRow = -1;
  for (let i = 1; i < data.length; i++) {
    const n = String(data[i][keyIdx] || '').trim();
    if (n === keepName && keepRow < 0) keepRow = i;
    if (originalName && n === originalName && origRow < 0) origRow = i;
  }
  if (keepRow < 0) throw new Error(`作業名「${keepName}」が見つかりません`);

  const rowVals = data[keepRow].slice();
  while (rowVals.length < workHeaders.length) rowVals.push('');
  applyWorkMasterValuesToRow_(rowVals, workHeaders, merged);
  const outRow = rowVals.slice(0, workHeaders.length);
  sheet.getRange(keepRow + 1, 1, 1, outRow.length).setValues([outRow]);

  if (origRow >= 0 && origRow !== keepRow) {
    sheet.deleteRow(origRow + 1);
  }
  writeLog(userName, "作業マスタ統合", keepName, originalName && originalName !== keepName ? (`元: ${originalName}`) : '既存へ統合');
}

const WORK_UI_FLAG_HEADERS_ = {
  showMachine: ['使用農機を出す', '農機を出す'],
  showMaterial: ['使用資材を出す', '資材を出す'],
  showPesticide: ['使用薬剤を出す', '薬剤を出す', '農薬を出す']
};

function findHeaderIndexByNames_(headers, names) {
  const list = Array.isArray(names) ? names : [names];
  for (let i = 0; i < list.length; i++) {
    const idx = headers.indexOf(list[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseWorkUiFlagValue_(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === 'number' && !isNaN(v)) return v !== 0;
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  if (/^(1|true|yes|on|はい|有|☑|✓|✔)$/i.test(s)) return true;
  if (/^(0|false|no|off|いいえ|無|なし)$/i.test(s)) return false;
  return null;
}

function formatWorkUiFlagValue_(v) {
  const b = parseWorkUiFlagValue_(v);
  if (b === true) return '1';
  if (b === false) return '0';
  return '';
}

function readWorkMasterUiFlagsFromRow_(headers, row) {
  const out = { showMachine: null, showMaterial: null, showPesticide: null };
  Object.keys(WORK_UI_FLAG_HEADERS_).forEach(function (k) {
    const idx = findHeaderIndexByNames_(headers, WORK_UI_FLAG_HEADERS_[k]);
    out[k] = idx >= 0 ? parseWorkUiFlagValue_(row[idx]) : null;
  });
  return out;
}

/** 作業マスタ必須ヘッダーを保証（欠けていれば末尾に追加） */
function ensureWorkMasterHeaders_(sheet) {
  const required = ['作業名', 'カテゴリ', '作物名', '詳細作業名', '作物別詳細作業', '類似作業名', '使用農機を出す', '使用資材を出す', '使用薬剤を出す'];
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
      if (name === '類似作業名') {
        const aliasIdx = findWorkAliasColumnIndex_(headers);
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
  const idxAlias = findWorkAliasColumnIndex_(headers);

  if (idxName >= 0) rowVals[idxName] = String((value && value.name) || '').trim();
  if (idxCat >= 0) rowVals[idxCat] = String((value && value.category) || '圃場作業').trim() || '圃場作業';
  if (idxCrop >= 0) rowVals[idxCrop] = String((value && value.cropName) || '').trim();
  if (idxDetail >= 0) rowVals[idxDetail] = String((value && value.detailWorks) || '').trim();
  if (idxAlias >= 0) {
    const aliasVal = value && value.aliasNames != null
      ? String(value.aliasNames).trim()
      : (value && Array.isArray(value.aliases) ? value.aliases.join(', ') : '');
    rowVals[idxAlias] = aliasVal;
  }
  if (idxCropDetails >= 0) {
    // cropDetails 未指定時は既存セルを消さない（詳細作業だけ更新するケース）
    if (value && Object.prototype.hasOwnProperty.call(value, 'cropDetails')) {
      const cd = value.cropDetails ? JSON.stringify(value.cropDetails) : '';
      rowVals[idxCropDetails] = cd;
    }
  }
  Object.keys(WORK_UI_FLAG_HEADERS_).forEach(function (k) {
    if (!value || !Object.prototype.hasOwnProperty.call(value, k)) return;
    const idx = findHeaderIndexByNames_(headers, WORK_UI_FLAG_HEADERS_[k]);
    if (idx >= 0) rowVals[idx] = formatWorkUiFlagValue_(value[k]);
  });
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
  const idxAlias = findWorkAliasColumnIndex_(headers);

  return data.slice(1).filter(r => idxName >= 0 && String(r[idxName] || '').trim()).map(r => {
    const cropStr = idxCrop >= 0 ? String(r[idxCrop] || '').trim() : '';
    const crops = cropStr ? cropStr.split(/[,、]/).map(s => s.trim()).filter(Boolean) : [];
    const aliasStr = idxAlias >= 0 ? String(r[idxAlias] || '').trim() : '';
    const aliases = aliasStr ? aliasStr.split(/[,、\n]/).map(s => s.trim()).filter(Boolean) : [];
    let cropDetails = null;
    if (idxCropDetails >= 0 && r[idxCropDetails]) {
      try {
        cropDetails = JSON.parse(r[idxCropDetails]);
      } catch(e) {
        cropDetails = null;
      }
    }
    const uiFlags = readWorkMasterUiFlagsFromRow_(headers, r);
    return {
      name: String(r[idxName] || '').trim(),
      category: idxCategory >= 0 ? (String(r[idxCategory] || '').trim() || '圃場作業') : '圃場作業',
      cropName: cropStr,
      crops: crops,
      cropDetails: cropDetails,
      detailWorks: idxDetail >= 0 && r[idxDetail] ? String(r[idxDetail]).trim() : '',
      aliasNames: aliasStr,
      aliases: aliases,
      showMachine: uiFlags.showMachine,
      showMaterial: uiFlags.showMaterial,
      showPesticide: uiFlags.showPesticide
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

/** 作業マスタの類似作業名（別名）列を解決 */
function findWorkAliasColumnIndex_(headers) {
  const candidates = ['類似作業名', '別名', '類似名', 'エイリアス', '類似作業', '別称'];
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
  const aliasNames = value.aliasNames != null ? String(value.aliasNames).trim() : (Array.isArray(value.aliases) ? value.aliases.join(', ') : "");
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
    '類似作業名': aliasNames,
    '別名': aliasNames,
    '類似名': aliasNames,
    'エイリアス': aliasNames,
    '詳細': details,
    '詳細作業（カンマ区切り）': details,
    '作物別詳細作業': cd,
    '使用農機を出す': Object.prototype.hasOwnProperty.call(value || {}, 'showMachine') ? formatWorkUiFlagValue_(value.showMachine) : undefined,
    '農機を出す': Object.prototype.hasOwnProperty.call(value || {}, 'showMachine') ? formatWorkUiFlagValue_(value.showMachine) : undefined,
    '使用資材を出す': Object.prototype.hasOwnProperty.call(value || {}, 'showMaterial') ? formatWorkUiFlagValue_(value.showMaterial) : undefined,
    '資材を出す': Object.prototype.hasOwnProperty.call(value || {}, 'showMaterial') ? formatWorkUiFlagValue_(value.showMaterial) : undefined,
    '使用薬剤を出す': Object.prototype.hasOwnProperty.call(value || {}, 'showPesticide') ? formatWorkUiFlagValue_(value.showPesticide) : undefined,
    '薬剤を出す': Object.prototype.hasOwnProperty.call(value || {}, 'showPesticide') ? formatWorkUiFlagValue_(value.showPesticide) : undefined,
    '農薬を出す': Object.prototype.hasOwnProperty.call(value || {}, 'showPesticide') ? formatWorkUiFlagValue_(value.showPesticide) : undefined
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
  const name = String(statusName || '').trim();
  if (!name) return statusName;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][2] || '').trim() === name) {
      return name;
    }
  }
  let emptyRow = 2;
  while (emptyRow <= data.length && (data[emptyRow-1] && data[emptyRow-1][2])) emptyRow++;
  sheet.getRange(emptyRow, 3).setValue(name);
  return name;
}

function editFieldStatusInMaster(oldStatusName, newStatusName) {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('圃場設定マスタ');
  const oldName = String(oldStatusName || '').trim();
  const newName = String(newStatusName || '').trim();
  if (!oldName || !newName) return newName;

  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2] || '').trim() === oldName) {
        sheet.getRange(i + 1, 3).setValue(newName);
        break;
      }
    }
  }

  try {
    const hojoSheet = ss.getSheetByName('圃場マスタ');
    if (hojoSheet && hojoSheet.getLastRow() > 1) {
      const hData = hojoSheet.getRange(2, 11, hojoSheet.getLastRow() - 1, 1).getValues();
      for (let j = 0; j < hData.length; j++) {
        if (String(hData[j][0] || '').trim() === oldName) {
          hojoSheet.getRange(j + 2, 11).setValue(newName);
        }
      }
    }
  } catch (e) {
    console.warn('圃場マスタの稼働状況更新エラー:', e);
  }
  return newName;
}

function deleteFieldStatusFromMaster(statusName) {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('圃場設定マスタ');
  const targetName = String(statusName || '').trim();
  if (!targetName) return true;

  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2] || '').trim() === targetName) {
        sheet.getRange(i + 1, 3).clearContent();
        break;
      }
    }
  }
  return true;
}

/** 圃場設定マスタ（A:産地 / B:圃場条件 / C:稼働状況） */
function ensureFieldSettingMasterSheet_() {
  const ss = TENANT_SS;
  if (!ss) throw new Error('スプレッドシート未設定');
  let sheet = ss.getSheetByName('圃場設定マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('圃場設定マスタ');
    sheet.appendRow(['産地', '圃場条件', '稼働状況']);
    return sheet;
  }
  const lastCol = Math.max(sheet.getLastColumn(), 3);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  if (!headers[0]) sheet.getRange(1, 1).setValue('産地');
  if (!headers[1]) sheet.getRange(1, 2).setValue('圃場条件');
  if (!headers[2]) sheet.getRange(1, 3).setValue('稼働状況');
  return sheet;
}

function readFieldSettingColValues_(colIndex0) {
  const sheet = ensureFieldSettingMasterSheet_();
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const n = String(data[i][colIndex0] || '').trim();
    if (n && out.indexOf(n) < 0) out.push(n);
  }
  return out;
}

function appendFieldSettingColValue_(colIndex0, name) {
  const sheet = ensureFieldSettingMasterSheet_();
  const data = sheet.getDataRange().getValues();
  const col = colIndex0 + 1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex0] || '').trim() === name) return name;
  }
  let emptyRow = 2;
  while (emptyRow <= data.length && data[emptyRow - 1] && String(data[emptyRow - 1][colIndex0] || '').trim()) {
    emptyRow++;
  }
  sheet.getRange(emptyRow, col).setValue(name);
  return name;
}

function renameFieldSettingColValue_(colIndex0, oldName, newName) {
  const sheet = ensureFieldSettingMasterSheet_();
  const data = sheet.getDataRange().getValues();
  const col = colIndex0 + 1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex0] || '').trim() === oldName) {
      sheet.getRange(i + 1, col).setValue(newName);
      return true;
    }
  }
  return false;
}

function clearFieldSettingColValue_(colIndex0, name) {
  const sheet = ensureFieldSettingMasterSheet_();
  const data = sheet.getDataRange().getValues();
  const col = colIndex0 + 1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex0] || '').trim() === name) {
      sheet.getRange(i + 1, col).clearContent();
      return true;
    }
  }
  return false;
}

function getFieldConditionsList_() {
  const list = readFieldSettingColValues_(1);
  return list.length ? list : ['露地', 'ハウス'];
}

function getClimateMasterColList_() {
  const defaults = ['暖地', '温暖地', '一般地', '高冷地'];
  let list = readFieldSettingColValues_(0);
  if (!list.length) {
    defaults.forEach(n => appendFieldSettingColValue_(0, n));
    return defaults.slice();
  }
  return list;
}

function getClimateMasterList_() {
  const list = getClimateMasterColList_().slice();
  // 拠点マスタにだけある産地も候補に含める
  try {
    const locs = readLocationMasterDetails_();
    locs.forEach(l => {
      parseLocationClimates_(l && (l.climates != null ? l.climates : l.climate)).forEach(c => {
        const n = String(c || '').trim();
        if (n && list.indexOf(n) < 0) list.push(n);
      });
    });
  } catch (e) {}
  return list;
}

function addFieldConditionToMaster(conditionName) {
  const name = String(conditionName || '').trim();
  if (!name) throw new Error('圃場条件名を入力してください');
  const existing = readFieldSettingColValues_(1);
  if (existing.indexOf(name) >= 0) throw new Error(`圃場条件「${name}」は既に登録されています`);
  appendFieldSettingColValue_(1, name);
  return getFieldConditionsList_();
}

function editFieldConditionInMaster(oldConditionName, newConditionName) {
  const oldName = String(oldConditionName || '').trim();
  const newName = String(newConditionName || '').trim();
  if (!oldName || !newName) throw new Error('圃場条件名を入力してください');
  if (oldName !== newName) {
    const existing = readFieldSettingColValues_(1);
    if (existing.indexOf(newName) >= 0) throw new Error(`圃場条件「${newName}」は既に登録されています`);
  }
  if (!renameFieldSettingColValue_(1, oldName, newName)) {
    appendFieldSettingColValue_(1, newName);
  }
  // 圃場マスタの条件列(D)も置換
  try {
    const ss = TENANT_SS;
    const hojoSheet = ss.getSheetByName('圃場マスタ');
    if (hojoSheet && hojoSheet.getLastRow() > 1) {
      const hData = hojoSheet.getRange(2, 4, hojoSheet.getLastRow() - 1, 1).getValues();
      for (let j = 0; j < hData.length; j++) {
        if (String(hData[j][0] || '').trim() === oldName) {
          hojoSheet.getRange(j + 2, 4).setValue(newName);
        }
      }
    }
  } catch (e) {
    console.warn('圃場マスタの圃場条件更新エラー:', e);
  }
  return getFieldConditionsList_();
}

function deleteFieldConditionFromMaster(conditionName) {
  const name = String(conditionName || '').trim();
  if (!name) throw new Error('圃場条件名を指定してください');
  clearFieldSettingColValue_(1, name);
  return getFieldConditionsList_();
}

function rewriteLocationClimateColumn_(transformFn) {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('拠点マスタ');
  if (!sheet || sheet.getLastRow() < 2) return;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  const headers = (data[0] || []).map(h => String(h || '').trim());
  const climIdx = headers.indexOf('産地');
  if (climIdx < 0) return;
  const out = [];
  let changed = false;
  for (let i = 1; i < data.length; i++) {
    const prevList = parseLocationClimates_(data[i][climIdx]);
    const nextList = transformFn(prevList.slice());
    const prevStr = formatLocationClimates_(prevList);
    const nextStr = formatLocationClimates_(nextList);
    if (prevStr !== nextStr) changed = true;
    out.push([nextStr]);
  }
  if (changed && out.length) {
    sheet.getRange(2, climIdx + 1, data.length, climIdx + 1).setValues(out);
  }
}

function renameClimateInLocationMaster_(oldName, newName) {
  rewriteLocationClimateColumn_(function (list) {
    return list.map(function (c) {
      return c === oldName ? newName : c;
    }).filter(function (c, idx, arr) {
      return c && arr.indexOf(c) === idx;
    });
  });
}

function removeClimateFromLocationMaster_(climateName) {
  rewriteLocationClimateColumn_(function (list) {
    return list.filter(function (c) {
      return c !== climateName;
    });
  });
}

function addClimateToMaster(climateName) {
  const name = String(climateName || '').trim();
  if (!name) throw new Error('産地名を入力してください');
  const existing = getClimateMasterColList_();
  if (existing.indexOf(name) >= 0) throw new Error(`産地「${name}」は既に登録されています`);
  appendFieldSettingColValue_(0, name);
  return getClimateMasterColList_();
}

function editClimateInMaster(oldClimateName, newClimateName) {
  const oldName = String(oldClimateName || '').trim();
  const newName = String(newClimateName || '').trim();
  if (!oldName || !newName) throw new Error('産地名を入力してください');
  if (oldName !== newName) {
    const existing = getClimateMasterColList_();
    if (existing.indexOf(newName) >= 0) throw new Error(`産地「${newName}」は既に登録されています`);
  }
  if (!renameFieldSettingColValue_(0, oldName, newName)) {
    appendFieldSettingColValue_(0, newName);
  }
  if (oldName !== newName) renameClimateInLocationMaster_(oldName, newName);
  return getClimateMasterColList_();
}

function deleteClimateFromMaster(climateName) {
  const name = String(climateName || '').trim();
  if (!name) throw new Error('産地名を指定してください');
  clearFieldSettingColValue_(0, name);
  removeClimateFromLocationMaster_(name);
  return getClimateMasterColList_();
}

function addCropToMaster(cropData) {
  const name = String((cropData && cropData.name) || '').trim();
  if (!name) throw new Error('作物名を入力してください');
  const density = Number((cropData && cropData.density) || 0) || 0;
  const tagAbbreviation = String((cropData && cropData.tagAbbreviation) || '').trim();
  manageMasterData('crop', 'add', { name: name, density: density, tagAbbreviation: tagAbbreviation }, 'system');
  return { name: name, density: density, tagAbbreviation: tagAbbreviation };
}
function deleteCropFromMaster(cropName) {
  const name = String(cropName || '').trim();
  if (!name) throw new Error('作物名を指定してください');
  manageMasterData('crop', 'delete', { name: name }, 'system');
  return name;
}

/** 作物マスタ（作物名・栽植密度・色・タグ略称） */
function ensureCropMasterSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('作物マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('作物マスタ');
    sheet.appendRow(['作物名', '栽植密度', '色', 'タグ略称']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#e0e0e0');
    return sheet;
  }
  const headers = ['作物名', '栽植密度', '色', 'タグ略称'];
  headers.forEach((h, i) => {
    const cur = String(sheet.getRange(1, i + 1).getValue() || '').trim();
    if (cur !== h) {
      sheet.getRange(1, i + 1).setValue(h).setFontWeight('bold').setBackground('#e0e0e0');
    }
  });
  return sheet;
}

/** 作物名 → タグ用略称（未設定時は作物名） */
function readCropTagAbbreviationMap_() {
  const map = {};
  try {
    const sheet = ensureCropMasterSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return map;
    const data = sheet.getRange(2, 1, last - 1, 4).getValues();
    data.forEach(row => {
      const name = String(row[0] || '').trim();
      if (!name) return;
      const abbr = String(row[3] || '').trim();
      map[name] = abbr || name;
    });
  } catch (e) {
    console.warn('作物タグ略称の読込に失敗:', e);
  }
  return map;
}

function normalizeTagAbbreviation_(s) {
  let t = String(s || '').trim();
  try { t = t.normalize('NFKC'); } catch (e) {}
  return t.toLowerCase();
}

/**
 * 作物・拠点を横断してタグ略称の重複を禁止する。
 * excludeCropName / excludeLocationName は自分自身（編集中）を除外。
 */
function assertTagAbbreviationUnique_(code, options) {
  const opts = options || {};
  const raw = String(code || '').trim();
  const n = normalizeTagAbbreviation_(raw);
  if (!n) return;
  const excludeCrop = String(opts.excludeCropName || '').trim();
  const excludeLoc = String(opts.excludeLocationName || '').trim();

  const cropMap = readCropTagAbbreviationMap_();
  Object.keys(cropMap).forEach(name => {
    if (excludeCrop && name === excludeCrop) return;
    if (normalizeTagAbbreviation_(cropMap[name] || name) === n) {
      throw new Error('タグ略称「' + raw + '」は作物「' + name + '」で使用されています');
    }
  });

  (readLocationMasterDetails_() || []).forEach(loc => {
    if (!loc || !loc.name) return;
    if (excludeLoc && loc.name === excludeLoc) return;
    const other = String(loc.tagAbbreviation || loc.name || '').trim();
    if (normalizeTagAbbreviation_(other) === n) {
      throw new Error('タグ略称「' + raw + '」は拠点「' + loc.name + '」で使用されています');
    }
  });
}

/** 生育記録マスタ + 作物マスタを統合した作物リスト */
function readMergedCropMasterList_() {
  const ss = TENANT_SS;
  const map = {};
  let cropSheetTagMap = {};
  try {
    cropSheetTagMap = readCropTagAbbreviationMap_();
  } catch (e) {}
  for (let sheetName of ['作物マスタ', '生育記録マスタ']) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) continue;
    if (sheetName === '作物マスタ') ensureCropMasterSheet_();
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const n = String(data[i][0] || '').trim();
      if (!n) continue;
      const density = Number(data[i][1]) || 0;
      const color = String(data[i][2] || '').trim();
      const tagAbbreviation = (sheetName === '作物マスタ')
        ? String(data[i][3] || '').trim()
        : '';
      if (!map[n]) {
        map[n] = {
          name: n,
          density: density,
          color: color || '',
          tagAbbreviation: tagAbbreviation || cropSheetTagMap[n] || ''
        };
      } else {
        if (!map[n].density && density) map[n].density = density;
        if (!map[n].color && color) map[n].color = color;
        if (!map[n].tagAbbreviation && tagAbbreviation) map[n].tagAbbreviation = tagAbbreviation;
        if (!map[n].tagAbbreviation && cropSheetTagMap[n]) map[n].tagAbbreviation = cropSheetTagMap[n];
      }
    }
  }
  return Object.keys(map).sort((a, b) => a.localeCompare(b, 'ja')).map(k => map[k]);
}

/** コンテナ内容単位マスタ */
function ensureContentUnitMasterSheet_() {
  const ss = TENANT_SS || SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('データベースに接続できません');
  let sheet = ss.getSheetByName('コンテナ内容単位マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('コンテナ内容単位マスタ');
    sheet.appendRow(['単位名']);
    ['kg', 'g', '本', 'パック', '個', '束'].forEach(u => sheet.appendRow([u]));
    sheet.getRange(1, 1).setFontWeight('bold').setBackground('#e0e0e0');
  } else {
    const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    if (!headers[0]) sheet.getRange(1, 1).setValue('単位名').setFontWeight('bold').setBackground('#e0e0e0');
  }
  return sheet;
}

/**
 * 内容単位一覧。シート＋（任意）コンテナマスタの既存単位をマージ
 * @param {Array=} containersOpt
 */
function getContentUnitMasterList_(containersOpt) {
  let list = [];
  try {
    const sheet = ensureContentUnitMasterSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const u = String(data[i][0] || '').trim();
      if (u) list.push(u);
    }
  } catch (e) {
    console.warn('内容単位マスタ読込スキップ', e);
  }
  try {
    const containers = containersOpt || readContainerMasterList_();
    (containers || []).forEach(c => {
      const u = String((c && c.contentUnit) || '').trim();
      if (u) list.push(u);
    });
  } catch (e2) {}
  list = Array.from(new Set(list));
  if (!list.length) list = ['kg', 'g', '本', 'パック', '個', '束'];
  return list;
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

// ========== 農薬マスタ ==========
const PESTICIDE_MASTER_HEADERS_ = [
  'ID', '農薬名', '有効成分', '内容量', '製造メーカー', '作物名',
  '希釈倍率', '散布後日数', '使用時期原文', '登録番号', '備考'
];

function ensurePesticideMasterSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('農薬マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('農薬マスタ');
    sheet.appendRow(PESTICIDE_MASTER_HEADERS_.slice());
    sheet.getRange(1, 1, 1, PESTICIDE_MASTER_HEADERS_.length).setFontWeight('bold');
    return sheet;
  }
  const needCols = Math.max(sheet.getLastColumn(), PESTICIDE_MASTER_HEADERS_.length);
  const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
  PESTICIDE_MASTER_HEADERS_.forEach((h, idx) => {
    if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
  });
  return sheet;
}

function normalizePesticideMasterItem_(raw) {
  const v = (raw && typeof raw === 'object') ? raw : {};
  let phi = v.phiDays;
  if (phi === '' || phi == null) phi = '';
  else {
    const n = parseInt(String(phi).replace(/[^\d\-]/g, ''), 10);
    phi = isNaN(n) ? '' : n;
  }
  return {
    name: String(v.name || v.農薬名 || '').trim(),
    activeIngredient: String(v.activeIngredient || v.有効成分 || '').trim(),
    volume: String(v.volume || v.内容量 || '').trim(),
    manufacturer: String(v.manufacturer || v.製造メーカー || '').trim(),
    cropName: String(v.cropName || v.作物名 || '').trim(),
    dilution: String(v.dilution || v.希釈倍率 || '').trim(),
    phiDays: phi,
    useTimingText: String(v.useTimingText || v.使用時期原文 || '').trim(),
    regNumber: String(v.regNumber || v.登録番号 || '').trim(),
    note: String(v.note || v.備考 || '').trim()
  };
}

function appendPesticideMasterRow_(sheet, rowObj) {
  const id = 'PEST-' + Utilities.getUuid().substring(0, 8);
  sheet.appendRow([
    id,
    rowObj.name || '',
    rowObj.activeIngredient || '',
    rowObj.volume || '',
    rowObj.manufacturer || '',
    rowObj.cropName || '',
    rowObj.dilution || '',
    rowObj.phiDays === '' || rowObj.phiDays == null ? '' : rowObj.phiDays,
    rowObj.useTimingText || '',
    rowObj.regNumber || '',
    rowObj.note || ''
  ]);
  return id;
}

function readPesticideMasterList_() {
  const sheet = ensurePesticideMasterSheet_();
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    const name = String(data[i][1] || '').trim();
    if (!id && !name) continue;
    list.push({
      id: id,
      name: name,
      activeIngredient: String(data[i][2] || '').trim(),
      volume: String(data[i][3] || '').trim(),
      manufacturer: String(data[i][4] || '').trim(),
      cropName: String(data[i][5] || '').trim(),
      dilution: String(data[i][6] || '').trim(),
      phiDays: (data[i][7] === '' || data[i][7] == null) ? '' : data[i][7],
      useTimingText: String(data[i][8] || '').trim(),
      regNumber: String(data[i][9] || '').trim(),
      note: String(data[i][10] || '').trim()
    });
  }
  list.sort((a, b) => {
    const n = String(a.name).localeCompare(String(b.name), 'ja');
    return n !== 0 ? n : String(a.cropName).localeCompare(String(b.cropName), 'ja');
  });
  return list;
}

/**
 * FAMIC取込（ブラウザで突合・選択した行を追記）
 * 重複キー: 登録番号 + 作物名 + 希釈倍率（登録番号が空なら農薬名+作物名+希釈）
 */
function importPesticideMasterRows(params) {
  const userName = String((params && params.userName) || '').trim();
  const rows = (params && params.rows) || [];
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('取り込む行がありません');
  }
  if (rows.length > 500) {
    throw new Error('一度に取り込めるのは500件までです。絞り込んでから再度お試しください。');
  }
  const sheet = ensurePesticideMasterSheet_();
  const existing = readPesticideMasterList_();
  const seen = {};
  existing.forEach(e => {
    const key = pesticideDedupKey_(e);
    if (key) seen[key] = true;
  });

  let added = 0;
  let skipped = 0;
  rows.forEach(raw => {
    const item = normalizePesticideMasterItem_(raw);
    if (!item.name) {
      skipped++;
      return;
    }
    const key = pesticideDedupKey_(item);
    if (key && seen[key]) {
      skipped++;
      return;
    }
    appendPesticideMasterRow_(sheet, item);
    if (key) seen[key] = true;
    added++;
  });
  SpreadsheetApp.flush();
  writeLog(userName || 'system', '農薬マスタ取込', String(added) + '件追加', 'スキップ:' + skipped);
  return {
    success: true,
    added: added,
    skipped: skipped,
    pesticides: readPesticideMasterList_()
  };
}

function pesticideDedupKey_(e) {
  if (!e) return '';
  const reg = String(e.regNumber || '').trim();
  const name = String(e.name || '').trim();
  const crop = String(e.cropName || '').trim();
  const dil = String(e.dilution || '').trim();
  if (reg) return reg + '\t' + crop + '\t' + dil;
  if (name) return name + '\t' + crop + '\t' + dil;
  return '';
}

// ========== 肥料マスタ ==========
const FERTILIZER_MASTER_HEADERS_ = [
  'ID', '肥料名', '肥料種類', '窒素', 'りん酸', '加里',
  '保証成分', '内容量', '製造メーカー', '登録番号', '備考', '内容量単位'
];

function ensureFertilizerMasterSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('肥料マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('肥料マスタ');
    sheet.appendRow(FERTILIZER_MASTER_HEADERS_.slice());
    sheet.getRange(1, 1, 1, FERTILIZER_MASTER_HEADERS_.length).setFontWeight('bold');
    return sheet;
  }
  const needCols = Math.max(sheet.getLastColumn(), FERTILIZER_MASTER_HEADERS_.length);
  const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
  FERTILIZER_MASTER_HEADERS_.forEach((h, idx) => {
    if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
  });
  return sheet;
}

function splitFertilizerVolume_(amountValue, unitValue) {
  let amount = String(amountValue == null ? '' : amountValue).trim();
  let unit = String(unitValue == null ? '' : unitValue).trim();
  if (!unit && amount) {
    const match = amount.match(/^([0-9０-９.,．，]+)\s*(.*)$/);
    if (match && match[2]) {
      amount = match[1].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/，/g, ',').replace(/．/g, '.');
      unit = match[2].trim();
    }
  }
  return { amount: amount, unit: unit, display: amount + unit };
}

function normalizeFertilizerMasterItem_(raw) {
  const v = (raw && typeof raw === 'object') ? raw : {};
  const volumeParts = splitFertilizerVolume_(
    v.volumeAmount != null ? v.volumeAmount : (v.contentAmount != null ? v.contentAmount : (v.volume || v.内容量 || '')),
    v.volumeUnit != null ? v.volumeUnit : (v.contentUnit != null ? v.contentUnit : (v.内容量単位 || ''))
  );
  return {
    name: String(v.name || v.肥料名 || '').trim(),
    fertilizerType: String(v.fertilizerType || v.肥料種類 || '').trim(),
    nitrogen: String(v.nitrogen || v.窒素 || v.N || '').trim(),
    phosphate: String(v.phosphate || v.りん酸 || v.リン酸 || v.P || '').trim(),
    potash: String(v.potash || v.加里 || v.カリ || v.K || '').trim(),
    components: String(v.components || v.保証成分 || '').trim(),
    volumeAmount: volumeParts.amount,
    volumeUnit: volumeParts.unit,
    volume: volumeParts.display,
    manufacturer: String(v.manufacturer || v.製造メーカー || v.業者名 || '').trim(),
    regNumber: String(v.regNumber || v.登録番号 || '').trim(),
    note: String(v.note || v.備考 || '').trim()
  };
}

function appendFertilizerMasterRow_(sheet, rowObj) {
  const id = 'FERT-' + Utilities.getUuid().substring(0, 8);
  sheet.appendRow([
    id,
    rowObj.name || '',
    rowObj.fertilizerType || '',
    rowObj.nitrogen || '',
    rowObj.phosphate || '',
    rowObj.potash || '',
    rowObj.components || '',
    rowObj.volumeAmount || '',
    rowObj.manufacturer || '',
    rowObj.regNumber || '',
    rowObj.note || '',
    rowObj.volumeUnit || ''
  ]);
  return id;
}

function readFertilizerMasterList_() {
  const sheet = ensureFertilizerMasterSheet_();
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    const name = String(data[i][1] || '').trim();
    if (!id && !name) continue;
    const volumeParts = splitFertilizerVolume_(data[i][7], data[i][11]);
    list.push({
      id: id,
      name: name,
      fertilizerType: String(data[i][2] || '').trim(),
      nitrogen: String(data[i][3] || '').trim(),
      phosphate: String(data[i][4] || '').trim(),
      potash: String(data[i][5] || '').trim(),
      components: String(data[i][6] || '').trim(),
      volumeAmount: volumeParts.amount,
      volumeUnit: volumeParts.unit,
      volume: volumeParts.display,
      manufacturer: String(data[i][8] || '').trim(),
      regNumber: String(data[i][9] || '').trim(),
      note: String(data[i][10] || '').trim()
    });
  }
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
  return list;
}

/**
 * 肥料登録銘柄CSV取込（ブラウザで選択した行を追記）
 * 重複キー: 登録番号（なければ肥料名+メーカー）
 */
function importFertilizerMasterRows(params) {
  const userName = String((params && params.userName) || '').trim();
  const rows = (params && params.rows) || [];
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('取り込む行がありません');
  }
  if (rows.length > 500) {
    throw new Error('一度に取り込めるのは500件までです。絞り込んでから再度お試しください。');
  }
  const sheet = ensureFertilizerMasterSheet_();
  const existing = readFertilizerMasterList_();
  const seen = {};
  existing.forEach(e => {
    const key = fertilizerDedupKey_(e);
    if (key) seen[key] = true;
  });

  let added = 0;
  let skipped = 0;
  rows.forEach(raw => {
    const item = normalizeFertilizerMasterItem_(raw);
    if (!item.name) {
      skipped++;
      return;
    }
    const key = fertilizerDedupKey_(item);
    if (key && seen[key]) {
      skipped++;
      return;
    }
    appendFertilizerMasterRow_(sheet, item);
    if (key) seen[key] = true;
    added++;
  });
  SpreadsheetApp.flush();
  writeLog(userName || 'system', '肥料マスタ取込', String(added) + '件追加', 'スキップ:' + skipped);
  return {
    success: true,
    added: added,
    skipped: skipped,
    fertilizers: readFertilizerMasterList_()
  };
}

function fertilizerDedupKey_(e) {
  if (!e) return '';
  const reg = String(e.regNumber || '').trim();
  if (reg) return 'R:' + reg;
  const name = String(e.name || '').trim();
  const maker = String(e.manufacturer || '').trim();
  if (name) return 'N:' + name + '\t' + maker;
  return '';
}

// ========== 肥料カタログ（公式CSVの保管庫 → 検索してマスタへ） ==========
const FERTILIZER_CATALOG_HEADERS_ = [
  '肥料名', '肥料種類', '窒素', 'りん酸', '加里',
  '保証成分', '製造メーカー', '登録番号'
];

function ensureFertilizerCatalogSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('肥料カタログ');
  if (!sheet) {
    sheet = ss.insertSheet('肥料カタログ');
    sheet.appendRow(FERTILIZER_CATALOG_HEADERS_.slice());
    sheet.getRange(1, 1, 1, FERTILIZER_CATALOG_HEADERS_.length).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), FERTILIZER_CATALOG_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    FERTILIZER_CATALOG_HEADERS_.forEach((h, idx) => {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function fertilizerCatalogRowValues_(item) {
  return [
    item.name || '',
    item.fertilizerType || '',
    item.nitrogen || '',
    item.phosphate || '',
    item.potash || '',
    item.components || '',
    item.manufacturer || '',
    item.regNumber || ''
  ];
}

function readFertilizerCatalogRow_(r) {
  return {
    name: String(r[0] || '').trim(),
    fertilizerType: String(r[1] || '').trim(),
    nitrogen: String(r[2] || '').trim(),
    phosphate: String(r[3] || '').trim(),
    potash: String(r[4] || '').trim(),
    components: String(r[5] || '').trim(),
    manufacturer: String(r[6] || '').trim(),
    regNumber: String(r[7] || '').trim(),
    volume: '',
    note: ''
  };
}

/** カタログへチャンク取込。clearFirst=true で先頭チャンク時に全置換 */
function importFertilizerCatalogChunk(params) {
  const rows = (params && params.rows) || [];
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('取り込む行がありません');
  }
  if (rows.length > 400) {
    throw new Error('1回あたり400件までにしてください');
  }
  const sheet = ensureFertilizerCatalogSheet_();
  const cols = FERTILIZER_CATALOG_HEADERS_.length;
  if (params && params.clearFirst) {
    const last = sheet.getLastRow();
    // getRange(row, column, numRows, numColumns) ※第3引数は行数
    if (last > 1) sheet.deleteRows(2, last - 1);
  }
  const values = [];
  rows.forEach(raw => {
    const item = normalizeFertilizerMasterItem_(raw);
    if (!item.name) return;
    values.push(fertilizerCatalogRowValues_(item));
  });
  if (values.length) {
    const start = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(start, 1, values.length, cols).setValues(values);
  }
  SpreadsheetApp.flush();
  return getFertilizerCatalogStats(params);
}

function getFertilizerCatalogStats(params) {
  const sheet = ensureFertilizerCatalogSheet_();
  const last = sheet.getLastRow();
  const count = Math.max(0, last - 1);
  return { success: true, count: count };
}

function searchFertilizerCatalog(params) {
  const q = String((params && params.q) || '').trim().toLowerCase();
  const maker = String((params && params.maker) || '').trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, parseInt((params && params.limit) || 50, 10) || 50));
  if (!q && !maker) {
    throw new Error('肥料名またはメーカーのキーワードを入力してください');
  }
  const sheet = ensureFertilizerCatalogSheet_();
  const last = sheet.getLastRow();
  if (last <= 1) {
    return { success: true, count: 0, totalCatalog: 0, items: [] };
  }
  const data = sheet.getRange(2, 1, last - 1, FERTILIZER_CATALOG_HEADERS_.length).getValues();
  const items = [];
  for (let i = 0; i < data.length; i++) {
    const item = readFertilizerCatalogRow_(data[i]);
    if (!item.name) continue;
    if (q && String(item.name).toLowerCase().indexOf(q) < 0
        && String(item.fertilizerType).toLowerCase().indexOf(q) < 0
        && String(item.regNumber).toLowerCase().indexOf(q) < 0) continue;
    if (maker && String(item.manufacturer).toLowerCase().indexOf(maker) < 0) continue;
    items.push(item);
    if (items.length >= limit) break;
  }
  return {
    success: true,
    count: items.length,
    totalCatalog: Math.max(0, last - 1),
    items: items,
    truncated: items.length >= limit
  };
}

// ========== 農薬カタログ ==========
const PESTICIDE_CATALOG_HEADERS_ = [
  '農薬名', '有効成分', '製造メーカー', '作物名',
  '希釈倍率', '散布後日数', '使用時期原文', '登録番号'
];

function ensurePesticideCatalogSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('農薬カタログ');
  if (!sheet) {
    sheet = ss.insertSheet('農薬カタログ');
    sheet.appendRow(PESTICIDE_CATALOG_HEADERS_.slice());
    sheet.getRange(1, 1, 1, PESTICIDE_CATALOG_HEADERS_.length).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), PESTICIDE_CATALOG_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    PESTICIDE_CATALOG_HEADERS_.forEach((h, idx) => {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function pesticideCatalogRowValues_(item) {
  return [
    item.name || '',
    item.activeIngredient || '',
    item.manufacturer || '',
    item.cropName || '',
    item.dilution || '',
    item.phiDays === '' || item.phiDays == null ? '' : item.phiDays,
    item.useTimingText || '',
    item.regNumber || ''
  ];
}

function readPesticideCatalogRow_(r) {
  return {
    name: String(r[0] || '').trim(),
    activeIngredient: String(r[1] || '').trim(),
    manufacturer: String(r[2] || '').trim(),
    cropName: String(r[3] || '').trim(),
    dilution: String(r[4] || '').trim(),
    phiDays: (r[5] === '' || r[5] == null) ? '' : r[5],
    useTimingText: String(r[6] || '').trim(),
    regNumber: String(r[7] || '').trim(),
    volume: '',
    note: ''
  };
}

function importPesticideCatalogChunk(params) {
  const rows = (params && params.rows) || [];
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error('取り込む行がありません');
  }
  if (rows.length > 400) {
    throw new Error('1回あたり400件までにしてください');
  }
  const sheet = ensurePesticideCatalogSheet_();
  const cols = PESTICIDE_CATALOG_HEADERS_.length;
  if (params && params.clearFirst) {
    const last = sheet.getLastRow();
    // getRange(row, column, numRows, numColumns) ※第3引数は行数
    if (last > 1) sheet.deleteRows(2, last - 1);
  }
  const values = [];
  rows.forEach(raw => {
    const item = normalizePesticideMasterItem_(raw);
    if (!item.name) return;
    values.push(pesticideCatalogRowValues_(item));
  });
  if (values.length) {
    const start = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(start, 1, values.length, cols).setValues(values);
  }
  SpreadsheetApp.flush();
  return getPesticideCatalogStats(params);
}

function getPesticideCatalogStats(params) {
  const sheet = ensurePesticideCatalogSheet_();
  const last = sheet.getLastRow();
  return { success: true, count: Math.max(0, last - 1) };
}

// ===== 品目別農薬・肥料設定（半旬） =====
const CROP_CHEM_PLAN_HEADERS_ = ['品目名', '設定JSON', '更新者', '更新日時'];
const CCP_PERIODS_ = ['上前', '上後', '中前', '中後', '下前', '下後'];

function ensureCropChemPlanSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('品目別農薬設定');
  if (!sheet) {
    sheet = ss.insertSheet('品目別農薬設定');
    sheet.appendRow(CROP_CHEM_PLAN_HEADERS_.slice());
    sheet.getRange(1, 1, 1, CROP_CHEM_PLAN_HEADERS_.length).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), CROP_CHEM_PLAN_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    CROP_CHEM_PLAN_HEADERS_.forEach((h, idx) => {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function normalizeCropChemPlanPayload_(cropName, entries, userName) {
  const name = String(cropName || '').trim();
  if (!name) throw new Error('品目名を指定してください');
  const list = Array.isArray(entries) ? entries : [];
  const normalized = [];
  list.forEach(raw => {
    if (!raw) return;
    const kind = String(raw.kind || '').trim() === 'fertilizer' ? 'fertilizer' : 'pesticide';
    const productId = String(raw.productId || '').trim();
    const productName = String(raw.productName || '').trim();
    if (!productId && !productName) return;
    let flats = [];
    if (Array.isArray(raw.flats)) {
      flats = raw.flats.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 0 && n < 72);
    } else if (Array.isArray(raw.periods)) {
      raw.periods.forEach(p => {
        const mi = parseInt(p.monthIndex != null ? p.monthIndex : ((p.month || 1) - 1), 10);
        const pi = parseInt(p.periodIndex != null ? p.periodIndex : 0, 10);
        if (!isNaN(mi) && mi >= 0 && mi < 12 && !isNaN(pi) && pi >= 0 && pi < 6) {
          flats.push(mi * 6 + pi);
        }
      });
    }
    flats = Array.from(new Set(flats)).sort((a, b) => a - b);
    if (!flats.length) return;
    normalized.push({
      id: String(raw.id || ('CCP-' + Utilities.getUuid().substring(0, 8))),
      kind: kind,
      productId: productId,
      productName: productName,
      dilution: String(raw.dilution || '').trim(),
      amount: String(raw.amount || '').trim(),
      note: String(raw.note || '').trim(),
      flats: flats
    });
  });
  return {
    cropName: name,
    entries: normalized,
    updatedBy: String(userName || '').trim(),
    updatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
  };
}

function listCropChemPlansBrief_() {
  const sheet = ensureCropChemPlanSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, 4).getValues();
  return values.map(r => {
    const cropName = String(r[0] || '').trim();
    let entryCount = 0;
    try {
      const parsed = JSON.parse(String(r[1] || '{}'));
      entryCount = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
    } catch (e) { entryCount = 0; }
    return {
      cropName: cropName,
      entryCount: entryCount,
      updatedBy: String(r[2] || '').trim(),
      updatedAt: String(r[3] || '').trim()
    };
  }).filter(x => x.cropName);
}

function listCropChemPlans(params) {
  return { success: true, plans: listCropChemPlansBrief_() };
}

function getCropChemPlan(params) {
  const cropName = String((params && params.cropName) || '').trim();
  if (!cropName) throw new Error('品目名を指定してください');
  const sheet = ensureCropChemPlanSheet_();
  const last = sheet.getLastRow();
  if (last < 2) {
    return { success: true, plan: { cropName: cropName, entries: [] } };
  }
  const values = sheet.getRange(2, 1, last - 1, 4).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === cropName) {
      let plan = { cropName: cropName, entries: [] };
      try {
        const parsed = JSON.parse(String(values[i][1] || '{}'));
        plan = normalizeCropChemPlanPayload_(cropName, parsed.entries || [], values[i][2]);
        plan.updatedAt = String(values[i][3] || '').trim();
      } catch (e) {
        plan = { cropName: cropName, entries: [] };
      }
      return { success: true, plan: plan };
    }
  }
  return { success: true, plan: { cropName: cropName, entries: [] } };
}

function saveCropChemPlan(params) {
  const uname = String((params && params.userName) || '').trim();
  if (uname !== 'system' && !checkAdminRole(uname)) {
    throw new Error('品目別農薬設定の変更は管理者のみ可能です');
  }
  const plan = normalizeCropChemPlanPayload_(
    params && params.cropName,
    params && params.entries,
    uname
  );
  const sheet = ensureCropChemPlanSheet_();
  const last = sheet.getLastRow();
  const json = JSON.stringify({ cropName: plan.cropName, entries: plan.entries });
  let foundRow = -1;
  if (last >= 2) {
    const names = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < names.length; i++) {
      if (String(names[i][0] || '').trim() === plan.cropName) {
        foundRow = i + 2;
        break;
      }
    }
  }
  if (foundRow > 0) {
    if (!plan.entries.length) {
      sheet.deleteRow(foundRow);
    } else {
      sheet.getRange(foundRow, 1, 1, 4).setValues([[plan.cropName, json, plan.updatedBy, plan.updatedAt]]);
    }
  } else if (plan.entries.length) {
    sheet.appendRow([plan.cropName, json, plan.updatedBy, plan.updatedAt]);
  }
  SpreadsheetApp.flush();
  return {
    success: true,
    plan: plan,
    plans: listCropChemPlansBrief_()
  };
}

function deleteCropChemPlan(params) {
  const uname = String((params && params.userName) || '').trim();
  if (uname !== 'system' && !checkAdminRole(uname)) {
    throw new Error('品目別農薬設定の変更は管理者のみ可能です');
  }
  const cropName = String((params && params.cropName) || '').trim();
  if (!cropName) throw new Error('品目名を指定してください');
  const sheet = ensureCropChemPlanSheet_();
  const last = sheet.getLastRow();
  if (last >= 2) {
    const names = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < names.length; i++) {
      if (String(names[i][0] || '').trim() === cropName) {
        sheet.deleteRow(i + 2);
        break;
      }
    }
  }
  SpreadsheetApp.flush();
  return { success: true, plans: listCropChemPlansBrief_() };
}

// ===== 原価マスタ / 品目別原価設定 / 原価計算 =====
const COST_MASTER_HEADERS_ = [
  'ID', '品目名', 'カテゴリ', '規格', '単価', '単価単位', '用量基準', '標準用量', '備考', '更新日時'
];
const COST_ITEM_CATEGORIES_ = ['種', '資材', '機械', '燃料', '労務', '農薬', '肥料', 'その他'];
const COST_BASE_UNITS_ = ['area_a', 'tray', 'plant', 'yield_pack', 'fixed'];
const CROP_COST_PLAN_HEADERS_ = ['品目名', '設定JSON', '更新者', '更新日時'];

function ensureCostMasterSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('原価マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('原価マスタ');
    sheet.appendRow(COST_MASTER_HEADERS_.slice());
    sheet.getRange(1, 1, 1, COST_MASTER_HEADERS_.length).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), COST_MASTER_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    COST_MASTER_HEADERS_.forEach((h, idx) => {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function normalizeCostMasterItem_(raw) {
  const name = String((raw && (raw.name || raw.品目名)) || '').trim();
  if (!name) throw new Error('品目名を入力してください');
  let category = String((raw && (raw.category || raw.カテゴリ)) || 'その他').trim();
  if (COST_ITEM_CATEGORIES_.indexOf(category) < 0) category = 'その他';
  let base = String((raw && (raw.base || raw.用量基準)) || 'fixed').trim();
  if (COST_BASE_UNITS_.indexOf(base) < 0) base = 'fixed';
  const unitPrice = Number((raw && (raw.unitPrice != null ? raw.unitPrice : raw.単価)) || 0);
  const defaultQty = (raw && (raw.defaultQty != null ? raw.defaultQty : raw.標準用量));
  return {
    id: String((raw && raw.id) || ('COST-' + Utilities.getUuid().substring(0, 8))).trim(),
    name: name,
    category: category,
    spec: String((raw && (raw.spec || raw.規格)) || '').trim(),
    unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
    priceUnit: String((raw && (raw.priceUnit || raw.単価単位)) || '円').trim() || '円',
    base: base,
    defaultQty: (defaultQty === '' || defaultQty == null) ? '' : Number(defaultQty),
    note: String((raw && (raw.note || raw.備考)) || '').trim(),
    updatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
  };
}

function costMasterRowFromItem_(item) {
  return [
    item.id,
    item.name,
    item.category,
    item.spec,
    item.unitPrice,
    item.priceUnit,
    item.base,
    item.defaultQty === '' || item.defaultQty == null ? '' : item.defaultQty,
    item.note,
    item.updatedAt
  ];
}

function readCostMasterList_() {
  const sheet = ensureCostMasterSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, COST_MASTER_HEADERS_.length).getValues();
  return values.map(r => {
    if (!r[0] && !r[1]) return null;
    try {
      return normalizeCostMasterItem_({
        id: r[0],
        name: r[1],
        category: r[2],
        spec: r[3],
        unitPrice: r[4],
        priceUnit: r[5],
        base: r[6],
        defaultQty: r[7],
        note: r[8],
        updatedAt: r[9]
      });
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

function manageCostMaster_(manageAction, value, userName) {
  const uname = String(userName || '').trim();
  if (uname !== 'system' && !checkAdminRole(uname)) {
    throw new Error('原価マスタの変更は管理者のみ可能です');
  }
  const sheet = ensureCostMasterSheet_();
  if (manageAction === 'add') {
    const item = normalizeCostMasterItem_(value || {});
    sheet.appendRow(costMasterRowFromItem_(item));
    SpreadsheetApp.flush();
    return readCostMasterList_();
  }
  if (manageAction === 'edit') {
    const id = String((value && value.id) || '').trim();
    if (!id) throw new Error('IDがありません');
    const merged = Object.assign({}, (value && value.newData) || value || {}, { id: id });
    const item = normalizeCostMasterItem_(merged);
    item.id = id;
    const last = sheet.getLastRow();
    if (last < 2) throw new Error('対象が見つかりません');
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    let found = -1;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim() === id) { found = i + 2; break; }
    }
    if (found < 0) throw new Error('対象が見つかりません');
    sheet.getRange(found, 1, 1, COST_MASTER_HEADERS_.length).setValues([costMasterRowFromItem_(item)]);
    SpreadsheetApp.flush();
    return readCostMasterList_();
  }
  if (manageAction === 'delete') {
    const id = String((value && value.id) || value || '').trim();
    if (!id) throw new Error('削除対象がありません');
    const last = sheet.getLastRow();
    if (last < 2) return readCostMasterList_();
    const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0] || '').trim() === id) sheet.deleteRow(i + 2);
    }
    SpreadsheetApp.flush();
    return readCostMasterList_();
  }
  throw new Error('不明な操作です: ' + manageAction);
}

function ensureCropCostPlanSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('品目別原価設定');
  if (!sheet) {
    sheet = ss.insertSheet('品目別原価設定');
    sheet.appendRow(CROP_COST_PLAN_HEADERS_.slice());
    sheet.getRange(1, 1, 1, CROP_COST_PLAN_HEADERS_.length).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), CROP_COST_PLAN_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    CROP_COST_PLAN_HEADERS_.forEach((h, idx) => {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function normalizeCropCostPlanPayload_(cropName, entries, userName, extra) {
  const name = String(cropName || '').trim();
  if (!name) throw new Error('品目名を指定してください');
  const list = Array.isArray(entries) ? entries : [];
  const normalized = [];
  list.forEach(raw => {
    if (!raw) return;
    const costItemId = String(raw.costItemId || '').trim();
    const costItemName = String(raw.costItemName || raw.name || '').trim();
    if (!costItemId && !costItemName) return;
    let base = String(raw.base || 'fixed').trim();
    if (COST_BASE_UNITS_.indexOf(base) < 0) base = 'fixed';
    const qtyPerBase = Number(raw.qtyPerBase != null ? raw.qtyPerBase : (raw.defaultQty != null ? raw.defaultQty : 1));
    const unitPrice = Number(raw.unitPrice != null ? raw.unitPrice : 0);
    normalized.push({
      id: String(raw.id || ('CCE-' + Utilities.getUuid().substring(0, 8))),
      costItemId: costItemId,
      costItemName: costItemName,
      category: String(raw.category || '').trim(),
      qtyPerBase: isNaN(qtyPerBase) ? 1 : qtyPerBase,
      base: base,
      unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
      priceUnit: String(raw.priceUnit || '円').trim() || '円',
      note: String(raw.note || '').trim()
    });
  });
  const sellRaw = extra && (extra.sellPricePerPack != null ? extra.sellPricePerPack : extra.sellPrice);
  const sellPricePerPack = (sellRaw === '' || sellRaw == null) ? '' : Number(sellRaw);
  return {
    cropName: name,
    entries: normalized,
    sellPricePerPack: (sellPricePerPack === '' || isNaN(sellPricePerPack)) ? '' : sellPricePerPack,
    updatedBy: String(userName || '').trim(),
    updatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
  };
}

function listCropCostPlansBrief_() {
  const sheet = ensureCropCostPlanSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, 4).getValues();
  return values.map(r => {
    const cropName = String(r[0] || '').trim();
    let entryCount = 0;
    let sellPricePerPack = '';
    let entries = [];
    try {
      const parsed = JSON.parse(String(r[1] || '{}'));
      entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      entryCount = entries.length;
      const v = parsed.sellPricePerPack;
      sellPricePerPack = (v === '' || v == null || isNaN(Number(v))) ? '' : Number(v);
    } catch (e) { entryCount = 0; entries = []; }
    return {
      cropName: cropName,
      entryCount: entryCount,
      sellPricePerPack: sellPricePerPack,
      entries: entries,
      updatedBy: String(r[2] || '').trim(),
      updatedAt: String(r[3] || '').trim()
    };
  }).filter(x => x.cropName);
}

function listCropCostPlans(params) {
  return { success: true, plans: listCropCostPlansBrief_() };
}

function getCropCostPlan(params) {
  const cropName = String((params && params.cropName) || '').trim();
  if (!cropName) throw new Error('品目名を指定してください');
  const sheet = ensureCropCostPlanSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return { success: true, plan: { cropName: cropName, entries: [], sellPricePerPack: '' } };
  const values = sheet.getRange(2, 1, last - 1, 4).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === cropName) {
      let plan = { cropName: cropName, entries: [] };
      try {
        const parsed = JSON.parse(String(values[i][1] || '{}'));
        plan = normalizeCropCostPlanPayload_(cropName, parsed.entries || [], values[i][2], {
          sellPricePerPack: parsed.sellPricePerPack
        });
        plan.updatedAt = String(values[i][3] || '').trim();
      } catch (e) {
        plan = { cropName: cropName, entries: [], sellPricePerPack: '' };
      }
      return { success: true, plan: plan };
    }
  }
  return { success: true, plan: { cropName: cropName, entries: [], sellPricePerPack: '' } };
}

function saveCropCostPlan(params) {
  const uname = String((params && params.userName) || '').trim();
  if (uname !== 'system' && !checkAdminRole(uname)) {
    throw new Error('品目別原価設定の変更は管理者のみ可能です');
  }
  const plan = normalizeCropCostPlanPayload_(
    params && params.cropName,
    params && params.entries,
    uname,
    { sellPricePerPack: params && params.sellPricePerPack }
  );
  const sheet = ensureCropCostPlanSheet_();
  const last = sheet.getLastRow();
  const json = JSON.stringify({
    cropName: plan.cropName,
    entries: plan.entries,
    sellPricePerPack: plan.sellPricePerPack
  });
  let foundRow = -1;
  if (last >= 2) {
    const names = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < names.length; i++) {
      if (String(names[i][0] || '').trim() === plan.cropName) {
        foundRow = i + 2;
        break;
      }
    }
  }
  if (foundRow > 0) {
    if (!plan.entries.length && (plan.sellPricePerPack === '' || plan.sellPricePerPack == null)) {
      sheet.deleteRow(foundRow);
    } else {
      sheet.getRange(foundRow, 1, 1, 4).setValues([[plan.cropName, json, plan.updatedBy, plan.updatedAt]]);
    }
  } else if (plan.entries.length || (plan.sellPricePerPack !== '' && plan.sellPricePerPack != null)) {
    sheet.appendRow([plan.cropName, json, plan.updatedBy, plan.updatedAt]);
  }
  SpreadsheetApp.flush();
  return { success: true, plan: plan, plans: listCropCostPlansBrief_() };
}

function deleteCropCostPlan(params) {
  const uname = String((params && params.userName) || '').trim();
  if (uname !== 'system' && !checkAdminRole(uname)) {
    throw new Error('品目別原価設定の変更は管理者のみ可能です');
  }
  const cropName = String((params && params.cropName) || '').trim();
  if (!cropName) throw new Error('品目名を指定してください');
  const sheet = ensureCropCostPlanSheet_();
  const last = sheet.getLastRow();
  if (last >= 2) {
    const names = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = names.length - 1; i >= 0; i--) {
      if (String(names[i][0] || '').trim() === cropName) sheet.deleteRow(i + 2);
    }
  }
  SpreadsheetApp.flush();
  return { success: true, plans: listCropCostPlansBrief_() };
}

function calcCropCost(params) {
  const cropName = String((params && params.cropName) || '').trim();
  if (!cropName) throw new Error('作物名を指定してください');
  const areaA = Number((params && params.areaA) != null ? params.areaA : 0) || 0;
  const trays = Number((params && params.trays) != null ? params.trays : 0) || 0;
  const plants = Number((params && params.plants) != null ? params.plants : 0) || 0;
  const yieldPack = Number((params && (params.yield != null ? params.yield : params.yieldPack)) || 0) || 0;

  const planRes = getCropCostPlan({ cropName: cropName });
  const plan = planRes.plan || { cropName: cropName, entries: [] };
  const masterList = readCostMasterList_();
  const masterMap = {};
  masterList.forEach(m => { masterMap[m.id] = m; });

  const scaleOf = function(base) {
    if (base === 'area_a') return areaA;
    if (base === 'tray') return trays;
    if (base === 'plant') return plants;
    if (base === 'yield_pack') return yieldPack;
    return 1;
  };
  const baseLabel = function(base) {
    if (base === 'area_a') return 'aあたり';
    if (base === 'tray') return 'トレーあたり';
    if (base === 'plant') return '本あたり';
    if (base === 'yield_pack') return '出荷単位あたり';
    return '固定';
  };

  const lines = [];
  let total = 0;
  (plan.entries || []).forEach(e => {
    const m = e.costItemId ? masterMap[e.costItemId] : null;
    const unitPrice = m ? Number(m.unitPrice || 0) : Number(e.unitPrice || 0);
    const priceUnit = m ? m.priceUnit : (e.priceUnit || '円');
    const category = m ? m.category : (e.category || '');
    const name = m ? m.name : (e.costItemName || '');
    const base = e.base || (m && m.base) || 'fixed';
    const qtyPerBase = Number(e.qtyPerBase != null ? e.qtyPerBase : ((m && m.defaultQty !== '' && m.defaultQty != null) ? m.defaultQty : 1)) || 0;
    const scale = scaleOf(base);
    const qty = qtyPerBase * scale;
    const amount = qty * unitPrice;
    total += amount;
    lines.push({
      id: e.id,
      costItemId: e.costItemId || (m && m.id) || '',
      name: name,
      category: category,
      spec: m ? m.spec : '',
      qtyPerBase: qtyPerBase,
      base: base,
      baseLabel: baseLabel(base),
      scale: scale,
      qty: Math.round(qty * 1000) / 1000,
      unitPrice: unitPrice,
      priceUnit: priceUnit,
      amount: Math.round(amount),
      note: e.note || ''
    });
  });

  return {
    success: true,
    cropName: cropName,
    inputs: { areaA: areaA, trays: trays, plants: plants, yield: yieldPack },
    lines: lines,
    totalCost: Math.round(total),
    costPerA: areaA > 0 ? Math.round(total / areaA) : null,
    costPerPack: yieldPack > 0 ? Math.round(total / yieldPack) : null,
    entryCount: lines.length,
    sellPricePerPack: (plan.sellPricePerPack === '' || plan.sellPricePerPack == null)
      ? ''
      : Number(plan.sellPricePerPack),
    totalRevenue: (function() {
      const sp = Number(plan.sellPricePerPack);
      if (!yieldPack || isNaN(sp) || sp === '') return null;
      return Math.round(yieldPack * sp);
    })(),
    profit: (function() {
      const sp = Number(plan.sellPricePerPack);
      if (!yieldPack || isNaN(sp) || plan.sellPricePerPack === '' || plan.sellPricePerPack == null) return null;
      return Math.round(yieldPack * sp - total);
    })()
  };
}


// ===== 品目別作業設定（定植からの日数 → 半旬） =====
const CROP_WORK_PLAN_HEADERS_ = ['品目名', '設定JSON', '更新者', '更新日時'];
const CP_PERIOD_NAMES_ = ['上前', '上後', '中前', '中後', '下前', '下後'];

function ensureCropWorkPlanSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('品目別作業設定');
  if (!sheet) {
    sheet = ss.insertSheet('品目別作業設定');
    sheet.appendRow(CROP_WORK_PLAN_HEADERS_.slice());
    sheet.getRange(1, 1, 1, CROP_WORK_PLAN_HEADERS_.length).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), CROP_WORK_PLAN_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    CROP_WORK_PLAN_HEADERS_.forEach((h, idx) => {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function normalizeCropWorkTrigger_(raw) {
  const t = String((raw && (raw.trigger || raw.triggerType)) || '').trim().toLowerCase();
  if (t === 'period' || t === 'hanjun' || t === '半旬') return 'period';
  if (t === 'gdd' || t === '積算' || t === '積算温度') return 'gdd';
  if (t === 'sun' || t === 'sunshine' || t === '日射' || t === '日射量' || t === '積算日射') return 'sun';
  if (t === 'rain' || t === 'precip' || t === '降水' || t === '降水量' || t === '積算降水') return 'rain';
  return 'days';
}

function cropWorkNeedsWeather_(entries) {
  return (entries || []).some(function(e) {
    const t = normalizeCropWorkTrigger_(e);
    if (t === 'gdd' || t === 'sun' || t === 'rain') return true;
    const cancelMm = Number(e && e.rainCancelMm);
    const cancelDays = Number(e && e.rainCancelDays);
    return cancelMm > 0 && cancelDays > 0;
  });
}

function estimateDaysFromGdd_(gddTarget, gddBase) {
  const target = Number(gddTarget) || 0;
  if (target <= 0) return 0;
  const daily = 8; // 天気が取れないときの最後の目安
  return Math.max(1, Math.round(target / daily));
}

const DEFAULT_FARM_LATLNG_ = { lat: 33.91, lng: 134.66 };

function ymdAddDays_(ymd, n) {
  const p = String(ymd || '').split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + (Number(n) || 0));
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function ymdShiftYear_(ymd, delta) {
  const p = String(ymd || '').split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setFullYear(d.getFullYear() + (Number(delta) || 0));
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function minYmd_(a, b) {
  return String(a) <= String(b) ? a : b;
}

function maxYmd_(a, b) {
  return String(a) >= String(b) ? a : b;
}

function gddDayFromMinMax_(tmax, tmin, base) {
  const mean = (Number(tmax) + Number(tmin)) / 2;
  if (!isFinite(mean)) return null;
  return Math.max(0, mean - Number(base));
}

function parseCoordPoint_(pt) {
  if (!pt) return null;
  let lat;
  let lng;
  if (Array.isArray(pt)) {
    lat = Number(pt[0]);
    lng = Number(pt[1]);
  } else {
    lat = Number(pt.lat != null ? pt.lat : pt.latitude);
    lng = Number(pt.lng != null ? pt.lng : pt.longitude);
  }
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
    const swap = lat;
    lat = lng;
    lng = swap;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: lat, lng: lng };
}

function resolveFarmLatLng_(fieldIds, latHint, lngHint) {
  const hintLat = Number(latHint);
  const hintLng = Number(lngHint);
  const hintOk = isFinite(hintLat) && isFinite(hintLng)
    && Math.abs(hintLat) <= 90 && Math.abs(hintLng) <= 180
    && !(hintLat === 0 && hintLng === 0);
  try {
    const polygons = getSavedPolygons() || [];
    const idSet = {};
    (fieldIds || []).forEach(function(id) {
      const s = String(id || '').trim();
      if (!s) return;
      idSet[s] = true;
      const m = s.match(/^(.*)#une#/);
      if (m) idSet[m[1]] = true;
    });
    function centroidOf_(p) {
      const coords = p && p.coords;
      if (!coords || !coords.length) return null;
      let slat = 0;
      let slng = 0;
      let n = 0;
      for (let i = 0; i < coords.length; i++) {
        const pt = parseCoordPoint_(coords[i]);
        if (!pt) continue;
        slat += pt.lat;
        slng += pt.lng;
        n++;
      }
      if (!n) return null;
      return { lat: slat / n, lng: slng / n };
    }
    if (Object.keys(idSet).length) {
      for (let i = 0; i < polygons.length; i++) {
        const p = polygons[i];
        if (!p || !idSet[String(p.id)]) continue;
        const c = centroidOf_(p);
        if (c) return c;
      }
    }
    for (let i = 0; i < polygons.length; i++) {
      const p = polygons[i];
      if (!p || (p.coords && p.coords.length === 1)) continue;
      const c = centroidOf_(p);
      if (c) return c;
    }
  } catch (e) {}
  if (hintOk) return { lat: hintLat, lng: hintLng };
  return { lat: DEFAULT_FARM_LATLNG_.lat, lng: DEFAULT_FARM_LATLNG_.lng };
}

function parseOpenMeteoDailyWeather_(json) {
  const map = {};
  if (!json || !json.daily || !json.daily.time) return map;
  const times = json.daily.time;
  const tmax = json.daily.temperature_2m_max || [];
  const tmin = json.daily.temperature_2m_min || [];
  const rain = json.daily.precipitation_sum || [];
  const sun = json.daily.sunshine_duration || [];
  for (let i = 0; i < times.length; i++) {
    const x = Number(tmax[i]);
    const n = Number(tmin[i]);
    const r = Number(rain[i]);
    const s = Number(sun[i]);
    const row = {};
    if (isFinite(x) && isFinite(n)) {
      row.tmax = x;
      row.tmin = n;
    }
    if (isFinite(r)) row.rain = r;
    if (isFinite(s)) row.sunSec = s;
    if (Object.keys(row).length) map[times[i]] = row;
  }
  return map;
}

function parseOpenMeteoDailyTemps_(json) {
  return parseOpenMeteoDailyWeather_(json);
}

function fetchOpenMeteoWeatherMaps_(lat, lng, ranges) {
  const out = [];
  if (!ranges || !ranges.length) return out;
  const reqs = ranges.map(function(r) {
    const base = r.archive
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';
    return {
      url: base + '?latitude=' + encodeURIComponent(lat)
        + '&longitude=' + encodeURIComponent(lng)
        + '&start_date=' + encodeURIComponent(r.start)
        + '&end_date=' + encodeURIComponent(r.end)
        + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration&timezone=Asia%2FTokyo',
      muteHttpExceptions: true,
      followRedirects: true
    };
  });
  let resps = [];
  try {
    resps = UrlFetchApp.fetchAll(reqs);
  } catch (e) {
    return out;
  }
  for (let i = 0; i < resps.length; i++) {
    const item = { kind: ranges[i].kind, map: {} };
    try {
      if (resps[i].getResponseCode() === 200) {
        item.map = parseOpenMeteoDailyWeather_(JSON.parse(resps[i].getContentText()));
      }
    } catch (e2) {}
    out.push(item);
  }
  return out;
}

function fetchOpenMeteoTempMaps_(lat, lng, ranges) {
  return fetchOpenMeteoWeatherMaps_(lat, lng, ranges);
}

function buildCropWorkWeatherRanges_(plantYmd, horizonYmd, todayYmd) {
  const forecastStart = ymdAddDays_(todayYmd, -92);
  const forecastEnd = ymdAddDays_(todayYmd, 15);
  const ranges = [];
  if (plantYmd < forecastStart) {
    const archiveEnd = minYmd_(horizonYmd, ymdAddDays_(forecastStart, -1));
    if (plantYmd <= archiveEnd) {
      ranges.push({ start: plantYmd, end: archiveEnd, archive: true, kind: 'obs' });
    }
  }
  const fs = maxYmd_(plantYmd, forecastStart);
  const fe = minYmd_(horizonYmd, forecastEnd);
  if (fs <= fe) {
    ranges.push({ start: fs, end: fe, archive: false, kind: 'fc' });
  }
  const climStart = maxYmd_(plantYmd, ymdAddDays_(forecastEnd, 1));
  if (climStart <= horizonYmd) {
    ranges.push({
      start: ymdShiftYear_(climStart, -1),
      end: ymdShiftYear_(horizonYmd, -1),
      archive: true,
      kind: 'clim'
    });
  }
  return ranges;
}

function mergeOpenMeteoWeatherMaps_(fetchResults) {
  const weather = {};
  (fetchResults || []).forEach(function(item) {
    Object.keys(item.map || {}).forEach(function(ymd) {
      const key = item.kind === 'clim' ? ymdShiftYear_(ymd, 1) : ymd;
      const src = item.kind;
      const row = item.map[ymd] || {};
      if (!weather[key]) weather[key] = { src: src };
      else if (item.kind !== 'clim') weather[key].src = src;
      if (row.tmax != null && row.tmin != null) {
        weather[key].tmax = row.tmax;
        weather[key].tmin = row.tmin;
      }
      if (row.rain != null && (item.kind !== 'clim' || weather[key].rain == null)) {
        weather[key].rain = row.rain;
      }
      if (row.sunSec != null && (item.kind !== 'clim' || weather[key].sunSec == null)) {
        weather[key].sunSec = row.sunSec;
      }
    });
  });
  return weather;
}

/** 定植日から先の日別天気。過去=実測、直近〜16日=予報、それ以降=去年の同時期 */
function loadCropWorkWeatherSeries_(lat, lng, plantDate) {
  const plantYmd = formatYmd_(plantDate);
  const todayYmd = formatYmd_(new Date());
  const horizonYmd = ymdAddDays_(plantYmd, 400);
  const cacheKey = 'cwpW:' + Number(lat).toFixed(3) + ',' + Number(lng).toFixed(3)
    + ':' + plantYmd + ':' + todayYmd;
  try {
    const cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {}

  const ranges = buildCropWorkWeatherRanges_(plantYmd, horizonYmd, todayYmd);
  const weather = mergeOpenMeteoWeatherMaps_(fetchOpenMeteoWeatherMaps_(lat, lng, ranges));
  try {
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(weather), 21600);
  } catch (e) {}
  return weather;
}

function loadGddTempSeries_(lat, lng, plantDate) {
  return loadCropWorkWeatherSeries_(lat, lng, plantDate);
}

function gddSourceLabel_(srcCount) {
  const parts = [];
  if (srcCount.obs) parts.push('実測');
  if (srcCount.fc) parts.push('予報');
  if (srcCount.clim) parts.push('同時期');
  return parts.length ? parts.join('・') : '天気';
}

function estimateGddReach_(plantDate, gddTarget, gddBase, weather) {
  const target = Number(gddTarget) || 0;
  const base = (gddBase == null || isNaN(Number(gddBase))) ? 10 : Number(gddBase);
  const plant = new Date(plantDate.getTime());
  plant.setHours(0, 0, 0, 0);
  if (target <= 0) {
    return { date: plant, days: 0, dailyMean: 0, source: 'none', usedMeteo: false };
  }
  weather = weather || {};
  let acc = 0;
  let used = 0;
  let gddSum = 0;
  const srcCount = { obs: 0, fc: 0, clim: 0, fill: 0 };
  const cursor = new Date(plant.getTime());
  for (let i = 0; i < 400; i++) {
    const key = formatYmd_(cursor);
    const t = weather[key];
    let gdd = null;
    if (t && isFinite(Number(t.tmax)) && isFinite(Number(t.tmin))) {
      gdd = gddDayFromMinMax_(t.tmax, t.tmin, base);
      used++;
      gddSum += gdd;
      srcCount[t.src || 'obs'] = (srcCount[t.src || 'obs'] || 0) + 1;
    } else if (used > 0) {
      gdd = gddSum / used;
      srcCount.fill++;
    } else {
      gdd = 8;
      srcCount.fill++;
    }
    acc += gdd;
    if (acc >= target) {
      return {
        date: new Date(cursor.getTime()),
        days: i,
        dailyMean: used ? Math.round((gddSum / used) * 10) / 10 : Math.round(gdd * 10) / 10,
        source: used > 0 ? gddSourceLabel_(srcCount) : 'fallback',
        usedMeteo: used > 0,
        accumulated: Math.round(acc * 10) / 10
      };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const days = estimateDaysFromGdd_(target, base);
  const fb = new Date(plant.getTime());
  fb.setDate(fb.getDate() + days);
  return { date: fb, days: days, dailyMean: 8, source: 'fallback', usedMeteo: false };
}

function estimateSunReach_(plantDate, targetHours, weather) {
  const target = Number(targetHours) || 0;
  const plant = new Date(plantDate.getTime());
  plant.setHours(0, 0, 0, 0);
  if (target <= 0) {
    return { date: plant, days: 0, dailyMean: 0, source: 'none', usedMeteo: false };
  }
  weather = weather || {};
  let acc = 0;
  let used = 0;
  let sum = 0;
  const srcCount = { obs: 0, fc: 0, clim: 0, fill: 0 };
  const cursor = new Date(plant.getTime());
  for (let i = 0; i < 400; i++) {
    const key = formatYmd_(cursor);
    const w = weather[key];
    let hours = null;
    if (w && isFinite(Number(w.sunSec))) {
      hours = Number(w.sunSec) / 3600;
      used++;
      sum += hours;
      srcCount[w.src || 'obs'] = (srcCount[w.src || 'obs'] || 0) + 1;
    } else if (used > 0) {
      hours = sum / used;
      srcCount.fill++;
    } else {
      hours = 5;
      srcCount.fill++;
    }
    acc += hours;
    if (acc >= target) {
      return {
        date: new Date(cursor.getTime()),
        days: i,
        dailyMean: used ? Math.round((sum / used) * 10) / 10 : Math.round(hours * 10) / 10,
        source: used > 0 ? gddSourceLabel_(srcCount) : 'fallback',
        usedMeteo: used > 0,
        accumulated: Math.round(acc * 10) / 10
      };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const days = Math.max(1, Math.round(target / 5));
  const fb = new Date(plant.getTime());
  fb.setDate(fb.getDate() + days);
  return { date: fb, days: days, dailyMean: 5, source: 'fallback', usedMeteo: false };
}

function estimateRainReach_(plantDate, targetMm, weather) {
  const target = Number(targetMm) || 0;
  const plant = new Date(plantDate.getTime());
  plant.setHours(0, 0, 0, 0);
  if (target <= 0) {
    return { date: plant, days: 0, dailyMean: 0, source: 'none', usedMeteo: false };
  }
  weather = weather || {};
  let acc = 0;
  let used = 0;
  let sum = 0;
  const srcCount = { obs: 0, fc: 0, clim: 0, fill: 0 };
  const cursor = new Date(plant.getTime());
  for (let i = 0; i < 400; i++) {
    const key = formatYmd_(cursor);
    const w = weather[key];
    let rain = null;
    if (w && isFinite(Number(w.rain))) {
      rain = Number(w.rain);
      used++;
      sum += rain;
      srcCount[w.src || 'obs'] = (srcCount[w.src || 'obs'] || 0) + 1;
    } else if (used > 0) {
      rain = sum / used;
      srcCount.fill++;
    } else {
      rain = 3;
      srcCount.fill++;
    }
    acc += rain;
    if (acc >= target) {
      return {
        date: new Date(cursor.getTime()),
        days: i,
        dailyMean: used ? Math.round((sum / used) * 10) / 10 : Math.round(rain * 10) / 10,
        source: used > 0 ? gddSourceLabel_(srcCount) : 'fallback',
        usedMeteo: used > 0,
        accumulated: Math.round(acc * 10) / 10
      };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const days = Math.max(1, Math.round(target / 3));
  const fb = new Date(plant.getTime());
  fb.setDate(fb.getDate() + days);
  return { date: fb, days: days, dailyMean: 3, source: 'fallback', usedMeteo: false };
}

function sumRainInWindow_(plantDate, windowDays, weather) {
  const plant = new Date(plantDate.getTime());
  plant.setHours(0, 0, 0, 0);
  const days = Math.max(1, Number(windowDays) || 1);
  let sum = 0;
  let used = 0;
  const cursor = new Date(plant.getTime());
  for (let i = 0; i < days; i++) {
    const key = formatYmd_(cursor);
    const w = weather && weather[key];
    if (w && isFinite(Number(w.rain))) {
      sum += Number(w.rain);
      used++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { sum: Math.round(sum * 10) / 10, usedDays: used, windowDays: days };
}

function evaluateRainCancel_(entry, plantDate, geo) {
  const threshold = Number(entry && entry.rainCancelMm);
  const windowDays = Number(entry && entry.rainCancelDays);
  if (!(threshold > 0) || !(windowDays > 0)) {
    return { cancelled: false, accumulated: 0, threshold: threshold, windowDays: windowDays };
  }
  if (geo && geo.skipWeather) {
    return { cancelled: false, accumulated: 0, threshold: threshold, windowDays: windowDays, pending: true };
  }
  let weather = geo && geo.weather;
  if (!weather) {
    const loc = (geo && geo.lat != null && geo.lng != null)
      ? { lat: geo.lat, lng: geo.lng }
      : resolveFarmLatLng_(geo && geo.fieldIds, geo && geo.lat, geo && geo.lng);
    try {
      weather = loadCropWorkWeatherSeries_(loc.lat, loc.lng, plantDate);
    } catch (e) {
      weather = {};
    }
  }
  const rain = sumRainInWindow_(plantDate, windowDays, weather);
  const cancelled = rain.sum >= threshold;
  return {
    cancelled: cancelled,
    accumulated: rain.sum,
    threshold: threshold,
    windowDays: windowDays,
    usedDays: rain.usedDays,
    label: cancelled
      ? ('定植+' + windowDays + '日間で降水' + rain.sum + 'mm≥' + threshold + 'mm')
      : ('降水監視' + windowDays + '日/' + threshold + 'mm・現在' + rain.sum + 'mm')
  };
}

function resolveCropWorkGeoWeather_(geo, plantDate) {
  if (geo && geo.skipWeather) return geo.weather || {};
  if (geo && geo.weather) return geo.weather;
  const loc = (geo && geo.lat != null && geo.lng != null)
    ? { lat: geo.lat, lng: geo.lng }
    : resolveFarmLatLng_(geo && geo.fieldIds, geo && geo.lat, geo && geo.lng);
  try {
    return loadCropWorkWeatherSeries_(loc.lat, loc.lng, plantDate);
  } catch (e) {
    return {};
  }
}

function resolveCropWorkWindow_(entry, plantDate, geo) {
  const trigger = normalizeCropWorkTrigger_(entry);
  const duration = Math.max(1, Number(entry.durationDays) || 1);
  const plantBase = new Date(plantDate.getTime());
  plantBase.setHours(0, 0, 0, 0);
  let start = new Date(plantBase.getTime());
  let label = '';
  let meteoInfo = null;
  if (trigger === 'period') {
    const n = Number(entry.offsetPeriods != null ? entry.offsetPeriods : Math.round((Number(entry.offsetDays) || 0) / 5));
    const periods = isNaN(n) ? 0 : Math.round(n);
    start.setDate(start.getDate() + periods * 5);
    label = periods === 0 ? '定植当半旬' : ('定植+' + periods + '半旬');
  } else if (trigger === 'gdd') {
    const target = Number(entry.gddTarget) || 0;
    const base = (entry.gddBase == null || entry.gddBase === '') ? 10 : Number(entry.gddBase);
    const baseN = isNaN(base) ? 10 : base;
    let reach;
    if (geo && geo.skipWeather) {
      const days = estimateDaysFromGdd_(target, baseN);
      const d = new Date(start.getTime());
      d.setDate(d.getDate() + days);
      reach = { date: d, days: days, dailyMean: 8, source: 'fallback', usedMeteo: false };
    } else {
      const weather = resolveCropWorkGeoWeather_(geo, plantBase);
      reach = estimateGddReach_(plantBase, target, baseN, weather);
    }
    start = reach.date;
    start.setHours(0, 0, 0, 0);
    meteoInfo = reach;
    if (reach.usedMeteo) {
      label = '積算' + target + '℃（基準' + baseN + '℃・' + reach.source
        + ' +' + reach.days + '日・' + reach.dailyMean + '℃/日）';
    } else {
      label = '積算' + target + '℃（基準' + baseN + '℃・目安+' + reach.days + '日）';
    }
  } else if (trigger === 'sun') {
    const target = Number(entry.sunTargetHours) || 0;
    let reach;
    if (geo && geo.skipWeather) {
      const days = Math.max(1, Math.round(target / 5));
      const d = new Date(start.getTime());
      d.setDate(d.getDate() + days);
      reach = { date: d, days: days, dailyMean: 5, source: 'fallback', usedMeteo: false };
    } else {
      const weather = resolveCropWorkGeoWeather_(geo, plantBase);
      reach = estimateSunReach_(plantBase, target, weather);
    }
    start = reach.date;
    start.setHours(0, 0, 0, 0);
    meteoInfo = reach;
    if (reach.usedMeteo) {
      label = '積算日射' + target + 'h（' + reach.source + ' +' + reach.days + '日・'
        + reach.dailyMean + 'h/日）';
    } else {
      label = '積算日射' + target + 'h（目安+' + reach.days + '日）';
    }
  } else if (trigger === 'rain') {
    const target = Number(entry.rainTargetMm) || 0;
    let reach;
    if (geo && geo.skipWeather) {
      const days = Math.max(1, Math.round(target / 3));
      const d = new Date(start.getTime());
      d.setDate(d.getDate() + days);
      reach = { date: d, days: days, dailyMean: 3, source: 'fallback', usedMeteo: false };
    } else {
      const weather = resolveCropWorkGeoWeather_(geo, plantBase);
      reach = estimateRainReach_(plantBase, target, weather);
    }
    start = reach.date;
    start.setHours(0, 0, 0, 0);
    meteoInfo = reach;
    if (reach.usedMeteo) {
      label = '積算降水' + target + 'mm（' + reach.source + ' +' + reach.days + '日・'
        + reach.dailyMean + 'mm/日）';
    } else {
      label = '積算降水' + target + 'mm（目安+' + reach.days + '日）';
    }
  } else {
    const n = Number(entry.offsetDays) || 0;
    const days = isNaN(n) ? 0 : Math.round(n);
    start.setDate(start.getDate() + days);
    label = days === 0 ? '定植当日' : (days > 0 ? '定植+' + days + '日' : '定植' + days + '日');
  }
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + duration - 1);
  const cancelInfo = evaluateRainCancel_(entry, plantBase, geo);
  let cancelled = !!(cancelInfo && cancelInfo.cancelled);
  if (cancelInfo && cancelInfo.label) {
    label = label + '／' + cancelInfo.label;
  }
  return {
    start: start,
    end: end,
    label: label,
    trigger: trigger,
    gddInfo: meteoInfo,
    meteoInfo: meteoInfo,
    cancelInfo: cancelInfo,
    cancelled: cancelled
  };
}

function normalizeCropWorkPlanPayload_(cropName, entries, userName) {
  const name = String(cropName || '').trim();
  if (!name) throw new Error('品目名を指定してください');
  const list = Array.isArray(entries) ? entries : [];
  const normalized = [];
  list.forEach(raw => {
    if (!raw) return;
    const workName = String(raw.workName || raw.name || '').trim();
    if (!workName) return;
    const trigger = normalizeCropWorkTrigger_(raw);
    const offsetDays = Number(raw.offsetDays != null ? raw.offsetDays : 0);
    const offsetPeriods = Number(raw.offsetPeriods != null ? raw.offsetPeriods : '');
    const durationDays = Number(raw.durationDays != null ? raw.durationDays : 1);
    const gddTarget = Number(raw.gddTarget != null ? raw.gddTarget : 0);
    const gddBase = (raw.gddBase == null || raw.gddBase === '') ? 10 : Number(raw.gddBase);
    const sunTargetHours = Number(raw.sunTargetHours != null ? raw.sunTargetHours : 0);
    const rainTargetMm = Number(raw.rainTargetMm != null ? raw.rainTargetMm : 0);
    const rainCancelMm = Number(raw.rainCancelMm != null ? raw.rainCancelMm : 0);
    const rainCancelDays = Number(raw.rainCancelDays != null ? raw.rainCancelDays : 0);
    normalized.push({
      id: String(raw.id || ('CWP-' + Utilities.getUuid().substring(0, 8))),
      workName: workName,
      trigger: trigger,
      offsetDays: isNaN(offsetDays) ? 0 : Math.round(offsetDays),
      offsetPeriods: isNaN(offsetPeriods) ? (trigger === 'period' ? 0 : '') : Math.round(offsetPeriods),
      durationDays: (isNaN(durationDays) || durationDays < 1) ? 1 : Math.round(durationDays),
      gddTarget: (isNaN(gddTarget) || gddTarget < 0) ? 0 : Math.round(gddTarget),
      gddBase: (isNaN(gddBase) || gddBase < 0) ? 10 : Math.round(gddBase * 10) / 10,
      sunTargetHours: (isNaN(sunTargetHours) || sunTargetHours < 0) ? 0 : Math.round(sunTargetHours * 10) / 10,
      rainTargetMm: (isNaN(rainTargetMm) || rainTargetMm < 0) ? 0 : Math.round(rainTargetMm * 10) / 10,
      rainCancelMm: (isNaN(rainCancelMm) || rainCancelMm < 0) ? 0 : Math.round(rainCancelMm * 10) / 10,
      rainCancelDays: (isNaN(rainCancelDays) || rainCancelDays < 0) ? 0 : Math.round(rainCancelDays),
      note: String(raw.note || '').trim()
    });
  });
  normalized.sort(function(a, b) {
    const wa = resolveCropWorkWindow_(a, new Date(2000, 0, 1), { skipWeather: true });
    const wb = resolveCropWorkWindow_(b, new Date(2000, 0, 1), { skipWeather: true });
    return wa.start - wb.start || a.workName.localeCompare(b.workName, 'ja');
  });
  return {
    cropName: name,
    entries: normalized,
    updatedBy: String(userName || '').trim(),
    updatedAt: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss')
  };
}

function listCropWorkPlansBrief_() {
  const sheet = ensureCropWorkPlanSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, 4).getValues();
  return values.map(r => {
    const cropName = String(r[0] || '').trim();
    let entryCount = 0;
    try {
      const parsed = JSON.parse(String(r[1] || '{}'));
      entryCount = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
    } catch (e) { entryCount = 0; }
    return {
      cropName: cropName,
      entryCount: entryCount,
      updatedBy: String(r[2] || '').trim(),
      updatedAt: String(r[3] || '').trim()
    };
  }).filter(x => x.cropName);
}

function listCropWorkPlans(params) {
  return { success: true, plans: listCropWorkPlansBrief_() };
}

function getCropWorkPlan(params) {
  const cropName = String((params && params.cropName) || '').trim();
  if (!cropName) throw new Error('品目名を指定してください');
  const sheet = ensureCropWorkPlanSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return { success: true, plan: { cropName: cropName, entries: [] } };
  const values = sheet.getRange(2, 1, last - 1, 4).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === cropName) {
      let plan = { cropName: cropName, entries: [] };
      try {
        const parsed = JSON.parse(String(values[i][1] || '{}'));
        plan = normalizeCropWorkPlanPayload_(cropName, parsed.entries || [], values[i][2]);
        plan.updatedAt = String(values[i][3] || '').trim();
      } catch (e) {
        plan = { cropName: cropName, entries: [] };
      }
      return { success: true, plan: plan };
    }
  }
  return { success: true, plan: { cropName: cropName, entries: [] } };
}

function saveCropWorkPlan(params) {
  const uname = String((params && params.userName) || '').trim();
  if (uname !== 'system' && !checkAdminRole(uname)) {
    throw new Error('品目別作業設定の変更は管理者のみ可能です');
  }
  const plan = normalizeCropWorkPlanPayload_(
    params && params.cropName,
    params && params.entries,
    uname
  );
  const sheet = ensureCropWorkPlanSheet_();
  const last = sheet.getLastRow();
  const json = JSON.stringify({ cropName: plan.cropName, entries: plan.entries });
  let foundRow = -1;
  if (last >= 2) {
    const names = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < names.length; i++) {
      if (String(names[i][0] || '').trim() === plan.cropName) {
        foundRow = i + 2;
        break;
      }
    }
  }
  if (foundRow > 0) {
    if (!plan.entries.length) sheet.deleteRow(foundRow);
    else sheet.getRange(foundRow, 1, 1, 4).setValues([[plan.cropName, json, plan.updatedBy, plan.updatedAt]]);
  } else if (plan.entries.length) {
    sheet.appendRow([plan.cropName, json, plan.updatedBy, plan.updatedAt]);
  }
  SpreadsheetApp.flush();
  return { success: true, plan: plan, plans: listCropWorkPlansBrief_() };
}

function deleteCropWorkPlan(params) {
  const uname = String((params && params.userName) || '').trim();
  if (uname !== 'system' && !checkAdminRole(uname)) {
    throw new Error('品目別作業設定の変更は管理者のみ可能です');
  }
  const cropName = String((params && params.cropName) || '').trim();
  if (!cropName) throw new Error('品目名を指定してください');
  const sheet = ensureCropWorkPlanSheet_();
  const last = sheet.getLastRow();
  if (last >= 2) {
    const names = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = names.length - 1; i >= 0; i--) {
      if (String(names[i][0] || '').trim() === cropName) sheet.deleteRow(i + 2);
    }
  }
  SpreadsheetApp.flush();
  return { success: true, plans: listCropWorkPlansBrief_() };
}

/** Date → 栽培計画と同じ半旬インデックス (0〜107: 18ヶ月×6) */
function dateToCpFlatIndex_(planYear, dateObj) {
  const y = dateObj.getFullYear();
  const m = dateObj.getMonth() + 1;
  const d = dateObj.getDate();
  let monthIndex = (m - 1);
  if (y > Number(planYear)) monthIndex = 12 + (m - 1);
  else if (y < Number(planYear)) monthIndex = Math.max(-12, (m - 1) - 12);
  if (monthIndex < 0) monthIndex = 0;
  if (monthIndex > 17) monthIndex = 17;
  const periodIndex = Math.min(5, Math.max(0, Math.floor((d - 1) / 5)));
  return monthIndex * 6 + periodIndex;
}

function cpFlatToLabel_(flat) {
  const f = Math.max(0, Math.min(107, Number(flat) || 0));
  const monthIndex = Math.floor(f / 6);
  const periodIndex = f % 6;
  const month = (monthIndex % 12) + 1;
  const yearMark = monthIndex >= 12 ? '(翌)' : '';
  return yearMark + month + '月' + (CP_PERIOD_NAMES_[periodIndex] || '');
}

function formatYmd_(d) {
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * 定植セル + 品目別作業設定 → 発生作業一覧
 * params: { cropName, year, plantingCells, fieldIds, lat, lng }
 */
function mapCropWorkPreviewRow_(e, win, flat, plantStart, plantEnd) {
  return {
    id: e.id,
    workName: e.workName,
    trigger: win.trigger,
    offsetDays: e.offsetDays,
    offsetPeriods: e.offsetPeriods,
    durationDays: e.durationDays,
    gddTarget: e.gddTarget,
    gddBase: e.gddBase,
    sunTargetHours: e.sunTargetHours,
    rainTargetMm: e.rainTargetMm,
    rainCancelMm: e.rainCancelMm,
    rainCancelDays: e.rainCancelDays,
    note: e.note,
    startDate: win.start ? formatYmd_(win.start) : null,
    endDate: win.end ? formatYmd_(win.end) : null,
    periodLabel: flat != null ? cpFlatToLabel_(flat) : win.label,
    triggerLabel: win.label,
    flat: flat,
    cancelled: !!win.cancelled,
    cancelLabel: win.cancelInfo && win.cancelInfo.label ? win.cancelInfo.label : '',
    rainAccumulated: win.cancelInfo ? win.cancelInfo.accumulated : null,
    plantingStart: plantStart ? formatYmd_(plantStart) : undefined,
    plantingEnd: plantEnd ? formatYmd_(plantEnd) : undefined
  };
}

function previewCropWorkSchedule(params) {
  const cropName = String((params && params.cropName) || '').trim();
  if (!cropName) throw new Error('作物名を指定してください');
  const year = Number((params && params.year) || new Date().getFullYear());
  const plantingCells = Array.isArray(params && params.plantingCells) ? params.plantingCells : [];
  const planRes = getCropWorkPlan({ cropName: cropName });
  const entries = (planRes.plan && planRes.plan.entries) || [];
  const loc = resolveFarmLatLng_(params && params.fieldIds, params && params.lat, params && params.lng);
  const needsWeather = cropWorkNeedsWeather_(entries);
  const plantForWeather = plantingCells.length
    ? (function() {
        const parts = plantingCells.map(c => cpCellToDateParts(year, c));
        parts.sort((a, b) => a.start - b.start);
        return parts[0].start;
      })()
    : new Date();
  let weather = null;
  if (needsWeather) {
    try { weather = loadCropWorkWeatherSeries_(loc.lat, loc.lng, plantForWeather); } catch (e) { weather = {}; }
  }
  const geo = { lat: loc.lat, lng: loc.lng, weather: weather };
  const gddWeather = needsWeather ? {
    lat: loc.lat,
    lng: loc.lng,
    note: '気温・降水・日射は実測・16日予報、先は去年の同時期'
  } : null;

  if (!plantingCells.length) {
    return {
      success: true,
      cropName: cropName,
      year: year,
      plantingLabel: '',
      gddWeather: gddWeather,
      works: entries.map(e => {
        const win = resolveCropWorkWindow_(e, new Date(), geo);
        return mapCropWorkPreviewRow_(e, win, null, null, null);
      }),
      entryCount: entries.length,
      message: '定植半旬が未設定です（オフセットのみ表示）'
    };
  }

  const plantParts = plantingCells.map(c => cpCellToDateParts(year, c));
  plantParts.sort((a, b) => a.start - b.start);
  const plantStart = plantParts[0].start;
  const plantEnd = plantParts[plantParts.length - 1].end;
  const plantingLabel = formatCpPeriodLabel(year, plantingCells);

  const works = entries.map(e => {
    const win = resolveCropWorkWindow_(e, plantStart, geo);
    const flat = dateToCpFlatIndex_(year, win.start);
    return mapCropWorkPreviewRow_(e, win, flat, plantStart, plantEnd);
  });
  works.sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')) || String(a.workName).localeCompare(String(b.workName), 'ja'));

  return {
    success: true,
    cropName: cropName,
    year: year,
    plantingLabel: plantingLabel,
    plantingStart: formatYmd_(plantStart),
    plantingEnd: formatYmd_(plantEnd),
    gddWeather: gddWeather,
    works: works,
    entryCount: works.length
  };
}

function searchPesticideCatalog(params) {
  const q = String((params && params.q) || '').trim().toLowerCase();
  const crop = String((params && params.crop) || '').trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, parseInt((params && params.limit) || 50, 10) || 50));
  if (!q && !crop) {
    throw new Error('農薬名または作物名のキーワードを入力してください');
  }
  const sheet = ensurePesticideCatalogSheet_();
  const last = sheet.getLastRow();
  if (last <= 1) {
    return { success: true, count: 0, totalCatalog: 0, items: [] };
  }
  const data = sheet.getRange(2, 1, last - 1, PESTICIDE_CATALOG_HEADERS_.length).getValues();
  const items = [];
  for (let i = 0; i < data.length; i++) {
    const item = readPesticideCatalogRow_(data[i]);
    if (!item.name) continue;
    if (q && String(item.name).toLowerCase().indexOf(q) < 0
        && String(item.activeIngredient).toLowerCase().indexOf(q) < 0
        && String(item.regNumber).toLowerCase().indexOf(q) < 0
        && String(item.manufacturer).toLowerCase().indexOf(q) < 0) continue;
    if (crop && String(item.cropName).toLowerCase().indexOf(crop) < 0) continue;
    items.push(item);
    if (items.length >= limit) break;
  }
  return {
    success: true,
    count: items.length,
    totalCatalog: Math.max(0, last - 1),
    items: items,
    truncated: items.length >= limit
  };
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

/** 作業マスタのカテゴリ列をリネーム（一括書き込みで高速化） */
function renameWorkMasterCategory_(oldName, newName) {
  const sheet = TENANT_SS.getSheetByName('作業マスタ');
  if (!sheet) return;
  const orig = String(oldName || '').trim();
  const next = String(newName || '').trim();
  if (!orig || !next || orig === next) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const catIdx = findWorkCategoryColumnIndex_(headers);
  if (catIdx < 0) return;
  const col = catIdx + 1;
  const range = sheet.getRange(2, col, lastRow, col);
  const colValues = range.getValues();
  let changed = false;
  for (let i = 0; i < colValues.length; i++) {
    if (String(colValues[i][0] || '').trim() === orig) {
      colValues[i][0] = next;
      changed = true;
    }
  }
  if (changed) range.setValues(colValues);
}

/** 作業マスタの作物名列をリネーム（カンマ区切り複数にも対応・一括書き込み） */
function renameWorkMasterCrop_(oldName, newName) {
  const sheet = TENANT_SS.getSheetByName('作業マスタ');
  if (!sheet) return;
  const orig = String(oldName || '').trim();
  const next = String(newName || '').trim();
  if (!orig || !next || orig === next) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const cropIdx = findWorkCropColumnIndex_(headers);
  if (cropIdx < 0) return;
  const col = cropIdx + 1;
  const range = sheet.getRange(2, col, lastRow, col);
  const colValues = range.getValues();
  let changed = false;
  for (let i = 0; i < colValues.length; i++) {
    const raw = String(colValues[i][0] || '').trim();
    if (!raw) continue;
    const parts = raw.split(/[,、]/).map(s => s.trim()).filter(Boolean);
    let rowChanged = false;
    const updated = parts.map(p => {
      if (p === orig) { rowChanged = true; return next; }
      return p;
    });
    if (rowChanged) {
      colValues[i][0] = updated.join(',');
      changed = true;
    }
  }
  if (changed) range.setValues(colValues);
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
          water_status: data[i][16] || 'stopped',
          drainage_status: data[i][19] || ''
        });
        let manureData = {};
        try { if (data[i][17]) manureData = JSON.parse(data[i][17]); } catch(e){}
        manureData = migrateManureDataObject_(manureData);
        
        result[result.length - 1].manure_status = manureData.manure_status || 'none';
        result[result.length - 1].manure_deadline = manureData.manure_deadline || '';
        result[result.length - 1].manure_scheduled_date = manureData.manure_scheduled_date || '';
        result[result.length - 1].manure_cancel_reason = manureData.manure_cancel_reason || '';
        result[result.length - 1].manure_has_pin = manureData.manure_has_pin || false;
        result[result.length - 1].manure_route_selected = manureData.manure_route_selected || false;
        result[result.length - 1].transplant_jun = manureData.transplant_jun || '';
        result[result.length - 1].catStatuses = manureData.catStatuses || {};

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
    if (params.drainage_status !== undefined) sheet.getRange(targetRow, 20).setValue(params.drainage_status); // T列: 排水溝ステータス
    if (params.manureData !== undefined) {
      let md = params.manureData;
      try {
        const obj = (typeof md === 'string') ? JSON.parse(md) : md;
        md = JSON.stringify(migrateManureDataObject_(obj || {}));
      } catch (e) { /* そのまま保存 */ }
      sheet.getRange(targetRow, 18).setValue(md); // R列: 生産管理ステータス
    }
    
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
  const pType = found.sheet.getName();
  const pc = 10;
  let ex = [];
  if (found.rowData[pc - 1]) { try { ex = JSON.parse(found.rowData[pc - 1]); } catch (e) {} }
  if (ex.length === 0 && found.rowData[6]) { try { ex = JSON.parse(found.rowData[6]); } catch (e) {} }

  const deleted = ex.find(item => item && (item.id === recordId || item.url === recordId));
  const updated = ex.filter(item => item && item.id !== recordId && item.url !== recordId);
  found.sheet.getRange(found.rowIndex, pc).setValue(JSON.stringify(updated));

  // 一覧シート（作業記録／生育記録／看板記録）の行も削除して本体と揃える
  const recordType = deleted ? String(deleted.type || '') : '';
  const sheetSpecs = [];
  if (recordType === 'work' || recordType === '作業') {
    sheetSpecs.push({ name: '作業記録', idCol: 12 });
  } else if (pType === '看板' || recordType === 'sign') {
    sheetSpecs.push({ name: '看板記録', idCol: 4 });
  } else if (recordType === 'growth' || recordType === '生育') {
    sheetSpecs.push({ name: '生育記録', idCol: 21 });
  } else {
    // タイプ不明時は候補を順に探す（1件だけ消す）
    sheetSpecs.push(
      { name: '作業記録', idCol: 12 },
      { name: '生育記録', idCol: 21 },
      { name: '看板記録', idCol: 4 }
    );
  }

  let listDeleted = false;
  for (let s = 0; s < sheetSpecs.length; s++) {
    if (listDeleted && sheetSpecs.length > 1 && !(recordType === 'work' || recordType === '作業' || recordType === 'growth' || recordType === '生育' || pType === '看板')) {
      // 不明タイプで既に1件消したら打ち切り
      break;
    }
    const spec = sheetSpecs[s];
    const rs = TENANT_SS.getSheetByName(spec.name);
    if (!rs || rs.getLastRow() < 2) continue;
    const d = rs.getDataRange().getValues();
    for (let i = d.length - 1; i >= 1; i--) {
      if (String(d[i][spec.idCol] || '') === String(recordId)) {
        rs.deleteRow(i + 1);
        listDeleted = true;
        break;
      }
    }
    // タイプが明確ならそのシートだけで終了
    if (recordType === 'work' || recordType === '作業' || recordType === 'growth' || recordType === '生育' || pType === '看板' || recordType === 'sign') {
      break;
    }
  }

  // 写真ファイルもゴミ箱へ（失敗しても記録削除自体は成功扱い）
  try {
    if (deleted && Array.isArray(deleted.urls)) {
      deleted.urls.forEach(function (u) {
        const s = String(u || '');
        let fid = '';
        const m1 = s.match(/[?&]id=([^&]+)/);
        const m2 = s.match(/\/d\/([^/]+)/);
        if (m1) fid = m1[1];
        else if (m2) fid = m2[1];
        if (fid) {
          try { DriveApp.getFileById(fid).setTrashed(true); } catch (e2) {}
        }
      });
    }
  } catch (e) {}

  writeLog(user, "記録削除", found.rowData[1], `対象ID: ${recordId}` + (listDeleted ? ' / 一覧シート削除済' : ' / 一覧シート該当なし'));
  return updated;
}

/**
 * 誤出勤の取消と、その日の本人の作業記録削除をまとめて行う。
 * 作業記録一覧と、圃場・看板に埋め込まれた履歴の両方を同期して削除する。
 */
function cancelClockInAndDeleteTodayWorkRecords(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const userName = String((params && params.userName) || '').trim();
    const normUser = userName.replace(/\s+/g, '');
    if (!normUser) throw new Error('ユーザー名がありません');

    function normalizeYmd_(value) {
      if (!value) return '';
      if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
        return Utilities.formatDate(value, 'JST', 'yyyy-MM-dd');
      }
      const s = String(value).trim();
      const m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
      if (m) {
        return m[1] + '-' + String(parseInt(m[2], 10)).padStart(2, '0') + '-' + String(parseInt(m[3], 10)).padStart(2, '0');
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'JST', 'yyyy-MM-dd');
    }

    const targetYmd = normalizeYmd_(params && params.dateYmd)
      || Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
    const recordIds = {};
    const workRowsToDelete = [];

    // 一覧シートから、対象日の本人の作業記録を特定する。
    const workSheet = TENANT_SS.getSheetByName('作業記録');
    if (workSheet && workSheet.getLastRow() >= 2) {
      const workValues = workSheet.getDataRange().getValues();
      for (let i = 1; i < workValues.length; i++) {
        const rowUser = String(workValues[i][2] || '').replace(/\s+/g, '');
        const rowYmd = normalizeYmd_(workValues[i][3]);
        if (rowUser === normUser && rowYmd === targetYmd) {
          const recordId = String(workValues[i][12] || '').trim();
          if (recordId) recordIds[recordId] = true;
          workRowsToDelete.push(i + 1);
        }
      }
    }

    const deletedKeys = {};
    const deletedUrls = {};
    const parentSheets = ['圃場', '看板'];

    // 同じ記録が複数圃場へ入っている場合も、全コピーから削除する。
    parentSheets.forEach(function(sheetName) {
      const sheet = TENANT_SS.getSheetByName(sheetName);
      if (!sheet || sheet.getLastRow() < 2) return;
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        let records = [];
        try {
          if (values[i][9]) records = JSON.parse(values[i][9]);
          else if (values[i][6]) records = JSON.parse(values[i][6]);
        } catch (e) {
          records = [];
        }
        if (!Array.isArray(records) || !records.length) continue;

        let changed = false;
        const kept = records.filter(function(item, itemIndex) {
          if (!item) return true;
          const recordId = String(item.id || item.url || '').trim();
          const itemType = String(item.type || '').trim();
          const itemUser = String(item.author || '').replace(/\s+/g, '');
          const itemYmd = normalizeYmd_((item.data && item.data.workDate) || item.date);
          const matchesEmbedded = (itemType === 'work' || itemType === '作業')
            && itemUser === normUser
            && itemYmd === targetYmd;
          const shouldDelete = (recordId && recordIds[recordId]) || matchesEmbedded;
          if (!shouldDelete) return true;

          changed = true;
          const uniqueKey = recordId || (sheetName + ':' + (i + 1) + ':' + itemIndex);
          deletedKeys[uniqueKey] = true;
          if (recordId) recordIds[recordId] = true;
          if (Array.isArray(item.urls)) {
            item.urls.forEach(function(url) { if (url) deletedUrls[String(url)] = true; });
          }
          return false;
        });

        if (changed) {
          sheet.getRange(i + 1, 10).setValue(JSON.stringify(kept));
        }
      }
    });

    // 一覧側は行番号がずれないよう下から削除する。
    for (let i = workRowsToDelete.length - 1; i >= 0; i--) {
      workSheet.deleteRow(workRowsToDelete[i]);
    }

    // 添付写真も既存の個別削除と同様にゴミ箱へ移す。
    Object.keys(deletedUrls).forEach(function(url) {
      const m1 = url.match(/[?&]id=([^&]+)/);
      const m2 = url.match(/\/d\/([^/]+)/);
      const fileId = m1 ? m1[1] : (m2 ? m2[1] : '');
      if (!fileId) return;
      try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
    });

    // 作業記録削除が完了してから出勤取消を記録する。
    saveTrackingData({
      userName: userName,
      lat: 0,
      lng: 0,
      type: '出勤取消',
      time: (params && params.time) || Date.now()
    });

    const deletedCount = Math.max(workRowsToDelete.length, Object.keys(deletedKeys).length);
    writeLog(userName, '誤出勤取消', targetYmd, '当日作業記録削除: ' + deletedCount + '件');
    return {
      success: true,
      dateYmd: targetYmd,
      deletedCount: deletedCount,
      deletedRecordIds: Object.keys(recordIds)
    };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 作業予定と地図ステータスの取得（部署自動判定を追加）
// ==========================================
/** 作業マスタの担当部署列のみ（作業カテゴリ列とは別） */
function findWorkDeptColumnIndex_(headers) {
  const candidates = ['担当部署', '部署'];
  for (let i = 0; i < candidates.length; i++) {
    const idx = headers.indexOf(candidates[i]);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 作業マスタに「担当部署」列を保証 */
function ensureWorkMasterDeptColumn_(sheet) {
  if (!sheet) return -1;
  try { ensureWorkMasterHeaders_(sheet); } catch (e) {}
  let lastCol = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });
  let idxDept = findWorkDeptColumnIndex_(headers);
  if (idxDept >= 0) return idxDept;
  lastCol += 1;
  sheet.getRange(1, lastCol).setValue('担当部署');
  SpreadsheetApp.flush();
  return lastCol - 1;
}

function getWorkCategoryList_() {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('作業カテゴリマスタ');
  let list = [];
  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    data.forEach(function(r) {
      const n = String(r[0] || '').trim();
      if (n) list.push(n);
    });
  }
  if (!list.length) list = ['圃場作業', '事務作業', '保全・整備'];
  return list;
}

/** 部署マスタシートを確保 */
function ensureDeptMasterSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('部署マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('部署マスタ');
    sheet.appendRow(['部署名']);
  } else {
    const h = String(sheet.getRange(1, 1).getValue() || '').trim();
    if (!h) sheet.getRange(1, 1).setValue('部署名');
  }
  return sheet;
}

/** 部署マスタ一覧（作業カテゴリとは別） */
function getDeptList_() {
  const sheet = ensureDeptMasterSheet_();
  let list = [];
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    // Sheet.getRange(row, column, numRows, numColumns)
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    data.forEach(function(r) {
      const n = String(r[0] || '').trim();
      if (n && list.indexOf(n) < 0) list.push(n);
    });
  }
  ['運営', '未設定'].forEach(function(x) {
    if (list.indexOf(x) < 0) list.push(x);
  });
  return list;
}

/** 部署マスタを全置換保存 */
function saveDepartmentMaster(params) {
  const p = params || {};
  const userName = String(p.userName || '').trim() || 'システム';
  let names = [];
  if (Array.isArray(p.departments)) {
    names = p.departments.map(function(d) { return String(d || '').trim(); }).filter(Boolean);
  } else if (p.department) {
    names = getDeptList_().slice();
    const add = String(p.department || '').trim();
    if (add && names.indexOf(add) < 0) names.push(add);
  }
  const uniq = [];
  const seen = {};
  names.forEach(function(n) {
    if (n === '未設定') return;
    if (seen[n]) return;
    seen[n] = true;
    uniq.push(n);
  });
  const sheet = ensureDeptMasterSheet_();
  const lastRow = sheet.getLastRow();
  // Sheet.getRange の第3引数は最終行ではなく行数
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 1).clearContent();
  if (uniq.length) {
    const values = uniq.map(function(n) { return [n]; });
    sheet.getRange(2, 1, values.length, 1).setValues(values);
  }
  try { writeLog(userName, '部署マスタ保存', '部署マスタ', uniq.join(', ')); } catch (e) {}
  return { success: true, departments: getDeptList_() };
}

/** 名簿の部署列を確保 */
function ensureMeiboDeptColumn_() {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('名簿');
  if (!sheet) throw new Error('名簿シートが見つかりません');
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });
  let col = -1;
  for (let c = 0; c < headers.length; c++) {
    const h = headers[c];
    if (h === '部署' || h === '担当部署' || h === '所属部署') {
      col = c;
      break;
    }
  }
  if (col < 0) {
    // ヘッダー行が無い旧名簿（A:ID B:PW C:名前 D:役割）にも対応
    if (lastCol >= 1 && !headers[0]) {
      sheet.getRange(1, 1, 1, 4).setValues([['スタッフID', 'パスワード', 'ユーザー名', '役割']]);
    }
    col = Math.max(sheet.getLastColumn(), 4);
    sheet.getRange(1, col + 1).setValue('部署');
    SpreadsheetApp.flush();
  }
  return { sheet: sheet, col: col };
}

function readMeiboUserDept_(rowVals, deptCol) {
  if (deptCol < 0 || !rowVals) return '';
  return String(rowVals[deptCol] || '').trim();
}

/** ユーザーの部署を一括更新 */
function updateUserDepts(params) {
  const p = params || {};
  const userName = String(p.userName || '').trim() || 'システム';
  const updates = Array.isArray(p.updates) ? p.updates : [];
  if (!updates.length) return { success: true, updated: 0 };

  const info = ensureMeiboDeptColumn_();
  const data = info.sheet.getDataRange().getValues();
  let updated = 0;
  updates.forEach(function(u) {
    const uid = String((u && u.userId) || '').trim();
    const dept = String((u && u.dept) || '').trim();
    if (!uid) return;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== uid) continue;
      info.sheet.getRange(i + 1, info.col + 1).setValue(dept);
      data[i][info.col] = dept;
      updated++;
      try {
        writeLog(userName, 'ユーザー部署設定', uid, String(data[i][2] || uid) + ': ' + (dept || '未設定'));
      } catch (e) {}
      break;
    }
  });
  return { success: true, updated: updated };
}

/** 作業マスタから 作業名→部署 の辞書を構築 */
function buildWorkDeptMapFromMaster_() {
  const map = {};
  const ss = TENANT_SS;
  const workMasterSheet = ss.getSheetByName('作業マスタ');
  if (!workMasterSheet || workMasterSheet.getLastRow() <= 1) return map;
  const idxDept = ensureWorkMasterDeptColumn_(workMasterSheet);
  const wData = workMasterSheet.getDataRange().getValues();
  const headers = wData[0].map(function(h) { return String(h || '').trim(); });
  const idxName = headers.indexOf('作業名');
  for (let i = 1; i < wData.length; i++) {
    const name = idxName >= 0 ? String(wData[i][idxName] || '').trim() : String(wData[i][0] || '').trim();
    if (!name) continue;
    const dept = idxDept >= 0 ? (String(wData[i][idxDept] || '').trim() || '未設定') : '未設定';
    map[name] = dept;
    if (name === '播種') map.__SOWING__ = dept;
  }
  return map;
}

function resolveScheduleWorkDept_(workName, workDeptMap) {
  const wn = String(workName || '').trim();
  if (!wn) return '未設定';
  if (wn.indexOf('⚠️') >= 0) return '運営';
  if (workDeptMap[wn]) return workDeptMap[wn];
  if (wn.indexOf('播種') === 0 && workDeptMap.__SOWING__) return workDeptMap.__SOWING__;
  if (wn === '調達') return workDeptMap['調達'] || workDeptMap.__SOWING__ || '未設定';
  return workDeptMap[wn] || '未設定';
}

function scheduleWorkNameMatchesDeptKey_(rowWorkName, keyWorkName) {
  const row = String(rowWorkName || '').trim();
  const key = String(keyWorkName || '').trim();
  if (!row || !key) return false;
  if (row === key) return true;
  if (key === '播種' && row.indexOf('播種') === 0) return true;
  return false;
}

/** 作業一覧用：部署設定取得（部署マスタ＋作業→部署＋ユーザー紐づけ） */
function getWorkDeptSettings(params) {
  const workDeptMap = buildWorkDeptMapFromMaster_();
  const ss = TENANT_SS;
  const departments = getDeptList_();
  const rows = [];
  const seen = {};

  const workSheet = ss.getSheetByName('作業マスタ');
  if (workSheet && workSheet.getLastRow() > 1) {
    try {
      const idxDept = ensureWorkMasterDeptColumn_(workSheet);
      const wData = workSheet.getDataRange().getValues();
      const headers = wData[0].map(function(h) { return String(h || '').trim(); });
      const idxName = headers.indexOf('作業名');
      for (let i = 1; i < wData.length; i++) {
        const name = idxName >= 0 ? String(wData[i][idxName] || '').trim() : String(wData[i][0] || '').trim();
        if (!name || seen[name]) continue;
        seen[name] = true;
        const dept = idxDept >= 0
          ? (String(wData[i][idxDept] || '').trim() || workDeptMap[name] || '未設定')
          : (workDeptMap[name] || '未設定');
        rows.push({
          workName: name,
          dept: dept,
          inMaster: true
        });
      }
    } catch (e) {}
  }

  const schedSheet = ss.getSheetByName('作業予定');
  if (schedSheet && schedSheet.getLastRow() > 1) {
    const sData = schedSheet.getRange(2, 1, schedSheet.getLastRow(), 11).getValues();
    sData.forEach(function(row) {
      if (row[8]) return;
      const name = String(row[0] || '').trim();
      if (!name) return;
      const key = (name.indexOf('播種') === 0) ? '播種' : name;
      if (seen[key]) return;
      seen[key] = true;
      const dept = String(row[1] || '').trim() || resolveScheduleWorkDept_(name, workDeptMap);
      rows.push({
        workName: key,
        dept: dept,
        inMaster: !!(workDeptMap[key] || (key === '播種' && workDeptMap.__SOWING__))
      });
    });
  }

  rows.sort(function(a, b) {
    return String(a.workName).localeCompare(String(b.workName), 'ja');
  });

  const users = [];
  try {
    const meiboInfo = ensureMeiboDeptColumn_();
    const mData = meiboInfo.sheet.getDataRange().getValues();
    for (let i = 1; i < mData.length; i++) {
      const uid = String(mData[i][0] || '').trim();
      if (!uid) continue;
      users.push({
        userId: uid,
        userName: String(mData[i][2] || '').trim(),
        role: String(mData[i][3] || '作業員').trim() || '作業員',
        dept: readMeiboUserDept_(mData[i], meiboInfo.col) || '未設定'
      });
    }
    users.sort(function(a, b) {
      return String(a.userName || a.userId).localeCompare(String(b.userName || b.userId), 'ja');
    });
  } catch (e) {}

  return {
    success: true,
    departments: departments,
    workCategories: getWorkCategoryList_(),
    rows: rows,
    users: users
  };
}

/** 作業名ごとの部署を更新（作業マスタの担当部署列＋未完了の作業予定） */
function updateWorkDeptSettings(params) {
  const updates = (params && params.updates) || [];
  const syncSchedule = !(params && params.syncScheduleRows === false);
  const userName = String((params && params.userName) || '').trim() || 'システム';
  if (!updates.length) return { success: true, updatedMaster: 0, updatedSchedule: 0 };

  const ss = TENANT_SS;
  let updatedMaster = 0;
  let updatedSchedule = 0;

  // 新しい部署名があれば部署マスタへ追加
  try {
    const existing = getDeptList_();
    const toAdd = [];
    updates.forEach(function(u) {
      const d = String(u.dept || '').trim();
      if (!d || d === '未設定') return;
      if (existing.indexOf(d) < 0 && toAdd.indexOf(d) < 0) toAdd.push(d);
    });
    if (toAdd.length) {
      saveDepartmentMaster({
        departments: existing.filter(function(x) { return x !== '未設定'; }).concat(toAdd),
        userName: userName
      });
    }
  } catch (e) {}

  const workSheet = ss.getSheetByName('作業マスタ');
  if (workSheet) {
    const idxDept = ensureWorkMasterDeptColumn_(workSheet);
    const wData = workSheet.getDataRange().getValues();
    const headers = wData[0].map(function(h) { return String(h || '').trim(); });
    const idxName = headers.indexOf('作業名');
    updates.forEach(function(u) {
      const workName = String(u.workName || '').trim();
      const dept = String(u.dept || '').trim();
      if (!workName || !dept) return;
      let found = false;
      for (let i = 1; i < wData.length; i++) {
        const nm = idxName >= 0 ? String(wData[i][idxName] || '').trim() : String(wData[i][0] || '').trim();
        if (nm !== workName) continue;
        workSheet.getRange(i + 1, idxDept + 1).setValue(dept);
        wData[i][idxDept] = dept;
        updatedMaster++;
        found = true;
        break;
      }
      if (!found) {
        const row = new Array(Math.max(headers.length, idxDept + 1)).fill('');
        if (idxName >= 0) row[idxName] = workName;
        else row[0] = workName;
        row[idxDept] = dept;
        workSheet.appendRow(row);
        wData.push(row);
        updatedMaster++;
      }
      writeLog(userName, '部署設定', workName, dept);
    });
  }

  if (syncSchedule) {
    const schedSheet = ss.getSheetByName('作業予定');
    if (schedSheet && schedSheet.getLastRow() > 1) {
      const sData = schedSheet.getRange(2, 1, schedSheet.getLastRow(), 11).getValues();
      updates.forEach(function(u) {
        const workName = String(u.workName || '').trim();
        const dept = String(u.dept || '').trim();
        if (!workName || !dept) return;
        for (let i = 0; i < sData.length; i++) {
          if (sData[i][8]) continue;
          if (!scheduleWorkNameMatchesDeptKey_(sData[i][0], workName)) continue;
          schedSheet.getRange(i + 2, 2).setValue(dept);
          sData[i][1] = dept;
          updatedSchedule++;
        }
      });
    }
  }

  return { success: true, updatedMaster: updatedMaster, updatedSchedule: updatedSchedule };
}

/** 作業予定1行の部署だけ更新 */
function updateScheduleRowDept(params) {
  const sheetRow = Number(params && params.sheetRow);
  const dept = String((params && params.dept) || '').trim();
  const userName = String((params && params.userName) || '').trim() || 'システム';
  if (!sheetRow || sheetRow < 2) throw new Error('行番号が不正です');
  if (!dept) throw new Error('部署を指定してください');

  const ss = TENANT_SS;
  const schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) throw new Error('作業予定シートがありません');
  if (sheetRow > schedSheet.getLastRow()) throw new Error('対象行が見つかりません');

  const workName = String(schedSheet.getRange(sheetRow, 1).getValue() || '').trim();
  schedSheet.getRange(sheetRow, 2).setValue(dept);
  writeLog(userName, '作業予定部署変更', workName, dept);
  return { success: true, sheetRow: sheetRow, dept: dept, workName: workName };
}

function isMidProgressStatus_(progress) {
  const p = String(progress || '').trim();
  return p === '途中' || p === '作業中';
}

function formatWorkDateMmDd_(val) {
  if (!val) return '-';
  try {
    if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
      return Utilities.formatDate(val, 'JST', 'MM/dd');
    }
    const s = String(val).trim();
    const m = s.match(/(\d{1,2})[\/\-](\d{1,2})/);
    if (m) return String(parseInt(m[1], 10)) + '/' + String(parseInt(m[2], 10));
    const d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'JST', 'MM/dd');
  } catch (e) {}
  return String(val);
}

function formatWorkDateYmd_(val) {
  if (!val) return '';
  try {
    if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
      return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
    }
    const s = String(val).trim().replace(/\//g, '-');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
  } catch (e) {}
  return '';
}

var globalCpPlanLookup_ = null;
function getScheduleData() {
  const ss = TENANT_SS;
  const today = new Date(); today.setHours(0,0,0,0);
  globalCpPlanLookup_ = null;

  // 1. 作業マスタから「作業名 -> 担当部署」の辞書を作成
  const workDeptMap = buildWorkDeptMapFromMaster_();

  // 圃場名 → polyId
  const fieldNameToPolyId = {};
  try {
    const polygons = getSavedPolygons();
    polygons.forEach(function(p) {
      if (p && p.name && p.id) fieldNameToPolyId[String(p.name)] = p.id;
    });
  } catch (e) {}

  // 2. 作業実績から収穫中・完了・途中を抽出
  const workSheet = ss.getSheetByName('作業記録');
  const completedWorks = {}; // key -> latest completion date
  const harvestingFields = {};
  const midWorkCandidates = [];
  if (workSheet) {
    const wData = workSheet.getDataRange().getValues();
    for (let i = 1; i < wData.length; i++) {
      const fieldName = wData[i][1];
      const author = wData[i][2];
      const workDate = wData[i][3];
      const workName = wData[i][4];
      const cropName = wData[i][5];
      const startTime = wData[i][6];
      const endTime = wData[i][7];
      const totalTime = wData[i][9];
      const progress = wData[i][10];
      const recordId = wData[i][12];
      const workedRidges = wData[i][13];
      const nextRidge = wData[i][14];
      const dept = workDeptMap[workName] || '未分類';

      // 複数圃場は先頭をキーに（既存ロジック互換）
      const primaryField = String(fieldName || '').split(',')[0].trim();
      const key = `${primaryField}_${workName}_${cropName}`;

      if (progress === '完了') {
        if (!completedWorks[key] || new Date(workDate) > new Date(completedWorks[key])) {
          completedWorks[key] = workDate;
        }
      }
      if (isMidProgressStatus_(progress) && workName && primaryField) {
        midWorkCandidates.push({
          key: key,
          workName: workName,
          dept: dept,
          cropName: cropName || '',
          fieldName: primaryField,
          fieldNamesRaw: String(fieldName || ''),
          author: String(author || ''),
          workDate: workDate,
          workDateYmd: formatWorkDateYmd_(workDate),
          startTime: startTime || '',
          endTime: endTime || '',
          totalTime: totalTime || '',
          progressStatus: String(progress || '途中'),
          recordId: String(recordId || ''),
          polyId: fieldNameToPolyId[primaryField] || '',
          workedRidges: workedRidges || '',
          nextRidge: nextRidge || ''
        });
      }
      if (workName && String(workName).includes('収穫') && progress !== '完了') {
        if(!harvestingFields[primaryField || fieldName]) harvestingFields[primaryField || fieldName] = [];
        const fKey = primaryField || fieldName;
        if(!harvestingFields[fKey].includes(dept)) harvestingFields[fKey].push(dept);
      }
    }
  }

  // 途中のうち、同キーで後から完了が入っていないものだけ予定へ
  const midWorks = [];
  midWorkCandidates.forEach(function(mw) {
    const doneDate = completedWorks[mw.key];
    if (doneDate) {
      const midMs = mw.workDate ? new Date(mw.workDate).getTime() : 0;
      const doneMs = new Date(doneDate).getTime();
      if (!isNaN(doneMs) && (isNaN(midMs) || doneMs >= midMs)) return; // 完了済み扱い
    }
    midWorks.push(mw);
  });

  // 3. 作業予定の照合と自動部署判定
  const schedSheet = ss.getSheetByName('作業予定');
  let activeSchedules = [];
  const taskUsersMap = collectScheduleTaskUsersMap_();
  const dayPlanMaps = collectDayPlanBookings_();
  if (schedSheet) {
    const sData = schedSheet.getDataRange().getValues();
    let scheduleUpdates = [];
    const completedProcurePlaceIds = {};
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
        else {
          dept = workDeptMap[workName] || '未設定';
          if ((!dept || dept === '未設定') && String(workName).indexOf('播種') === 0 && workDeptMap.__SOWING__) {
            dept = workDeptMap.__SOWING__;
          }
          if ((!dept || dept === '未設定') && String(workName).trim() === '調達') {
            dept = workDeptMap['調達'] || workDeptMap.__SOWING__ || dept;
          }
        }
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
        const scheduleKey = buildWorkScheduleKey_(workName, fieldName, cropName, schedDateRaw, deadlineRaw);
        const placeIdRaw = String(sData[i][10] || '');
        const parsedPlace = parseCpPlaceKind_(placeIdRaw);
        const isCultivation = !!parsedPlace.kind;
        const isProcure = parsedPlace.kind === 'procure';
        if (isProcure && (compDate || (!compDate && completedWorks[key]))) {
          completedProcurePlaceIds[placeIdRaw] = true;
        }
        let varietyName = '';
        let periodLabel = '';
        let displayCrop = cropName;
        let displayTag = person;
        let displayTrays = hours;
        if (isProcure) {
          varietyName = fieldName;
          periodLabel = '播種の7日前まで';
          displayTrays = hours;
        } else if (isCultivation) {
          if (!globalCpPlanLookup_) globalCpPlanLookup_ = buildCultivationPlanLookupById_();
          const planId = parsedPlace.planIds[0] || '';
          const plan = planId ? globalCpPlanLookup_[planId] : null;
          if (plan) {
            displayCrop = plan.crop || displayCrop;
            varietyName = plan.variety || '';
            displayTag = plan.tag || displayTag;
            const unit = (Number(plan.holes) === 1) ? '粒' : '枚';
            if (parsedPlace.kind !== 'work' && plan.trays != null && plan.trays !== '') displayTrays = plan.trays + unit;
          }
          if (parsedPlace.kind === 'plant') {
            try { periodLabel = plan ? formatCpPeriodLabel(plan.year, (plan.tasks && plan.tasks.planting) || []) : '定植'; } catch (e2) { periodLabel = '定植'; }
          } else if (parsedPlace.kind === 'work') {
            periodLabel = String(hours || '');
          } else if (parsedPlace.kind === 'sow') {
            try { periodLabel = plan ? formatCpPeriodLabel(plan.year, (plan.tasks && plan.tasks.sowing) || []) : ''; } catch (e2) {}
          }
        }
        let placeFieldIds = [];
        const pipeIdx = placeIdRaw.indexOf('|');
        if (pipeIdx >= 0) {
          placeFieldIds = placeIdRaw.slice(pipeIdx + 1).split(',').map(function(x) {
            return String(x || '').trim();
          }).filter(Boolean);
        }
        activeSchedules.push({
          workName,
          dept,
          cropName: displayCrop,
          variety: varietyName,
          fieldName,
          schedDate: schedDateStr,
          deadline: deadlineStr,
          hours,
          person,
          isOverdue,
          isCultivation: isCultivation,
          cpKind: parsedPlace.kind || '',
          fieldIds: placeFieldIds,
          trays: displayTrays,
          tag: displayTag,
          periodLabel: periodLabel,
          scheduleKey: scheduleKey,
          sheetRow: i + 1,
          placeId: placeIdRaw,
          taskUsers: taskUsersMap[scheduleKey] || [],
          isMidWork: false,
          dayPlans: []
        });
        attachDayPlansToSchedule_(activeSchedules[activeSchedules.length - 1], dayPlanMaps);
      }
    }
    // 空欄を自動補完
    if (scheduleUpdates.length > 0) {
      scheduleUpdates.forEach(upd => schedSheet.getRange(upd.row, upd.col).setValue(upd.val));
    }
    try {
      ensureSowingAfterCompletedProcure_(sData, completedProcurePlaceIds);
    } catch (eProcureSow) {}
  }

  // 途中作業を予定一覧へ追加
  midWorks.forEach(function(mw) {
    activeSchedules.push({
      workName: mw.workName,
      dept: mw.dept,
      cropName: mw.cropName,
      fieldName: mw.fieldName,
      schedDate: formatWorkDateMmDd_(mw.workDate),
      deadline: '-',
      hours: mw.totalTime || '',
      person: mw.author,
      isOverdue: false,
      isCultivation: false,
      trays: '',
      tag: mw.author,
      scheduleKey: '',
      taskUsers: [],
      isMidWork: true,
      progressStatus: mw.progressStatus,
      author: mw.author,
      workDate: formatWorkDateMmDd_(mw.workDate),
      workDateYmd: mw.workDateYmd,
      startTime: mw.startTime,
      endTime: mw.endTime,
      totalTime: mw.totalTime,
      recordId: mw.recordId,
      polyId: mw.polyId,
      workedRidges: mw.workedRidges,
      nextRidge: mw.nextRidge,
      dayPlans: []
    });
    attachDayPlansToSchedule_(activeSchedules[activeSchedules.length - 1], dayPlanMaps);
  });

  applyWorkScheduleStatus_(activeSchedules);

  // 4. ポリゴン情報の収集（ステータスはフロントエンドで計算させるために付加情報を乗せる）
  const polygons = getSavedPolygons();
  polygons.forEach(p => {
    p.harvestingDepts = harvestingFields[p.name] || []; 
  });

  return { polygons, activeSchedules, midWorks: midWorks, workCategories: getWorkCategoryList_(), departments: getDeptList_() };
}

/**
 * 途中作業を委任完了にする（進捗を完了に更新）
 * params: { id|polyId, recordId, userName }
 */
function delegateCompleteWork(params) {
  const polyId = String((params && (params.id || params.polyId)) || '').trim();
  const recordId = String((params && params.recordId) || '').trim();
  const userName = String((params && params.userName) || '').trim() || 'システム';
  if (!polyId) throw new Error('圃場IDがありません');
  if (!recordId) throw new Error('記録IDがありません');

  const found = findSheetAndRowById(polyId);
  if (!found) throw new Error('対象の圃場が見つかりません');
  const pc = 10;
  let ex = [];
  if (found.rowData[pc - 1]) { try { ex = JSON.parse(found.rowData[pc - 1]); } catch (e) {} }
  if (ex.length === 0 && found.rowData[6]) { try { ex = JSON.parse(found.rowData[6]); } catch (e) {} }
  const tgt = ex.find(function(item) { return item && (item.id === recordId || item.url === recordId); });
  if (!tgt) throw new Error('対象の作業記録が見つかりません');
  if (!tgt.data || typeof tgt.data !== 'object') tgt.data = {};

  const prevStatus = String(tgt.data.progressStatus || '');
  tgt.data.progressStatus = '完了';
  tgt.data.delegatedBy = userName;
  tgt.data.delegatedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  if (!tgt.data.comment) tgt.data.comment = '';
  const note = '【委任完了】' + userName + ' が途中→完了に変更';
  if (String(tgt.data.comment).indexOf('【委任完了】') < 0) {
    tgt.data.comment = (tgt.data.comment ? String(tgt.data.comment) + '\n' : '') + note;
  }

  found.sheet.getRange(found.rowIndex, pc).setValue(JSON.stringify(ex));

  // 作業記録シート同期
  const rs = TENANT_SS.getSheetByName('作業記録');
  if (rs) {
    const d = rs.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][12]) === recordId) {
        rs.getRange(i + 1, 11).setValue('完了');
        break;
      }
    }
  }

  writeLog(userName, '委任完了', found.rowData[1] || polyId, '記録ID: ' + recordId + ' / 旧進捗: ' + prevStatus);
  return { success: true, photos: ex, recordId: recordId, progressStatus: '完了' };
}

/**
 * 作業予定を一覧から削除する（作業予定シートの行削除）
 * params: { sheetRow, scheduleKey, workName, fieldName, cropName, userName }
 */
function deleteWorkSchedule(params) {
  params = params || {};
  const userName = String(params.userName || '').trim() || 'ユーザー';
  const ss = TENANT_SS || SpreadsheetApp.getActiveSpreadsheet();
  const schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) throw new Error('作業予定シートがありません');

  const data = schedSheet.getDataRange().getValues();
  let targetRow = parseInt(params.sheetRow, 10);
  if (!(targetRow >= 2 && targetRow <= data.length)) {
    targetRow = 0;
    const wantKey = String(params.scheduleKey || '').trim();
    const wantName = String(params.workName || '').trim();
    const wantField = String(params.fieldName || '').trim();
    const wantCrop = String(params.cropName || '').trim();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[8] || '').trim()) continue; // 完了済みは対象外
      const key = buildWorkScheduleKey_(row[0], row[3], row[2], row[4], row[5]);
      if (wantKey && key === wantKey) {
        targetRow = i + 1;
        break;
      }
      if (!wantKey && wantName
          && String(row[0] || '').trim() === wantName
          && String(row[3] || '').trim() === wantField
          && String(row[2] || '').trim() === wantCrop) {
        targetRow = i + 1;
        break;
      }
    }
  }

  if (!(targetRow >= 2 && targetRow <= data.length)) {
    throw new Error('削除対象の作業予定が見つかりませんでした');
  }

  const rowData = data[targetRow - 1] || [];
  const workName = String(rowData[0] || params.workName || '').trim();
  const fieldName = String(rowData[3] || params.fieldName || '').trim();
  // 完了済み行は消さない（一覧に出ない想定）
  if (String(rowData[8] || '').trim()) {
    throw new Error('この作業は既に完了済みです');
  }

  schedSheet.deleteRow(targetRow);
  writeLog(userName, '作業予定削除', fieldName || workName, `作業名: ${workName}, 行: ${targetRow}`);
  return { success: true, workName: workName, fieldName: fieldName, sheetRow: targetRow };
}

/**
 * 作業予定を一覧から完了にする（完了日を入れる。削除はしない）
 * 調達完了→播種、播種完了→定植、定植完了→品目別作業 を作業予定へ出す。
 * 途中作業は作業記録の進捗を完了に更新する。
 */
function completeWorkSchedule(params) {
  params = params || {};
  const userName = String(params.userName || '').trim() || 'ユーザー';
  const isMid = params.isMidWork === true || params.isMidWork === 'true' || params.isMidWork === 1 || params.isMidWork === '1';
  if (isMid || String(params.recordId || '').trim()) {
    return delegateCompleteWork(params);
  }

  const ss = TENANT_SS || SpreadsheetApp.getActiveSpreadsheet();
  const schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) throw new Error('作業予定シートがありません');

  const data = schedSheet.getDataRange().getValues();
  let targetRow = parseInt(params.sheetRow, 10);
  if (!(targetRow >= 2 && targetRow <= data.length)) {
    targetRow = 0;
    const wantKey = String(params.scheduleKey || '').trim();
    const wantName = String(params.workName || '').trim();
    const wantField = String(params.fieldName || '').trim();
    const wantCrop = String(params.cropName || '').trim();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[8] || '').trim()) continue;
      const key = buildWorkScheduleKey_(row[0], row[3], row[2], row[4], row[5]);
      if (wantKey && key === wantKey) {
        targetRow = i + 1;
        break;
      }
      if (!wantKey && wantName
          && String(row[0] || '').trim() === wantName
          && String(row[3] || '').trim() === wantField
          && String(row[2] || '').trim() === wantCrop) {
        targetRow = i + 1;
        break;
      }
    }
  }

  if (!(targetRow >= 2 && targetRow <= data.length)) {
    throw new Error('完了対象の作業予定が見つかりませんでした');
  }

  const rowData = data[targetRow - 1] || [];
  const workName = String(rowData[0] || params.workName || '').trim();
  const fieldName = String(rowData[3] || params.fieldName || '').trim();
  const placeId = String(rowData[10] || '').trim();
  if (String(rowData[8] || '').trim()) {
    throw new Error('この作業は既に完了済みです');
  }

  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  schedSheet.getRange(targetRow, 9).setValue(today);

  if (placeId.indexOf('cp:procure:') === 0 || workName === '調達') {
    const extra = {};
    extra[placeId] = true;
    try {
      ensureSowingAfterCompletedProcure_(schedSheet.getDataRange().getValues(), extra);
    } catch (eSow) {}
  } else if (parseCpPlaceKind_(placeId).kind === 'sow' || workName === '播種') {
    const extra = {};
    extra[placeId] = true;
    try {
      ensurePlantingAfterCompletedSowing_(schedSheet.getDataRange().getValues(), extra);
    } catch (ePlant) {}
    try {
      ensureSowingRecordAfterScheduleComplete_(rowData, userName, today);
    } catch (eSowRec) {}
  } else if (parseCpPlaceKind_(placeId).kind === 'plant' || workName === '定植') {
    const extra = {};
    extra[placeId] = true;
    try {
      ensureFieldWorksAfterCompletedPlanting_(schedSheet.getDataRange().getValues(), extra);
    } catch (eWork) {}
  }

  writeLog(userName, '作業予定完了', fieldName || workName, `作業名: ${workName}, 行: ${targetRow}`);
  return { success: true, workName: workName, fieldName: fieldName, sheetRow: targetRow, completedAt: today };
}

/** 作業一覧から複数件をまとめて完了 */
function bulkCompleteWorkSchedule(params) {
  params = params || {};
  const items = params.items || [];
  const userName = String(params.userName || '').trim() || 'ユーザー';
  if (!items.length) return { success: true, completed: 0, failed: [] };

  const completed = [];
  const failed = [];
  items.forEach(function(item) {
    try {
      const res = completeWorkSchedule(Object.assign({}, item, { userName: userName }));
      completed.push({
        workName: res.workName || item.workName || '',
        fieldName: res.fieldName || item.fieldName || '',
        sheetRow: res.sheetRow || item.sheetRow || 0
      });
    } catch (e) {
      failed.push({
        workName: item.workName || '',
        fieldName: item.fieldName || '',
        sheetRow: item.sheetRow || 0,
        message: String(e.message || e)
      });
    }
  });

  return {
    success: failed.length === 0,
    completedCount: completed.length,
    failedCount: failed.length,
    completed: completed,
    failed: failed
  };
}

/** 途中作業の完了を元に戻す（進捗を途中へ） */
function undoDelegateCompleteWork_(params) {
  const polyId = String((params && (params.id || params.polyId)) || '').trim();
  const recordId = String((params && params.recordId) || '').trim();
  const userName = String((params && params.userName) || '').trim() || 'システム';
  if (!polyId) throw new Error('圃場IDがありません');
  if (!recordId) throw new Error('記録IDがありません');

  const found = findSheetAndRowById(polyId);
  if (!found) throw new Error('対象の圃場が見つかりません');
  const pc = 10;
  let ex = [];
  if (found.rowData[pc - 1]) { try { ex = JSON.parse(found.rowData[pc - 1]); } catch (e) {} }
  if (ex.length === 0 && found.rowData[6]) { try { ex = JSON.parse(found.rowData[6]); } catch (e) {} }
  const tgt = ex.find(function(item) { return item && (item.id === recordId || item.url === recordId); });
  if (!tgt) throw new Error('対象の作業記録が見つかりません');
  if (!tgt.data || typeof tgt.data !== 'object') tgt.data = {};

  tgt.data.progressStatus = '途中';
  if (tgt.data.comment) {
    tgt.data.comment = String(tgt.data.comment)
      .split('\n')
      .filter(function(line) { return String(line).indexOf('【委任完了】') < 0; })
      .join('\n');
  }

  found.sheet.getRange(found.rowIndex, pc).setValue(JSON.stringify(ex));

  const rs = TENANT_SS.getSheetByName('作業記録');
  if (rs) {
    const d = rs.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][12]) === recordId) {
        rs.getRange(i + 1, 11).setValue('途中');
        break;
      }
    }
  }

  writeLog(userName, '作業完了取消', found.rowData[1] || polyId, '記録ID: ' + recordId + ' → 途中');
  return { success: true, recordId: recordId, progressStatus: '途中', isMidWork: true };
}

/**
 * 作業予定の完了を元に戻す（完了日をクリア）
 * 途中作業は進捗を「途中」に戻す。
 */
function undoCompleteWorkSchedule(params) {
  params = params || {};
  const userName = String(params.userName || '').trim() || 'ユーザー';
  const isMid = params.isMidWork === true || params.isMidWork === 'true' || params.isMidWork === 1 || params.isMidWork === '1';
  if (isMid || String(params.recordId || '').trim()) {
    return undoDelegateCompleteWork_(params);
  }

  const ss = TENANT_SS || SpreadsheetApp.getActiveSpreadsheet();
  const schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) throw new Error('作業予定シートがありません');

  const data = schedSheet.getDataRange().getValues();
  let targetRow = parseInt(params.sheetRow, 10);
  if (!(targetRow >= 2 && targetRow <= data.length)) {
    targetRow = 0;
    const wantKey = String(params.scheduleKey || '').trim();
    const wantName = String(params.workName || '').trim();
    const wantField = String(params.fieldName || '').trim();
    const wantCrop = String(params.cropName || '').trim();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      // 完了済みを対象にする
      if (!String(row[8] || '').trim()) continue;
      const key = buildWorkScheduleKey_(row[0], row[3], row[2], row[4], row[5]);
      if (wantKey && key === wantKey) {
        targetRow = i + 1;
        break;
      }
      if (!wantKey && wantName
          && String(row[0] || '').trim() === wantName
          && String(row[3] || '').trim() === wantField
          && String(row[2] || '').trim() === wantCrop) {
        targetRow = i + 1;
        break;
      }
    }
  }

  if (!(targetRow >= 2 && targetRow <= data.length)) {
    throw new Error('取り消す完了済み作業が見つかりませんでした');
  }

  const rowData = data[targetRow - 1] || [];
  const workName = String(rowData[0] || params.workName || '').trim();
  const fieldName = String(rowData[3] || params.fieldName || '').trim();
  const placeId = String(rowData[10] || '').trim();
  if (!String(rowData[8] || '').trim()) {
    return { success: true, workName: workName, fieldName: fieldName, sheetRow: targetRow, alreadyOpen: true };
  }

  schedSheet.getRange(targetRow, 9).setValue('');
  if (parseCpPlaceKind_(placeId).kind === 'sow' || workName === '播種') {
    try {
      removeSowingRecordAfterScheduleUndo_(rowData);
    } catch (eSowUndo) {}
  }
  writeLog(userName, '作業完了取消', fieldName || workName, `作業名: ${workName}, 行: ${targetRow}`);
  return { success: true, workName: workName, fieldName: fieldName, sheetRow: targetRow };
}

/** 作業一覧から複数件の完了をまとめて取り消す */
function bulkUndoCompleteWorkSchedule(params) {
  params = params || {};
  const items = params.items || [];
  const userName = String(params.userName || '').trim() || 'ユーザー';
  if (!items.length) return { success: true, undone: 0, failed: [] };

  const undone = [];
  const failed = [];
  items.forEach(function(item) {
    try {
      const res = undoCompleteWorkSchedule(Object.assign({}, item, { userName: userName }));
      undone.push({
        workName: res.workName || item.workName || '',
        fieldName: res.fieldName || item.fieldName || '',
        sheetRow: res.sheetRow || item.sheetRow || 0,
        isMidWork: !!(res.isMidWork || item.isMidWork)
      });
    } catch (e) {
      failed.push({
        workName: item.workName || '',
        fieldName: item.fieldName || '',
        sheetRow: item.sheetRow || 0,
        message: String(e.message || e)
      });
    }
  });

  return {
    success: failed.length === 0,
    undoneCount: undone.length,
    failedCount: failed.length,
    undone: undone,
    failed: failed
  };
}

/**
 * 作業予定を手動で追加登録する
 * params: { workName, fieldName, cropName, dept, schedDate, deadline, hours, person, notes, polyId, userName }
 */
function addWorkSchedule(params) {
  params = params || {};
  const workName = String(params.workName || '').trim();
  if (!workName) throw new Error('作業名を入力してください');
  const fieldName = String(params.fieldName || '').trim();
  const cropName = String(params.cropName || '').trim();
  const dept = String(params.dept || '').trim();
  let schedDateStr = '';
  if (params.schedDate) {
    try { schedDateStr = Utilities.formatDate(new Date(params.schedDate), "Asia/Tokyo", "yyyy/MM/dd"); } catch(e) { schedDateStr = String(params.schedDate); }
  }
  let deadlineStr = '';
  if (params.deadline) {
    try { deadlineStr = Utilities.formatDate(new Date(params.deadline), "Asia/Tokyo", "yyyy/MM/dd"); } catch(e) { deadlineStr = String(params.deadline); }
  }
  const hours = String(params.hours || '').trim();
  const person = String(params.person || params.userName || '').trim();
  const notes = String(params.notes || '').trim();
  const polyId = String(params.polyId || '').trim();

  const ss = TENANT_SS || SpreadsheetApp.getActiveSpreadsheet();
  let schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) {
    schedSheet = ss.insertSheet('作業予定');
    schedSheet.appendRow(['作業名', '担当部署', '作物名', '圃場名', '作業予定日', '期限日', '枚数・時間', '適合者', '完了日', '写真URL', '場所ID']);
    schedSheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#e0e0e0');
  }

  schedSheet.appendRow([workName, dept, cropName, fieldName, schedDateStr, deadlineStr, hours, person, '', notes, polyId]);

  const author = String(params.userName || person || 'ユーザー').trim();
  writeLog(author, '作業予定追加', fieldName || workName, `作業名: ${workName}, 予定日: ${schedDateStr || '未指定'}`);
  return { success: true, workName: workName, fieldName: fieldName };
}

// ===== 依頼作業（外注） =====
const OUTSOURCE_WORK_HEADERS_ = ['作業名', '依頼先', '作物名', '圃場名', '予定日', '期限日', '枚数・時間', '依頼者', '完了日', '備考', '場所ID'];

function ensureOutsourceWorkSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('依頼作業');
  if (!sheet) {
    sheet = ss.insertSheet('依頼作業');
    sheet.appendRow(OUTSOURCE_WORK_HEADERS_.slice());
    sheet.getRange(1, 1, 1, OUTSOURCE_WORK_HEADERS_.length).setFontWeight('bold').setBackground('#e3f2fd');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), OUTSOURCE_WORK_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    OUTSOURCE_WORK_HEADERS_.forEach(function(h, idx) {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function buildOutsourceWorkKey_(workName, fieldName, cropName, schedDateRaw, deadlineRaw) {
  return buildWorkScheduleKey_(workName, fieldName, cropName, schedDateRaw, deadlineRaw);
}

function formatOutsourceDateCell_(raw) {
  if (!raw) return '-';
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Tokyo', 'MM/dd');
  } catch (e) {}
  return String(raw);
}

function getOutsourceWorkData() {
  const ss = TENANT_SS;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sheet = ensureOutsourceWorkSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return { success: true, items: [] };

  const fieldNameToPolyId = {};
  try {
    (getSavedPolygons() || []).forEach(function(p) {
      if (p && p.name && p.id) fieldNameToPolyId[String(p.name)] = p.id;
    });
  } catch (e) {}

  const data = sheet.getRange(2, 1, last - 1, OUTSOURCE_WORK_HEADERS_.length).getValues();
  const items = [];
  for (let i = 0; i < data.length; i++) {
    const workName = String(data[i][0] || '').trim();
    const vendor = String(data[i][1] || '').trim();
    const cropName = String(data[i][2] || '').trim();
    const fieldName = String(data[i][3] || '').trim();
    const schedDateRaw = data[i][4];
    const deadlineRaw = data[i][5];
    const hours = String(data[i][6] || '').trim();
    const requester = String(data[i][7] || '').trim();
    const compDate = data[i][8];
    const notes = String(data[i][9] || '').trim();
    const polyId = String(data[i][10] || '').trim();
    if (!workName && !fieldName) continue;
    if (compDate) continue;

    let isOverdue = false;
    if (deadlineRaw) {
      const dl = new Date(deadlineRaw);
      dl.setHours(0, 0, 0, 0);
      if (dl < today) isOverdue = true;
    }
    items.push({
      workName: workName,
      vendor: vendor,
      cropName: cropName,
      fieldName: fieldName,
      schedDate: formatOutsourceDateCell_(schedDateRaw),
      deadline: formatOutsourceDateCell_(deadlineRaw),
      hours: hours,
      requester: requester,
      notes: notes,
      isOverdue: isOverdue,
      sheetRow: i + 2,
      scheduleKey: buildOutsourceWorkKey_(workName, fieldName, cropName, schedDateRaw, deadlineRaw),
      polyId: polyId || fieldNameToPolyId[fieldName] || ''
    });
  }
  return { success: true, items: items };
}

function addOutsourceWorkRequest(params) {
  params = params || {};
  const workName = String(params.workName || '').trim();
  if (!workName) throw new Error('作業名を入力してください');
  const vendor = String(params.vendor || params.dept || '').trim();
  const fieldName = String(params.fieldName || '').trim();
  const cropName = String(params.cropName || '').trim();
  let schedDateStr = '';
  if (params.schedDate) {
    try { schedDateStr = Utilities.formatDate(new Date(params.schedDate), 'Asia/Tokyo', 'yyyy/MM/dd'); } catch (e) { schedDateStr = String(params.schedDate); }
  }
  let deadlineStr = '';
  if (params.deadline) {
    try { deadlineStr = Utilities.formatDate(new Date(params.deadline), 'Asia/Tokyo', 'yyyy/MM/dd'); } catch (e) { deadlineStr = String(params.deadline); }
  }
  const hours = String(params.hours || '').trim();
  const requester = String(params.requester || params.person || params.userName || '').trim();
  const notes = String(params.notes || '').trim();
  const polyId = String(params.polyId || '').trim();

  const sheet = ensureOutsourceWorkSheet_();
  sheet.appendRow([workName, vendor, cropName, fieldName, schedDateStr, deadlineStr, hours, requester, '', notes, polyId]);
  writeLog(requester || 'ユーザー', '依頼作業追加', fieldName || workName,
    `作業名: ${workName}, 依頼先: ${vendor || '未指定'}, 予定日: ${schedDateStr || '未指定'}`);
  return { success: true, workName: workName, vendor: vendor, fieldName: fieldName };
}

function completeOutsourceWork(params) {
  params = params || {};
  const userName = String(params.userName || '').trim() || 'ユーザー';
  const sheet = ensureOutsourceWorkSheet_();
  const data = sheet.getDataRange().getValues();
  let targetRow = parseInt(params.sheetRow, 10);
  if (!(targetRow >= 2 && targetRow <= data.length)) {
    targetRow = 0;
    const wantKey = String(params.scheduleKey || '').trim();
    const wantName = String(params.workName || '').trim();
    const wantField = String(params.fieldName || '').trim();
    const wantCrop = String(params.cropName || '').trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][8] || '').trim()) continue;
      const key = buildOutsourceWorkKey_(data[i][0], data[i][3], data[i][2], data[i][4], data[i][5]);
      if (wantKey && key === wantKey) { targetRow = i + 1; break; }
      if (!wantKey && wantName
          && String(data[i][0] || '').trim() === wantName
          && String(data[i][3] || '').trim() === wantField
          && String(data[i][2] || '').trim() === wantCrop) {
        targetRow = i + 1;
        break;
      }
    }
  }
  if (!(targetRow >= 2 && targetRow <= data.length)) {
    throw new Error('完了対象の依頼作業が見つかりませんでした');
  }
  const rowData = data[targetRow - 1] || [];
  if (String(rowData[8] || '').trim()) throw new Error('この依頼作業は既に完了済みです');
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');
  sheet.getRange(targetRow, 9).setValue(today);
  writeLog(userName, '依頼作業完了', String(rowData[3] || ''), `作業名: ${rowData[0]}, 依頼先: ${rowData[1]}`);
  return { success: true, sheetRow: targetRow };
}

function deleteOutsourceWork(params) {
  params = params || {};
  const userName = String(params.userName || '').trim() || 'ユーザー';
  const sheet = ensureOutsourceWorkSheet_();
  const data = sheet.getDataRange().getValues();
  let targetRow = parseInt(params.sheetRow, 10);
  if (!(targetRow >= 2 && targetRow <= data.length)) {
    targetRow = 0;
    const wantKey = String(params.scheduleKey || '').trim();
    const wantName = String(params.workName || '').trim();
    const wantField = String(params.fieldName || '').trim();
    const wantCrop = String(params.cropName || '').trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][8] || '').trim()) continue;
      const key = buildOutsourceWorkKey_(data[i][0], data[i][3], data[i][2], data[i][4], data[i][5]);
      if (wantKey && key === wantKey) { targetRow = i + 1; break; }
      if (!wantKey && wantName
          && String(data[i][0] || '').trim() === wantName
          && String(data[i][3] || '').trim() === wantField
          && String(data[i][2] || '').trim() === wantCrop) {
        targetRow = i + 1;
        break;
      }
    }
  }
  if (!(targetRow >= 2 && targetRow <= data.length)) {
    throw new Error('削除対象の依頼作業が見つかりませんでした');
  }
  const rowData = data[targetRow - 1] || [];
  if (String(rowData[8] || '').trim()) throw new Error('この依頼作業は既に完了済みです');
  sheet.deleteRow(targetRow);
  writeLog(userName, '依頼作業削除', String(rowData[3] || ''), `作業名: ${rowData[0]}, 依頼先: ${rowData[1]}`);
  return { success: true, sheetRow: targetRow };
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
    sheet.appendRow([cropName, 0, newColor, '']); // なければ新規追加
  }
  return newColor;
}
// ==========================================
// 🚜 全体収穫（ロット生成）★1畑＝1ロット
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
        fieldLocationMap[String(fData[i][1]).trim()] = fData[i][2] || '未設定'; // C列(2)が拠点
      }
    }
  }

  // ② 指定日の「作業記録」から、指定拠点＆指定作物の「収穫」畑を検索（候補）
  const workSheet = ss.getSheetByName('作業記録');
  let harvestedFields = [];
  if (workSheet) {
    const wData = workSheet.getDataRange().getValues();
    for (let i = 1; i < wData.length; i++) {
      try {
        const d = new Date(wData[i][3]); // D列(3): 作業日
        if (!isNaN(d.getTime())) {
          const recordDate = Utilities.formatDate(d, "JST", "yyyy/MM/dd");
          const wName = String(wData[i][4]); // E列(4): 作業名
          const cropName = String(wData[i][5]); // F列(5): 作物名
          const fieldRaw = String(wData[i][1] || ''); // B列(1): 圃場名
          const primaryField = fieldRaw.split(',')[0].trim();
          if (!primaryField) continue;
          const fieldLoc = fieldLocationMap[primaryField] || '未設定';

          if (recordDate === targetDateStr && wName.indexOf('収穫') >= 0 && cropName === params.crop && fieldLoc === params.location) {
            harvestedFields.push(primaryField);
          }
        }
      } catch (e) {}
    }
  }
  const uniqueHarvested = [];
  harvestedFields.forEach(function(f) {
    if (uniqueHarvested.indexOf(f) < 0) uniqueHarvested.push(f);
  });

  // ③ 1畑＝1ロット: 圃場は明示指定を優先。未指定なら候補が1件のときだけ自動
  let fieldNamesStr = String(params.fieldName || params.fields || '').trim();
  // 旧形式の複数畑カンマ連結は拒否（トレーサビリティのため）
  if (fieldNamesStr && (fieldNamesStr.indexOf(' , ') >= 0 || fieldNamesStr.indexOf(',') >= 0)) {
    const parts = fieldNamesStr.split(/\s*,\s*/).map(function(s) { return s.trim(); }).filter(Boolean);
    if (parts.length > 1) {
      throw new Error('1ロットにつき畑は1つだけ指定してください（複数畑は分けてロット作成）');
    }
    fieldNamesStr = parts[0] || '';
  }
  if (!fieldNamesStr) {
    if (uniqueHarvested.length === 1) {
      fieldNamesStr = uniqueHarvested[0];
    } else if (uniqueHarvested.length > 1) {
      throw new Error('同日・同作物で複数畑の収穫があります。畑を1つ選んでロットを作成してください: ' + uniqueHarvested.join(' / '));
    } else {
      throw new Error('紐付ける畑が指定されていません。作業記録から取り込むか、畑を選択してください');
    }
  }

  // ④ ロット記録に保存（内容単位・内容個数はクライアント入力を優先、なければマスタ）
  const lotSheet = getOrCreateRecordSheet('ロット記録');
  ensureLotRecordContentHeaders_(lotSheet);

  const lotId = "L-" + String(targetDateStr).replace(/\//g, '')
    + "-" + Utilities.formatDate(new Date(), "JST", "HHmm")
    + Math.floor(Math.random() * 10);
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
    qtyList = params.contentQtys.map(function(v) {
      const n = Number(v);
      return (isFinite(n) && n >= 0) ? n : 0;
    });
  }
  const mode = String(params.contentMode || (qtyList.length ? 'individual' : 'uniform')).trim() || 'uniform';

  if (qtyList.length > 0) {
    const total = qtyList.reduce(function(s, n) { return s + n; }, 0);
    const allSame = qtyList.every(function(n) { return n === qtyList[0]; });
    contentQty = allSame ? qtyList[0] : (Math.round((total / qtyList.length) * 1000) / 1000);
    contentDetail = JSON.stringify({
      mode: mode,
      unit: contentUnit,
      qtys: qtyList,
      total: total,
      uniformQty: params.uniformQty != null ? Number(params.uniformQty) : (allSame ? qtyList[0] : ''),
      remainderCount: params.remainderCount != null ? Number(params.remainderCount) : 0,
      remainderQty: params.remainderQty != null ? Number(params.remainderQty) : '',
      fieldName: fieldNamesStr,
      polyId: String(params.polyId || '').trim(),
      harvestDate: targetDateStr
    });
  } else if (params.contentQty !== '' && params.contentQty != null) {
    const parsed = Number(params.contentQty);
    if (isFinite(parsed) && parsed >= 0) contentQty = parsed;
  } else if (masterHit && masterHit.contentQty !== '' && masterHit.contentQty != null) {
    contentQty = Number(masterHit.contentQty) || 0;
  }
  if (!contentDetail) {
    contentDetail = JSON.stringify({
      mode: mode,
      unit: contentUnit,
      fieldName: fieldNamesStr,
      polyId: String(params.polyId || '').trim(),
      harvestDate: targetDateStr
    });
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
    ? qtyList.reduce(function(s, n) { return s + n; }, 0)
    : ((Number(params.count) || 0) * (Number(contentQty) || 0));
  writeLog(params.author, "ロット生成(1畑×1日)", lotId, `拠点: ${params.location}, 日付: ${targetDateStr}, 作物: ${params.crop}, 畑: ${fieldNamesStr}, 内容: ${contentQty}${contentUnit}, 合計: ${totalForLog}`);
  return {
    lotId: lotId,
    fields: fieldNamesStr,
    fieldName: fieldNamesStr,
    harvestDate: targetDateStr,
    polyId: String(params.polyId || '').trim(),
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
function saveNoukiMachinePhoto_(photoObj) {
  if (!photoObj) return '';
  let base64 = '';
  let filename = 'machine.jpg';
  if (typeof photoObj === 'string') {
    base64 = photoObj;
  } else {
    base64 = photoObj.base64 || photoObj.photoBase64 || '';
    filename = photoObj.filename || photoObj.photoFilename || filename;
  }
  if (!base64 || String(base64).indexOf(',') < 0) return '';
  try {
    const splitBase = String(base64).split(',');
    const type = splitBase[0].split(';')[0].replace('data:', '') || 'image/jpeg';
    const blob = Utilities.newBlob(Utilities.base64Decode(splitBase[1]), type, filename);
    const folders = DriveApp.getFoldersByName("情熱MAP_農機写真");
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("情熱MAP_農機写真");
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000";
  } catch (e) {
    return '';
  }
}

function addMachineToSign(params) {
  const sheet = ensureNoukiMasterSheet();
  const newId = 'MAC-' + Utilities.getUuid().substring(0,8);

  let photo1Url = params.photo || "";
  let photo2Url = params.photo2 || "";
  // photoBase64 と photos[0] は同じ写真の二重指定になりやすいので、片方だけ保存する
  if (params.photoBase64) {
    const u = saveNoukiMachinePhoto_({ base64: params.photoBase64, filename: params.photoFilename || "photo.jpg" });
    if (u) photo1Url = u;
  } else if (params.photos && params.photos.length > 0) {
    const u = saveNoukiMachinePhoto_(params.photos[0]);
    if (u) photo1Url = u;
  }
  if (params.photos && params.photos.length > 1) {
    const u = saveNoukiMachinePhoto_(params.photos[1]);
    if (u) photo2Url = u;
  }
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
// 農機の部品を新規追加/編集/削除する
// ==========================================
function addMachinePart(params) {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('農機マスタ');
  if(!sheet) throw new Error("農機マスタシートがありません");
  
  const data = sheet.getDataRange().getValues();
  let updatedCount = 0;
  for(let i=1; i<data.length; i++) {
    const rowId = String(data[i][0] || "");
    const rowCat = String(data[i][2] || "");
    const matchId = params.machineId && rowId === String(params.machineId);
    const matchCat = params.category && rowCat === String(params.category);
    
    if (matchId || matchCat || (!params.machineId && !params.category)) {
      if (params.fullParts != null) {
        sheet.getRange(i+1, 12).setValue(String(params.fullParts || ""));
        updatedCount++;
      } else if (params.oldPart && params.newPart) {
        let parts = String(data[i][11] || "").split(/[,、]/).map(p => p.trim()).filter(Boolean);
        const idx = parts.indexOf(params.oldPart);
        if (idx !== -1) {
          parts[idx] = params.newPart;
          sheet.getRange(i+1, 12).setValue(parts.join(','));
          updatedCount++;
        }
      } else if (params.deletePart) {
        let parts = String(data[i][11] || "").split(/[,、]/).map(p => p.trim()).filter(p => p && p !== params.deletePart);
        sheet.getRange(i+1, 12).setValue(parts.join(','));
        updatedCount++;
      } else if (params.newPart) {
        let parts = String(data[i][11] || "").split(/[,、]/).map(p => p.trim()).filter(Boolean);
        if (!parts.includes(params.newPart)) {
          parts.push(params.newPart);
          sheet.getRange(i+1, 12).setValue(parts.join(','));
          updatedCount++;
        }
      }
    }
  }
  return updatedCount;
}
// ==========================================
// 農機の症状を自動追加/編集/削除する
// ==========================================
function addMachineSymptom(params) {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('農機マスタ');
  if(!sheet) throw new Error("農機マスタシートがありません");
  
  const data = sheet.getDataRange().getValues();
  let updatedCount = 0;
  for(let i=1; i<data.length; i++) {
    const rowId = String(data[i][0] || "");
    const rowCat = String(data[i][2] || "");
    const matchId = params.machineId && rowId === String(params.machineId);
    const matchCat = params.category && rowCat === String(params.category);
    
    if (matchId || matchCat || (!params.machineId && !params.category)) {
      if (params.fullSymptoms != null) {
        sheet.getRange(i+1, 15).setValue(String(params.fullSymptoms || ""));
        updatedCount++;
      } else if (params.oldSymptom && params.newSymptom) {
        let symps = String(data[i][14] || "").split(/[,、]/).map(s => s.trim()).filter(Boolean);
        const idx = symps.indexOf(params.oldSymptom);
        if (idx !== -1) {
          symps[idx] = params.newSymptom;
          sheet.getRange(i+1, 15).setValue(symps.join(','));
          updatedCount++;
        }
      } else if (params.deleteSymptom) {
        let symps = String(data[i][14] || "").split(/[,、]/).map(s => s.trim()).filter(s => s && s !== params.deleteSymptom);
        sheet.getRange(i+1, 15).setValue(symps.join(','));
        updatedCount++;
      } else if (params.newSymptom) {
        let symps = String(data[i][14] || "").split(/[,、]/).map(s => s.trim()).filter(Boolean);
        if (!symps.includes(params.newSymptom)) {
          symps.push(params.newSymptom);
          sheet.getRange(i+1, 15).setValue(symps.join(','));
          updatedCount++;
        }
      }
    }
  }
  return updatedCount;
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
// 品種登録 (ファイル付き)
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
      sheet.appendRow(['作物', '品種', 'まき時期', '産地', '播種', '定植', '収穫', 'ファイルURL', '特性', 'メーカー', '粒数']);
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

    let grainColIndex = headers.indexOf('粒数') + 1;
    if (grainColIndex === 0) {
      grainColIndex = headers.length + 1;
      sheet.getRange(1, grainColIndex).setValue('粒数');
      headers.push('粒数');
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
          sheet.getRange(i + 1, fileUrlColIndex).setValue(fileUrl);
        }
        if (params.characteristics !== undefined && params.characteristics !== null) {
          sheet.getRange(i + 1, charColIndex).setValue(params.characteristics);
        }
        if (params.maker !== undefined && params.maker !== null) {
          sheet.getRange(i + 1, makerColIndex).setValue(params.maker);
        }
        if (params.grainCount !== undefined && params.grainCount !== null) {
          sheet.getRange(i + 1, grainColIndex).setValue(params.grainCount);
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
      newRow[grainColIndex - 1] = (params.grainCount !== undefined && params.grainCount !== null) ? params.grainCount : '';
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

// スキルツリー用：指定ユーザーが道具を借りた履歴だけを返す
function getToolUsageHistory(params) {
  const logSheet = TENANT_SS.getSheetByName('道具記録');
  const userName = String(params.userName || '').trim();
  if (!logSheet || !userName) return { success: true, usageRecords: [] };

  const values = logSheet.getDataRange().getValues();
  const usageRecords = [];
  const operatorMarker = `(操作者: ${userName})`;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const status = String(row[6] || '').trim();
    const actionLog = String(row[4] || '');
    if (status !== '貸出中' || !actionLog.includes(operatorMarker)) continue;

    usageRecords.push({
      toolId: String(row[0] || ''),
      date: row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
      name: String(row[2] || '道具'),
      regNumber: String(row[3] || '')
    });
  }

  return { success: true, usageRecords: usageRecords };
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

  let photo = existing.photo || '';
  let photo2 = existing.photo2 || '';
  if (params.clearPhoto) photo = '';
  if (params.clearPhoto2) photo2 = '';
  // photoBase64 と photos[0] の二重アップロードを防止
  if (params.photoBase64) {
    const u = saveNoukiMachinePhoto_({ base64: params.photoBase64, filename: params.photoFilename || 'machine.jpg' });
    if (u) photo = u;
  } else if (params.photos && params.photos[0]) {
    const u = saveNoukiMachinePhoto_(params.photos[0]);
    if (u) photo = u;
  }
  if (params.photos && params.photos[1]) {
    const u = saveNoukiMachinePhoto_(params.photos[1]);
    if (u) photo2 = u;
  }
  if (params.photo && !params.photoBase64 && !(params.photos && params.photos[0]) && !params.clearPhoto) {
    photo = params.photo;
  }

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
    signName: params.signName != null ? params.signName : existing.signName,
    photo: photo,
    photo2: photo2
  });
  const row = buildNoukiMachineRow(merged);
  sheet.getRange(targetRowIndex, 1, 1, row.length).setValues([row]);
  return { success: true, machine: parseNoukiMachineRow(row) };
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

    // 🌟 日本国内の座標領域（北緯20〜46度, 東経122〜154度）以外、または (0,0) 等の衛星ノイズ・誤測位位置情報を判定
    const lat = parseFloat(params.lat);
    const lng = parseFloat(params.lng);
    const isValidJapanPos = !isNaN(lat) && !isNaN(lng) && lat >= 20.0 && lat <= 46.0 && lng >= 122.0 && lng <= 154.0;

    // 移動トラッキングで不正座標（海の上や国外・(0,0)など）の場合は直線・ラインが伸びる原因となるため記録しない
    if (type === '移動' && !isValidJapanPos) {
      return "skipped_invalid_coords";
    }

    const saveLat = isValidJapanPos ? lat : '';
    const saveLng = isValidJapanPos ? lng : '';

    sheet.appendRow([timeStr, params.userName, saveLat, saveLng, type]);
    
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

    // 名簿ユーザー一覧のみ（軌跡メニューの対象ユーザー選択用）
    if (params && params.usersOnly) {
      return { trackingData: [], allUsers: allUsers };
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
      return t === '出勤' || t === 'アプリ起動' || t === '出勤取消' || t === '退勤取消' || t === '退勤' || t.indexOf('退勤(') === 0;
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

function roundClockHm5_(hm) {
  const p = String(hm || '').split(':');
  let h = parseInt(p[0], 10);
  let m = parseInt(p[1], 10);
  if (isNaN(h) || isNaN(m)) return '';
  m = Math.round(m / 5) * 5;
  if (m >= 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  if (h < 0) h = 0;
  if (h > 23) h = 23;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** 本人の過去出勤から、よく登録する時刻（5分丸め）を返す */
function getFrequentClockInTimes(params) {
  try {
    const userName = String((params && params.userName) || '').replace(/\s+/g, '');
    if (!userName) return { times: [], mostFrequent: '' };
    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('トラッキング');
    if (!sheet) return { times: [], mostFrequent: '' };
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { times: [], mostFrequent: '' };

    const startRow = Math.max(2, lastRow - 7999);
    const numRows = lastRow - startRow + 1;
    const values = sheet.getRange(startRow, 1, numRows, 5).getValues();
    const counts = {};

    for (let i = 0; i < values.length; i++) {
      const type = String(values[i][4] || '');
      if (type !== '出勤') continue;
      const rowUser = String(values[i][1] || '').replace(/\s+/g, '');
      if (!rowUser) continue;
      if (rowUser !== userName && userName.indexOf(rowUser) < 0 && rowUser.indexOf(userName) < 0) continue;
      const tObj = new Date(values[i][0]);
      if (isNaN(tObj.getTime())) continue;
      const hm = roundClockHm5_(Utilities.formatDate(tObj, 'Asia/Tokyo', 'HH:mm'));
      if (!hm) continue;
      counts[hm] = (counts[hm] || 0) + 1;
    }

    const times = Object.keys(counts).map(function (t) {
      return { time: t, count: counts[t] };
    }).sort(function (a, b) {
      return b.count - a.count || a.time.localeCompare(b.time);
    });
    return {
      times: times.slice(0, 5),
      mostFrequent: times.length ? times[0].time : ''
    };
  } catch (e) {
    throw new Error('よく使う出勤時間の取得エラー: ' + e.message);
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
      latestIsRest: false,
      lunchRegistered: false,
      lunchEnabled: false,
      lunchStart: '',
      lunchEnd: '',
      restBreaks: [],
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
    let latestIsRest = false;
    const restBreaks = [];

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
      const workName = String(values[i][4] || '').trim();
      const startTime = normTime(values[i][6]);
      const endTime = normTime(values[i][7]);
      if (workName.indexOf('休憩') >= 0) {
        restBreaks.push({
          workName: workName || '休憩',
          start: startTime,
          end: endTime
        });
      }
      if (endTime && (!latestEnd || endTime > latestEnd)) {
        latestEnd = endTime;
        latestIsRest = workName.indexOf('休憩') >= 0;
      }
    }

    restBreaks.sort(function(a, b) {
      return String(a.start || '').localeCompare(String(b.start || ''));
    });
    // 通常作業の 12:00 終了だけ昼休み再開へ。休憩記録の実終了は動かさない。
    if (latestEnd === '12:00' && !latestIsRest) latestEnd = '13:00';
    result.latestEndTime = latestEnd;
    result.latestIsRest = latestIsRest;
    result.restBreaks = restBreaks;
    return result;
  } catch (e) {
    throw new Error('作業時間ヒント取得エラー: ' + e.message);
  }
}

/** 合計時間文字列や開始・終了から実作業分を求める */
function parseWorkRecordMinutes_(totalTime, startTime, endTime, breakMins) {
  let mins = 0;
  const t = String(totalTime || '').trim();
  if (t) {
    const hm = t.match(/(\d+)\s*時間/);
    const mm = t.match(/(\d+)\s*分/);
    mins = (hm ? parseInt(hm[1], 10) * 60 : 0) + (mm ? parseInt(mm[1], 10) : 0);
    if (mins > 0) return mins;
    const asNum = parseInt(t, 10);
    if (!isNaN(asNum) && String(asNum) === t) return Math.max(0, asNum);
  }
  const normTime = (v) => {
    if (v instanceof Date && !isNaN(v.getTime())) {
      return Utilities.formatDate(v, 'JST', 'HH:mm');
    }
    const s = String(v || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return '';
    return ('0' + m[1]).slice(-2) + ':' + m[2];
  };
  const st = normTime(startTime);
  const et = normTime(endTime);
  if (st && et) {
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    const br = Math.max(0, parseInt(breakMins, 10) || 0);
    return Math.max(0, diff - br);
  }
  return 0;
}

/**
 * 作業記録シートの期間集計（Schedule画面の分析用）
 * params: fromYmd, toYmd, author（任意・部分一致）
 */
function getWorkRecordAnalysis(params) {
  const todayYmd = Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
  let toYmd = String((params && params.toYmd) || todayYmd).trim() || todayYmd;
  let fromYmd = String((params && params.fromYmd) || '').trim();
  if (!fromYmd) {
    fromYmd = toYmd.slice(0, 8) + '01';
  }
  const authorFilter = String((params && params.author) || '').replace(/\s+/g, '');
  const workFilter = String((params && params.workName) || '').trim();
  const includeRecords = !(params && params.includeRecords === false);

  const emptyHour = [];
  for (let h = 0; h < 24; h++) {
    emptyHour.push({ name: ('0' + h).slice(-2), hour: h, count: 0, minutes: 0 });
  }
  const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const emptyWeekday = weekdayNames.map(function(n, i) {
    return { name: n, weekday: i, count: 0, minutes: 0 };
  });

  const empty = {
    fromYmd: fromYmd,
    toYmd: toYmd,
    summary: {
      count: 0, totalMinutes: 0, people: 0, fields: 0, works: 0,
      workDays: 0, avgMinutesPerDay: 0, avgMinutesPerRecord: 0,
      earliestStart: '', latestEnd: ''
    },
    byPerson: [],
    byWork: [],
    byField: [],
    byCrop: [],
    byDay: [],
    byHour: emptyHour,
    byWeekday: emptyWeekday,
    authors: [],
    workNames: [],
    records: []
  };

  const sheet = TENANT_SS.getSheetByName('作業記録');
  if (!sheet || sheet.getLastRow() <= 1) return empty;

  const lastRow = sheet.getLastRow();
  const startRow = Math.max(2, lastRow - 7999);
  const numRows = lastRow - startRow + 1;
  const values = sheet.getRange(startRow, 1, numRows, 13).getValues();

  const byPerson = {};
  const byPersonDays = {};
  const byWork = {};
  const byField = {};
  const byCrop = {};
  const byDay = {};
  const byHour = {};
  const byWeekday = {};
  for (let h = 0; h < 24; h++) byHour[h] = { name: ('0' + h).slice(-2), hour: h, count: 0, minutes: 0 };
  for (let w = 0; w < 7; w++) byWeekday[w] = { name: weekdayNames[w], weekday: w, count: 0, minutes: 0 };

  const authorSet = {};
  const workNameSet = {};
  const fieldSet = {};
  const cropSet = {};
  const daySet = {};
  const records = [];
  let totalMinutes = 0;
  let count = 0;
  let earliestStart = '';
  let latestEnd = '';

  const bump = (map, key, mins) => {
    const k = key || '（未設定）';
    if (!map[k]) map[k] = { name: k, count: 0, minutes: 0 };
    map[k].count += 1;
    map[k].minutes += mins;
  };

  const normTimeHm = (v) => {
    if (v instanceof Date && !isNaN(v.getTime())) {
      return Utilities.formatDate(v, 'JST', 'HH:mm');
    }
    const s = String(v || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return '';
    return ('0' + m[1]).slice(-2) + ':' + m[2];
  };

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const workName = String(row[4] || '').trim();
    if (!workName) continue;

    const workDateYmd = formatWorkDateYmd_(row[3]);
    if (!workDateYmd) continue;
    if (workDateYmd < fromYmd || workDateYmd > toYmd) continue;

    const author = String(row[2] || '').trim() || '（不明）';
    const authorKey = author.replace(/\s+/g, '');
    if (authorFilter && authorKey.indexOf(authorFilter) < 0 && authorFilter.indexOf(authorKey) < 0) continue;
    if (workFilter && workName.indexOf(workFilter) < 0) continue;

    const fieldRaw = String(row[1] || '').trim();
    const fieldName = fieldRaw.split(',')[0].trim() || '（場所なし）';
    const cropName = String(row[5] || '').trim() || '（作物なし）';
    const mins = parseWorkRecordMinutes_(row[9], row[6], row[7], 0);
    const progress = String(row[10] || '').trim();
    const recordId = String(row[12] || '').trim();
    const startHm = normTimeHm(row[6]);
    const endHm = normTimeHm(row[7]);

    count += 1;
    totalMinutes += mins;
    authorSet[author] = true;
    workNameSet[workName] = true;
    fieldSet[fieldName] = true;
    cropSet[cropName] = true;
    daySet[workDateYmd] = true;

    bump(byPerson, author, mins);
    if (!byPersonDays[author]) byPersonDays[author] = {};
    byPersonDays[author][workDateYmd] = true;
    bump(byWork, workName, mins);
    bump(byField, fieldName, mins);
    bump(byCrop, cropName, mins);
    bump(byDay, workDateYmd, mins);

    if (startHm) {
      const hour = parseInt(startHm.slice(0, 2), 10);
      if (!isNaN(hour) && byHour[hour]) {
        byHour[hour].count += 1;
        byHour[hour].minutes += mins;
      }
      if (!earliestStart || startHm < earliestStart) earliestStart = startHm;
    }
    if (endHm && (!latestEnd || endHm > latestEnd)) latestEnd = endHm;

    try {
      const parts = workDateYmd.split('-');
      const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const wd = dt.getDay();
      if (byWeekday[wd]) {
        byWeekday[wd].count += 1;
        byWeekday[wd].minutes += mins;
      }
    } catch (eWd) {}

    if (includeRecords && records.length < 300) {
      records.push({
        workDate: workDateYmd,
        author: author,
        workName: workName,
        crop: cropName,
        fieldName: fieldName,
        startTime: startHm,
        endTime: endHm,
        totalTime: String(row[9] || ''),
        minutes: mins,
        progress: progress,
        recordId: recordId
      });
    }
  }

  const sortDesc = (map) => Object.keys(map).map(k => map[k])
    .sort((a, b) => b.minutes - a.minutes || b.count - a.count || String(a.name).localeCompare(String(b.name), 'ja'));

  const byDayArr = Object.keys(byDay).sort().map(k => byDay[k]);
  const workDays = Object.keys(daySet).length;
  const avgMinutesPerDay = workDays ? Math.round(totalMinutes / workDays) : 0;
  const avgMinutesPerRecord = count ? Math.round(totalMinutes / count) : 0;

  // byPerson に稼働日数・1日平均を付与
  const personList = sortDesc(byPerson).map(function(p) {
    const days = byPersonDays[p.name] ? Object.keys(byPersonDays[p.name]).length : 0;
    return {
      name: p.name,
      count: p.count,
      minutes: p.minutes,
      workDays: days,
      avgMinutesPerDay: days ? Math.round(p.minutes / days) : 0
    };
  });

  records.sort((a, b) => String(b.workDate).localeCompare(String(a.workDate))
    || String(b.endTime).localeCompare(String(a.endTime)));

  return {
    fromYmd: fromYmd,
    toYmd: toYmd,
    summary: {
      count: count,
      totalMinutes: totalMinutes,
      people: Object.keys(authorSet).length,
      fields: Object.keys(fieldSet).length,
      works: Object.keys(workNameSet).length,
      workDays: workDays,
      avgMinutesPerDay: avgMinutesPerDay,
      avgMinutesPerRecord: avgMinutesPerRecord,
      earliestStart: earliestStart,
      latestEnd: latestEnd
    },
    byPerson: personList,
    byWork: sortDesc(byWork),
    byField: sortDesc(byField),
    byCrop: sortDesc(byCrop),
    byDay: byDayArr,
    byHour: Object.keys(byHour).sort(function(a, b) { return Number(a) - Number(b); }).map(function(k) { return byHour[k]; }),
    byWeekday: [0, 1, 2, 3, 4, 5, 6].map(function(k) { return byWeekday[k]; }),
    authors: Object.keys(authorSet).sort((a, b) => a.localeCompare(b, 'ja')),
    workNames: Object.keys(workNameSet).sort((a, b) => a.localeCompare(b, 'ja')),
    records: records
  };
}

// ==========================================
// 📍 開いている出勤の時刻を更新（昼休憩登録後も出勤時間を直せる）
// ==========================================
function updateOpenClockInTime(params) {
  try {
    const userName = String((params && params.userName) || '').replace(/\s+/g, '');
    const clockInTime = String((params && params.clockInTime) || '').trim();
    if (!userName) return { success: false, error: 'ユーザー名がありません' };
    const hm = clockInTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!hm) return { success: false, error: '出勤時間が不正です' };
    const padHm = ('0' + hm[1]).slice(-2) + ':' + hm[2];

    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('トラッキング');
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: false, error: '出勤中の記録がありません' };
    }

    const lastRow = sheet.getLastRow();
    const startRow = Math.max(2, lastRow - 4999);
    const numRows = lastRow - startRow + 1;
    const values = sheet.getRange(startRow, 1, numRows, 5).getValues();

    let openRow = -1;
    let openMs = null;
    let lastClosedRow = -1;
    let lastClosedMs = null;
    for (let i = 0; i < values.length; i++) {
      const rowUser = String(values[i][1] || '').replace(/\s+/g, '');
      if (!rowUser) continue;
      if (rowUser !== userName && userName.indexOf(rowUser) < 0 && rowUser.indexOf(userName) < 0) continue;

      const type = String(values[i][4] || '');
      const tObj = new Date(values[i][0]);
      if (isNaN(tObj.getTime())) continue;

      const isIn = (type === '出勤' || type === 'アプリ起動');
      const isOut = (type === '退勤' || type.indexOf('退勤(') === 0);
      const isClockInCancel = (type === '出勤取消');
      const isClockOutCancel = (type === '退勤取消');

      if (isIn) {
        openRow = startRow + i;
        openMs = tObj.getTime();
        lastClosedRow = -1;
        lastClosedMs = null;
      } else if (isOut) {
        lastClosedRow = openRow;
        lastClosedMs = openMs;
        openRow = -1;
        openMs = null;
      } else if (isClockOutCancel) {
        if (lastClosedRow >= 0 && lastClosedMs != null) {
          openRow = lastClosedRow;
          openMs = lastClosedMs;
          lastClosedRow = -1;
          lastClosedMs = null;
        }
      } else if (isClockInCancel) {
        openRow = -1;
        openMs = null;
        lastClosedRow = -1;
        lastClosedMs = null;
      }
    }

    if (openRow < 0 || openMs == null) {
      return { success: false, error: '出勤中の記録がありません' };
    }

    let dateYmd = String((params && params.clockInDateYmd) || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
      dateYmd = Utilities.formatDate(new Date(openMs), 'JST', 'yyyy-MM-dd');
    }

    let timeMs = params && params.time ? Number(params.time) : NaN;
    if (isNaN(timeMs) || timeMs <= 0) {
      const y = Number(dateYmd.slice(0, 4));
      const mo = Number(dateYmd.slice(5, 7));
      const d = Number(dateYmd.slice(8, 10));
      const hh = Number(hm[1]);
      const mm = Number(hm[2]);
      // スクリプトのタイムゾーン（通常 JST）で壁時計時刻を作る
      timeMs = new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();
    }

    sheet.getRange(openRow, 1).setValue(new Date(timeMs).toISOString());
    return {
      success: true,
      clockInTime: padHm,
      clockInDateYmd: dateYmd
    };
  } catch (e) {
    throw new Error('出勤時間更新エラー: ' + e.message);
  }
}

// 📍 未退勤（開いている出勤）の有無をサーバーで判定
// ==========================================
function getOpenClockInStatus(params) {
  try {
    const userName = String((params && params.userName) || '').replace(/\s+/g, '');
    if (!userName) return { open: false, forgot: false, lunchRegistered: false, cancelableClockOut: false };

    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('トラッキング');
    const todayYmd = Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
    if (!sheet || sheet.getLastRow() <= 1) {
      return { open: false, forgot: false, lunchRegistered: false, cancelableClockOut: false, todayYmd: todayYmd };
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
    let lastClosed = null; // { openIn, lunch, outMs }

    for (let i = 0; i < values.length; i++) {
      const rowUser = String(values[i][1] || '').replace(/\s+/g, '');
      if (!rowUser) continue;
      if (rowUser !== userName && userName.indexOf(rowUser) < 0 && rowUser.indexOf(userName) < 0) continue;

      const type = String(values[i][4] || '');
      const tObj = new Date(values[i][0]);
      if (isNaN(tObj.getTime())) continue;

      const isIn = (type === '出勤' || type === 'アプリ起動');
      const isOut = (type === '退勤' || type.indexOf('退勤(') === 0);
      const isClockInCancel = (type === '出勤取消');
      const isClockOutCancel = (type === '退勤取消');

      if (isIn) {
        openIn = { ms: tObj.getTime() };
        lunch = null;
        lastClosed = null;
      } else if (isOut) {
        lastClosed = { openIn: openIn, lunch: lunch, outMs: tObj.getTime() };
        openIn = null;
        lunch = null;
      } else if (isClockOutCancel) {
        if (lastClosed && lastClosed.openIn) {
          openIn = lastClosed.openIn;
          lunch = lastClosed.lunch;
          lastClosed = null;
        }
      } else if (isClockInCancel) {
        openIn = null;
        lunch = null;
        lastClosed = null;
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

    if (openIn) {
      const clockInDateYmd = Utilities.formatDate(new Date(openIn.ms), 'JST', 'yyyy-MM-dd');
      const clockInTime = Utilities.formatDate(new Date(openIn.ms), 'JST', 'HH:mm');
      return {
        open: true,
        forgot: clockInDateYmd < todayYmd,
        clockInDateYmd: clockInDateYmd,
        clockInTime: clockInTime,
        todayYmd: todayYmd,
        cancelableClockOut: false,
        lunchRegistered: !!(lunch && lunch.registered),
        lunchEnabled: !!(lunch && lunch.enabled),
        lunchStart: (lunch && lunch.start) || '',
        lunchEnd: (lunch && lunch.end) || ''
      };
    }

    // 本日退勤済みなら、同日中は取り消し可能として返す
    if (lastClosed && lastClosed.openIn && lastClosed.outMs) {
      const outDateYmd = Utilities.formatDate(new Date(lastClosed.outMs), 'JST', 'yyyy-MM-dd');
      if (outDateYmd === todayYmd) {
        const inLunch = lastClosed.lunch;
        return {
          open: false,
          forgot: false,
          cancelableClockOut: true,
          clockInDateYmd: Utilities.formatDate(new Date(lastClosed.openIn.ms), 'JST', 'yyyy-MM-dd'),
          clockInTime: Utilities.formatDate(new Date(lastClosed.openIn.ms), 'JST', 'HH:mm'),
          clockOutTime: Utilities.formatDate(new Date(lastClosed.outMs), 'JST', 'HH:mm'),
          clockOutDateYmd: outDateYmd,
          todayYmd: todayYmd,
          lunchRegistered: !!(inLunch && inLunch.registered),
          lunchEnabled: !!(inLunch && inLunch.enabled),
          lunchStart: (inLunch && inLunch.start) || '',
          lunchEnd: (inLunch && inLunch.end) || ''
        };
      }
    }

    return { open: false, forgot: false, lunchRegistered: false, cancelableClockOut: false, todayYmd: todayYmd };
  } catch (e) {
    throw new Error('出退勤状態取得エラー: ' + e.message);
  }
}

function ensureClockConfirmSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('退勤確認');
  if (!sheet) {
    sheet = ss.insertSheet('退勤確認');
    sheet.getRange(1, 1, 1, 7).setValues([['日付', '対象ユーザー', '出勤', '退勤', 'メモ', '確認者', '確認日時']]);
    try { sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#e0e0e0'); } catch (e) {}
  }
  return sheet;
}

function attYmdJst_(d) {
  return Utilities.formatDate(d, 'JST', 'yyyy-MM-dd');
}

function attHmJst_(d) {
  return Utilities.formatDate(d, 'JST', 'HH:mm');
}

function normClockUser_(name) {
  return String(name || '').replace(/\s+/g, '');
}

function parseClockOutNote_(type) {
  const t = String(type || '');
  const m = t.match(/^退勤[（(](.+)[）)]$/);
  return m ? String(m[1] || '').trim() : '';
}

function getStaffClockBoard(params) {
  const requesterId = String((params && params.requesterId) || (params && params.userId) || '').trim();
  const requester = findMeiboUser_(requesterId, params && params.requesterName);
  if (!requester || !attIsAdminRole_(requester.role)) {
    return { success: false, message: '管理者のみ閲覧できます' };
  }
  const todayYmd = attYmdJst_(new Date());
  const dateYmd = String((params && params.dateYmd) || todayYmd).trim() || todayYmd;

  const ss = TENANT_SS;
  const meibo = ss.getSheetByName('名簿');
  const members = [];
  if (meibo) {
    const md = meibo.getDataRange().getValues();
    for (let i = 1; i < md.length; i++) {
      const userId = String(md[i][0] || '').trim();
      const userName = String(md[i][2] || '').trim();
      const role = String(md[i][3] || '').trim();
      if (!userName) continue;
      members.push({ userId: userId, userName: userName, role: role, key: normClockUser_(userName) });
    }
  }

  function emptyClockState_(m) {
    return {
      userId: m.userId || '',
      userName: m.userName || '',
      role: m.role || '',
      status: 'none',
      clockInTime: '',
      clockInDateYmd: '',
      clockOutTime: '',
      clockOutDateYmd: '',
      clockOutNote: '',
      forgot: false,
      lunchNote: '',
      confirmed: false,
      confirmedBy: '',
      confirmedAt: ''
    };
  }

  const stateMap = {};
  members.forEach(function (m) {
    stateMap[m.key] = emptyClockState_(m);
  });

  const sheet = ss.getSheetByName('トラッキング');
  if (sheet && sheet.getLastRow() > 1) {
    const lastRow = sheet.getLastRow();
    const startRow = Math.max(2, lastRow - 7999);
    const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();
    const openByUser = {};
    const lunchByUser = {};
    const lastClosedByUser = {};

    function applyShiftToDate_(key, closed, open, lunch) {
      const st = stateMap[key];
      if (!st) return;
      if (closed && closed.outMs) {
        const outYmd = attYmdJst_(new Date(closed.outMs));
        const inYmd = closed.openIn ? attYmdJst_(new Date(closed.openIn.ms)) : '';
        if (outYmd === dateYmd || inYmd === dateYmd) {
          st.status = 'clocked_out';
          st.forgot = false;
          st.clockOutDateYmd = outYmd;
          st.clockOutTime = attHmJst_(new Date(closed.outMs));
          st.clockOutNote = closed.note || '';
          if (closed.openIn) {
            st.clockInDateYmd = inYmd;
            st.clockInTime = attHmJst_(new Date(closed.openIn.ms));
          }
          st.lunchNote = closed.lunch ? String(closed.lunch) : '';
        }
      } else if (open && open.ms) {
        const inYmd = attYmdJst_(new Date(open.ms));
        if (inYmd === dateYmd) {
          st.status = 'working';
          st.forgot = false;
          st.clockInDateYmd = inYmd;
          st.clockInTime = attHmJst_(new Date(open.ms));
          st.clockOutTime = '';
          st.clockOutDateYmd = '';
          st.clockOutNote = '';
          st.lunchNote = lunch || '';
        } else if (inYmd < dateYmd && dateYmd === todayYmd) {
          st.status = 'forgot';
          st.forgot = true;
          st.clockInDateYmd = inYmd;
          st.clockInTime = attHmJst_(new Date(open.ms));
          st.clockOutTime = '';
          st.clockOutDateYmd = '';
          st.clockOutNote = '';
          st.lunchNote = lunch || '';
        }
      }
    }

    for (let i = 0; i < values.length; i++) {
      const key = normClockUser_(values[i][1]);
      if (!key) continue;
      if (!stateMap[key]) {
        stateMap[key] = emptyClockState_({ userName: String(values[i][1] || '').trim() });
      }
      const type = String(values[i][4] || '');
      const tObj = new Date(values[i][0]);
      if (isNaN(tObj.getTime())) continue;
      const isIn = (type === '出勤' || type === 'アプリ起動');
      const isOut = (type === '退勤' || type.indexOf('退勤(') === 0);
      const isClockInCancel = (type === '出勤取消');
      const isClockOutCancel = (type === '退勤取消');

      if (isIn) {
        openByUser[key] = { ms: tObj.getTime() };
        lunchByUser[key] = null;
        lastClosedByUser[key] = null;
        applyShiftToDate_(key, null, openByUser[key], '');
      } else if (isOut) {
        lastClosedByUser[key] = {
          openIn: openByUser[key] || null,
          lunch: lunchByUser[key] || null,
          outMs: tObj.getTime(),
          note: parseClockOutNote_(type)
        };
        openByUser[key] = null;
        lunchByUser[key] = null;
        applyShiftToDate_(key, lastClosedByUser[key], null, '');
      } else if (isClockOutCancel) {
        const closed = lastClosedByUser[key];
        if (closed && closed.openIn) {
          openByUser[key] = closed.openIn;
          lunchByUser[key] = closed.lunch;
          lastClosedByUser[key] = null;
          if (stateMap[key] && (stateMap[key].clockOutDateYmd === dateYmd || stateMap[key].clockInDateYmd === dateYmd)) {
            stateMap[key].status = 'none';
            stateMap[key].clockOutTime = '';
            stateMap[key].clockOutDateYmd = '';
            stateMap[key].clockOutNote = '';
          }
          applyShiftToDate_(key, null, openByUser[key], lunchByUser[key] || '');
        }
      } else if (isClockInCancel) {
        if (stateMap[key] && stateMap[key].clockInDateYmd === dateYmd) {
          stateMap[key].status = 'none';
          stateMap[key].clockInTime = '';
          stateMap[key].clockInDateYmd = '';
          stateMap[key].clockOutTime = '';
          stateMap[key].clockOutDateYmd = '';
          stateMap[key].clockOutNote = '';
          stateMap[key].forgot = false;
        }
        openByUser[key] = null;
        lunchByUser[key] = null;
        lastClosedByUser[key] = null;
      } else if (openByUser[key]) {
        if (type === '昼休憩なし') lunchByUser[key] = '昼なし';
        else if (type.indexOf('昼休憩') === 0) lunchByUser[key] = type;
        applyShiftToDate_(key, null, openByUser[key], lunchByUser[key] || '');
      }
    }
  }

  const confSheet = ensureClockConfirmSheet_();
  const confData = confSheet.getDataRange().getValues();
  const confMap = {};
  for (let i = 1; i < confData.length; i++) {
    const d = String(confData[i][0] || '').trim();
    const u = normClockUser_(confData[i][1]);
    if (d === dateYmd && u) {
      confMap[u] = {
        confirmed: true,
        confirmedBy: String(confData[i][5] || '').trim(),
        confirmedAt: (confData[i][6] instanceof Date)
          ? (attYmdJst_(confData[i][6]) + ' ' + attHmJst_(confData[i][6]))
          : String(confData[i][6] || '').trim()
      };
    }
  }
  Object.keys(confMap).forEach(function (key) {
    if (stateMap[key]) {
      stateMap[key].confirmed = true;
      stateMap[key].confirmedBy = confMap[key].confirmedBy;
      stateMap[key].confirmedAt = confMap[key].confirmedAt;
    }
  });

  const list = Object.keys(stateMap).map(function (k) { return stateMap[k]; });
  list.sort(function (a, b) {
    const rank = function (s) {
      if (s.status === 'clocked_out' && !s.confirmed) return 0;
      if (s.status === 'forgot') return 1;
      if (s.status === 'working') return 2;
      if (s.status === 'clocked_out') return 3;
      return 4;
    };
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return String(a.userName).localeCompare(String(b.userName), 'ja');
  });

  const pending = list.filter(function (m) { return m.status === 'clocked_out' && !m.confirmed; }).length;
  const working = list.filter(function (m) { return m.status === 'working' || m.status === 'forgot'; }).length;
  const done = list.filter(function (m) { return m.status === 'clocked_out'; }).length;

  return {
    success: true,
    dateYmd: dateYmd,
    todayYmd: todayYmd,
    pendingCount: pending,
    workingCount: working,
    clockedOutCount: done,
    members: list
  };
}

function confirmStaffClockOut(params) {
  const requesterId = String((params && params.requesterId) || '').trim();
  const requester = findMeiboUser_(requesterId, params && params.requesterName);
  if (!requester || !attIsAdminRole_(requester.role)) {
    return { success: false, message: '管理者のみ確認できます' };
  }
  const dateYmd = String((params && params.dateYmd) || '').trim();
  const targetName = String((params && params.targetUserName) || '').trim();
  if (!dateYmd || !targetName) return { success: false, message: '日付と対象ユーザーが必要です' };
  const undo = !!(params && params.undo);
  const sheet = ensureClockConfirmSheet_();
  const data = sheet.getDataRange().getValues();
  const key = normClockUser_(targetName);
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === dateYmd && normClockUser_(data[i][1]) === key) {
      foundRow = i + 1;
      break;
    }
  }
  if (undo) {
    if (foundRow > 0) sheet.deleteRow(foundRow);
    writeLog(requester.userName || requesterId, '退勤確認解除', targetName, dateYmd);
    return { success: true, confirmed: false, message: '確認を取り消しました' };
  }
  const clockIn = String((params && params.clockInTime) || '').trim();
  const clockOut = String((params && params.clockOutTime) || '').trim();
  const note = String((params && params.note) || '').trim();
  const now = new Date();
  const rowVals = [dateYmd, targetName, clockIn, clockOut, note, requester.userName || requesterId, now];
  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, 7).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }
  writeLog(requester.userName || requesterId, '退勤確認', targetName, dateYmd + ' ' + clockIn + '〜' + clockOut);
  return { success: true, confirmed: true, message: '退勤を確認しました' };
}

// trigger clasp


function appendCultivationMasterBatch_(plans) {
  const ss = TENANT_SS;
  if (!ss || !plans || plans.length === 0) return;

  let sheet = ss.getSheetByName('栽培計画マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('栽培計画マスタ');
    sheet.appendRow(['作物', '品種', '穴数', '条数', '株間', '畝間', '収穫係数', '定植面積', '1苗当たり収量', '1P当たり入り数']);
  }

  const width = Math.max(10, sheet.getLastColumn());
  const data = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues()
    : [];
  const pairSet = {};
  const valueSets = [null, null, {}, {}, {}, {}, null, null, {}, {}];
  data.forEach(row => {
    const crop = String(row[0] || '').trim();
    const variety = String(row[1] || '').trim();
    if (crop && variety) pairSet[crop + '\t' + variety] = true;
    [2, 3, 4, 5, 8, 9].forEach(col => {
      if (row[col] !== '' && row[col] !== null && row[col] !== undefined) {
        valueSets[col][String(row[col])] = true;
      }
    });
  });

  const rowsToAdd = [];
  plans.forEach(plan => {
    const crop = String((plan && plan.crop) || '').trim();
    const variety = String((plan && plan.variety) || '').trim();
    if (!crop || !variety) return;

    const pairKey = crop + '\t' + variety;
    const values = {
      2: plan.holes,
      3: plan.rows,
      4: plan.pSpace,
      5: plan.rSpace,
      8: plan.yieldPerPlant || plan.yieldPerSeedling || '',
      9: plan.itemsPerPack
    };
    const row = new Array(width).fill('');
    let needsRow = false;
    if (!pairSet[pairKey]) {
      row[0] = crop;
      row[1] = variety;
      pairSet[pairKey] = true;
      needsRow = true;
    }
    Object.keys(values).forEach(colKey => {
      const col = Number(colKey);
      const value = values[col];
      if (value !== '' && value !== null && value !== undefined && !valueSets[col][String(value)]) {
        row[col] = value;
        valueSets[col][String(value)] = true;
        needsRow = true;
      }
    });
    if (needsRow) rowsToAdd.push(row);
  });

  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, width).setValues(rowsToAdd);
  }
}

/** 計画JSONから本作/試作を判定（未設定は計画名末尾、それもなければ本作） */
function resolveCultivationPlanType_(planOrType) {
  if (typeof planOrType === 'string') {
    const t = String(planOrType || '').trim();
    if (/^試作\d*$/.test(t) || t === '試作') return '試作';
    return '本作';
  }
  const plan = planOrType || {};
  const typed = String(plan.planType || '').trim();
  if (typed === '試作' || typed === '本作') return typed;
  const name = String(plan.planName || '').trim();
  if (/\s+試作\d*$/.test(name)) return '試作';
  return '本作';
}

function resolveCultivationPlanName_(year, crop, plan, planType, planName) {
  const explicit = String(planName || (plan && plan.planName) || '').trim();
  if (explicit) return explicit;
  const type = resolveCultivationPlanType_(planType || plan || '本作');
  const location = String((plan && plan.location) || '').trim();
  const parts = [String(year) + '年'];
  if (location) parts.push(location);
  parts.push(String(crop || '栽培計画'));
  parts.push(type);
  return parts.join(' ');
}

function parseCultivationPlanJson_(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * 栽培計画由来の播種を作業予定へ反映する。
 * 完了日・写真URLは既存行があれば引き継ぐ。
 * @returns {{ updated: number, created: number, deleted: number }}
 */
function upsertCultivationSowingSchedule_(year, plans) {
  const result = { updated: 0, created: 0, deleted: 0 };
  if (!plans || plans.length === 0) return result;

  const ss = TENANT_SS;
  let schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) {
    schedSheet = ss.insertSheet('作業予定');
    schedSheet.appendRow(['作業名', '担当部署', '作物名', '圃場名', '予定日', '期限日', '時間', '適合者', '完了日', '写真URL', '場所ID']);
  }

  const targetIds = {};
  plans.forEach(p => { targetIds['cp:' + p.id] = true; });

  // 既存の完了情報を保持してから同一計画行を削除
  const preserved = {}; // marker -> { completed, photo }
  if (schedSheet.getLastRow() > 1) {
    const sData = schedSheet.getRange(2, 1, schedSheet.getLastRow(), 11).getValues();
    for (let i = sData.length - 1; i >= 0; i--) {
      const placeId = String(sData[i][10] || '');
      const marker = placeId.split('|')[0];
      if (!targetIds[marker]) continue;
      if (!preserved[marker]) {
        preserved[marker] = {
          completed: sData[i][8] || '',
          photo: sData[i][9] || ''
        };
      }
      schedSheet.deleteRow(i + 2);
      result.deleted++;
    }
  }

  plans.forEach(plan => {
    const sowing = (plan.tasks && plan.tasks.sowing) ? plan.tasks.sowing : [];
    if (sowing.length === 0) return;

    const parts = sowing.map(c => cpCellToDateParts(year, c));
    parts.sort((a, b) => a.start - b.start);
    const startDate = parts[0].start;
    const endDate = parts[parts.length - 1].end;

    const trays = plan.trays || 0;
    const unit = (Number(plan.holes) === 1) ? '粒' : '枚';
    const traysLabel = trays + unit;

    const fieldIds = plan.fieldIds || [];
    const fieldNames = fieldIds.length > 0
      ? fieldIds.map(resolveCpFieldDisplayName_).join(', ')
      : '(圃場未選択)';

    const marker = 'cp:' + plan.id;
    const placeId = marker + (fieldIds.length ? '|' + fieldIds.join(',') : '');
    const keep = preserved[marker] || { completed: '', photo: '' };

    schedSheet.appendRow([
      '播種',
      '',
      plan.crop || '',
      fieldNames,
      startDate,
      endDate,
      traysLabel,
      plan.tag || '',
      keep.completed,
      keep.photo,
      placeId
    ]);
    if (preserved[marker]) result.updated++;
    else result.created++;
  });

  return result;
}

function parseCpGrainMetaGas_(raw) {
  const empty = { type: '', count: 0 };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const type = String(raw.type || '').trim();
    const count = Number(raw.count);
    return { type: type, count: (isFinite(count) && count > 0) ? Math.round(count) : 0 };
  }
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return empty;
  if (s.charAt(0) === '{') {
    try {
      return parseCpGrainMetaGas_(JSON.parse(s));
    } catch (e) { return empty; }
  }
  const typed = s.match(/^(コート|生種)\s*[:：]\s*([\d,]+)/);
  if (typed) {
    const count = Math.round(Number(String(typed[2]).replace(/,/g, '')));
    return { type: typed[1], count: (isFinite(count) && count > 0) ? count : 0 };
  }
  if (s === 'コート' || s === '生種') return { type: s, count: 0 };
  if (/^[\d,]+$/.test(s)) {
    const count = Math.round(Number(s.replace(/,/g, '')));
    return { type: '', count: (isFinite(count) && count > 0) ? count : 0 };
  }
  return empty;
}

function formatCpGrainSpecLabelGas_(meta) {
  const m = meta || { type: '', count: 0 };
  if (m.type && m.count > 0) return m.type + ' ' + Number(m.count).toLocaleString('ja-JP') + '粒';
  if (m.count > 0) return Number(m.count).toLocaleString('ja-JP') + '粒';
  if (m.type) return m.type;
  return '';
}

function cpPlanSeedNeedCount_(plan) {
  const trays = Number(plan && plan.trays) || 0;
  const holes = Number(plan && plan.holes) || 0;
  if (!(trays > 0)) return 0;
  return holes === 1 ? trays : (holes > 0 ? trays * holes : trays);
}

function cpLookupGrainCountFromCroptypeDb_(crop, variety) {
  const sheet = TENANT_SS.getSheetByName('作型DB');
  if (!sheet || sheet.getLastRow() < 2) return '';
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const cropCol = headers.indexOf('作物');
  const varCol = headers.indexOf('品種');
  const grainCol = headers.indexOf('粒数');
  if (cropCol < 0 || varCol < 0 || grainCol < 0) return '';
  const cropName = String(crop || '').trim();
  const varietyName = String(variety || '').trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][cropCol] || '').trim() !== cropName) continue;
    if (String(data[i][varCol] || '').trim() !== varietyName) continue;
    const g = String(data[i][grainCol] || '').trim();
    if (g) return g;
  }
  return '';
}

function cpResolvePlanGrainRaw_(plan, grainCache) {
  const cache = grainCache || {};
  let raw = plan && plan.grainCount ? String(plan.grainCount) : '';
  if (raw) return raw;
  const crop = String((plan && plan.crop) || '').trim();
  const variety = String((plan && plan.variety) || '').trim();
  const key = crop + '\t' + variety;
  if (cache[key] !== undefined) return cache[key];
  cache[key] = cpLookupGrainCountFromCroptypeDb_(crop, variety);
  return cache[key];
}

/** 播種の前に置く種の調達作業。実行バッチごとに分け、規格粒数で切り上げた袋数を出す。 */
function parseCpProcurePlanIds_(placeId) {
  const s = String(placeId || '');
  if (s.indexOf('cp:procure:') !== 0) return [];
  const pipe = s.indexOf('|');
  const idPart = pipe >= 0 ? s.slice(pipe + 1) : '';
  if (idPart) return idPart.split(',').filter(Boolean);
  const marker = pipe >= 0 ? s.slice(0, pipe) : s;
  const dbl = marker.lastIndexOf('::');
  if (dbl >= 0) return marker.slice(dbl + 2).split(',').filter(Boolean);
  return [];
}

function upsertCultivationProcureSchedule_(year, plans) {
  const result = { updated: 0, created: 0, deleted: 0 };
  if (!plans || plans.length === 0) return result;

  const ss = TENANT_SS;
  let schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) {
    schedSheet = ss.insertSheet('作業予定');
    schedSheet.appendRow(['作業名', '担当部署', '作物名', '圃場名', '予定日', '期限日', '時間', '適合者', '完了日', '写真URL', '場所ID']);
  }

  const grainCache = {};
  const groups = {};
  const targetPlanIds = {};
  plans.forEach(function(plan) {
    if (!plan || !plan.id) return;
    targetPlanIds[String(plan.id)] = true;
    const sowing = (plan.tasks && plan.tasks.sowing) ? plan.tasks.sowing : [];
    if (!sowing.length) return;
    const seeds = cpPlanSeedNeedCount_(plan);
    if (!(seeds > 0)) return;
    const grainRaw = cpResolvePlanGrainRaw_(plan, grainCache);
    const meta = parseCpGrainMetaGas_(grainRaw);
    const specLabel = formatCpGrainSpecLabelGas_(meta) || '規格未登録';
    const crop = String(plan.crop || '').trim();
    const variety = String(plan.variety || '').trim() || '(品種未設定)';
    const maker = String(plan.maker || '').trim();
    const groupKey = [crop, variety, maker, meta.type || '', String(meta.count || 0)].join('\t');
    if (!groups[groupKey]) {
      groups[groupKey] = {
        crop: crop,
        variety: variety,
        maker: maker,
        specLabel: specLabel,
        specCount: meta.count || 0,
        seeds: 0,
        planIds: [],
        sowingStart: null,
        tags: []
      };
    }
    const g = groups[groupKey];
    g.seeds += seeds;
    if (g.planIds.indexOf(String(plan.id)) < 0) g.planIds.push(String(plan.id));
    if (plan.tag && g.tags.indexOf(plan.tag) < 0) g.tags.push(plan.tag);
    const parts = sowing.map(function(c) { return cpCellToDateParts(year, c); });
    parts.sort(function(a, b) { return a.start - b.start; });
    if (parts.length && (!g.sowingStart || parts[0].start < g.sowingStart)) {
      g.sowingStart = parts[0].start;
    }
  });

  const groupKeys = Object.keys(groups);
  groupKeys.forEach(function(k) {
    const g = groups[k];
    g.packs = g.specCount > 0 ? Math.ceil(g.seeds / g.specCount) : 0;
    g.planIds.sort();
    g.marker = 'cp:procure:' + encodeURIComponent(k) + '::' + g.planIds.join(',');
  });

  const preserved = {};
  if (schedSheet.getLastRow() > 1) {
    const sData = schedSheet.getRange(2, 1, schedSheet.getLastRow(), 11).getValues();
    for (let i = sData.length - 1; i >= 0; i--) {
      const placeId = String(sData[i][10] || '');
      if (placeId.indexOf('cp:procure:') !== 0) continue;
      if (sData[i][8]) continue; // 完了済みの調達は残す（後からの別実行と混ぜない）
      const marker = placeId.split('|')[0];
      const ids = parseCpProcurePlanIds_(placeId);
      let hit = false;
      for (let j = 0; j < ids.length; j++) {
        if (targetPlanIds[ids[j]]) { hit = true; break; }
      }
      if (!hit) continue;
      if (!preserved[marker]) {
        preserved[marker] = { completed: sData[i][8] || '', photo: sData[i][9] || '' };
      }
      schedSheet.deleteRow(i + 2);
      result.deleted++;
    }
  }

  groupKeys.forEach(function(k) {
    const g = groups[k];
    if (!g.sowingStart) return;
    const deadline = g.sowingStart;
    const startDate = new Date(deadline.getTime());
    startDate.setDate(startDate.getDate() - 7);
    const qtyLabel = g.specCount > 0
      ? (g.packs + '袋（' + (g.maker ? g.maker + ' ' : '') + g.specLabel + '）')
      : (Number(g.seeds).toLocaleString('ja-JP') + '粒（規格未登録）');
    const placeId = g.marker + '|' + g.planIds.join(',');
    const keep = preserved[g.marker] || { completed: '', photo: '' };
    schedSheet.appendRow([
      '調達',
      '',
      g.crop,
      g.variety,
      startDate,
      deadline,
      qtyLabel,
      g.tags.join(' ') || '',
      keep.completed,
      keep.photo,
      placeId
    ]);
    if (preserved[g.marker]) result.updated++;
    else result.created++;
  });

  return result;
}

function parseCpPlaceKind_(placeId) {
  const raw = String(placeId || '');
  const marker = raw.split('|')[0];
  if (marker.indexOf('cp:procure:') === 0) {
    return { kind: 'procure', planIds: parseCpProcurePlanIds_(raw), entryId: '', marker: marker };
  }
  if (marker.indexOf('cp:plant:') === 0) {
    const id = marker.slice('cp:plant:'.length);
    return { kind: 'plant', planIds: id ? [id] : [], entryId: '', marker: marker };
  }
  if (marker.indexOf('cp:work:') === 0) {
    const rest = marker.slice('cp:work:'.length);
    const parts = rest.split('::');
    const planId = String(parts[0] || '').trim();
    const entryId = String(parts[1] || '').trim();
    return { kind: 'work', planIds: planId ? [planId] : [], entryId: entryId, marker: marker };
  }
  if (marker.indexOf('cp:') === 0) {
    const id = marker.slice(3);
    if (!id || id.indexOf('plant:') === 0 || id.indexOf('work:') === 0 || id.indexOf('procure:') === 0) {
      return { kind: '', planIds: [], entryId: '', marker: marker };
    }
    return { kind: 'sow', planIds: [id], entryId: '', marker: marker };
  }
  return { kind: '', planIds: [], entryId: '', marker: marker };
}

function cpPlanFieldNames_(plan) {
  const fieldIds = (plan && plan.fieldIds) || [];
  if (fieldIds.length > 0) return fieldIds.map(resolveCpFieldDisplayName_).join(', ');
  return '(圃場未選択)';
}

function upsertCultivationPlantingSchedule_(year, plans) {
  const result = { updated: 0, created: 0, deleted: 0 };
  if (!plans || plans.length === 0) return result;
  const ss = TENANT_SS;
  let schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) {
    schedSheet = ss.insertSheet('作業予定');
    schedSheet.appendRow(['作業名', '担当部署', '作物名', '圃場名', '予定日', '期限日', '時間', '適合者', '完了日', '写真URL', '場所ID']);
  }
  const targetIds = {};
  plans.forEach(function(p) { targetIds['cp:plant:' + p.id] = true; });
  const preserved = {};
  if (schedSheet.getLastRow() > 1) {
    const sData = schedSheet.getRange(2, 1, schedSheet.getLastRow(), 11).getValues();
    for (let i = sData.length - 1; i >= 0; i--) {
      const placeId = String(sData[i][10] || '');
      const marker = placeId.split('|')[0];
      if (!targetIds[marker]) continue;
      if (!preserved[marker]) {
        preserved[marker] = { completed: sData[i][8] || '', photo: sData[i][9] || '' };
      }
      schedSheet.deleteRow(i + 2);
      result.deleted++;
    }
  }
  plans.forEach(function(plan) {
    const planting = (plan.tasks && plan.tasks.planting) ? plan.tasks.planting : [];
    const sowing = (plan.tasks && plan.tasks.sowing) ? plan.tasks.sowing : [];
    let startDate;
    let endDate;
    if (planting.length) {
      const parts = planting.map(function(c) { return cpCellToDateParts(year, c); });
      parts.sort(function(a, b) { return a.start - b.start; });
      startDate = parts[0].start;
      endDate = parts[parts.length - 1].end;
    } else if (sowing.length) {
      const parts = sowing.map(function(c) { return cpCellToDateParts(year, c); });
      parts.sort(function(a, b) { return a.start - b.start; });
      startDate = parts[parts.length - 1].end;
      endDate = new Date(startDate.getTime());
      endDate.setDate(endDate.getDate() + 14);
    } else {
      startDate = new Date();
      endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
    }
    const trays = plan.trays || 0;
    const unit = (Number(plan.holes) === 1) ? '株' : '枚';
    const traysLabel = trays ? (trays + unit) : '';
    const fieldIds = plan.fieldIds || [];
    const fieldNames = cpPlanFieldNames_(plan);
    const marker = 'cp:plant:' + plan.id;
    const placeId = marker + (fieldIds.length ? '|' + fieldIds.join(',') : '');
    const keep = preserved[marker] || { completed: '', photo: '' };
    schedSheet.appendRow([
      '定植',
      '',
      plan.crop || '',
      fieldNames,
      startDate,
      endDate,
      traysLabel,
      plan.tag || '',
      keep.completed,
      keep.photo,
      placeId
    ]);
    if (preserved[marker]) result.updated++;
    else result.created++;
  });
  return result;
}

function collectExistingCpPlantingPlanIds_(sData) {
  const ids = {};
  (sData || []).forEach(function(row) {
    if (String(row[0] || '').trim() !== '定植') return;
    const parsed = parseCpPlaceKind_(row[10]);
    if (parsed.kind !== 'plant') return;
    parsed.planIds.forEach(function(id) { ids[id] = true; });
  });
  return ids;
}

function collectExistingCpWorkMarkers_(sData) {
  const ids = {};
  (sData || []).forEach(function(row) {
    const parsed = parseCpPlaceKind_(row[10]);
    if (parsed.kind === 'work' && parsed.marker) ids[parsed.marker] = true;
  });
  return ids;
}

function ensurePlantingAfterCompletedSowing_(sData, extraCompletedPlaceIds) {
  extraCompletedPlaceIds = extraCompletedPlaceIds || {};
  const existingPlant = collectExistingCpPlantingPlanIds_(sData);
  const lookup = buildCultivationPlanLookupById_();
  const byYear = {};
  (sData || []).forEach(function(row) {
    if (String(row[0] || '').trim() !== '播種') return;
    const placeId = String(row[10] || '');
    const parsed = parseCpPlaceKind_(placeId);
    if (parsed.kind !== 'sow') return;
    const done = !!(row[8] || extraCompletedPlaceIds[placeId]);
    if (!done) return;
    parsed.planIds.forEach(function(id) {
      if (existingPlant[id]) return;
      const plan = lookup[id];
      if (!plan) return;
      const year = String(plan.year || '');
      if (!year) return;
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(plan);
      existingPlant[id] = true;
    });
  });
  Object.keys(byYear).forEach(function(year) {
    upsertCultivationPlantingSchedule_(year, byYear[year]);
  });
}

function parseSheetDateLoose_(v) {
  if (!v) return null;
  try {
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return v;
    const s = String(v).trim().replace(/\//g, '-');
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  } catch (e) {}
  return null;
}

function enqueueCropWorksForPlan_(plan, plantDate) {
  const result = { created: 0 };
  if (!plan || !plan.id || !plantDate) return result;
  const crop = String(plan.crop || '').trim();
  if (!crop) return result;
  const planRes = getCropWorkPlan({ cropName: crop });
  const entries = (planRes.plan && planRes.plan.entries) || [];
  if (!entries.length) return result;
  const ss = TENANT_SS;
  let schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet) {
    schedSheet = ss.insertSheet('作業予定');
    schedSheet.appendRow(['作業名', '担当部署', '作物名', '圃場名', '予定日', '期限日', '時間', '適合者', '完了日', '写真URL', '場所ID']);
  }
  const existing = {};
  if (schedSheet.getLastRow() > 1) {
    const sData = schedSheet.getRange(2, 11, schedSheet.getLastRow() - 1, 1).getValues();
    sData.forEach(function(r) {
      const parsed = parseCpPlaceKind_(r[0]);
      if (parsed.kind === 'work' && parsed.marker) existing[parsed.marker] = true;
    });
  }
  const fieldIds = plan.fieldIds || [];
  const fieldNames = cpPlanFieldNames_(plan);
  const plant = new Date(plantDate.getTime());
  plant.setHours(0, 0, 0, 0);
  const loc = resolveFarmLatLng_(fieldIds);
  let weather = null;
  if (cropWorkNeedsWeather_(entries)) {
    try { weather = loadCropWorkWeatherSeries_(loc.lat, loc.lng, plant); } catch (e) { weather = {}; }
  }
  const geo = { lat: loc.lat, lng: loc.lng, weather: weather };
  entries.forEach(function(entry) {
    const marker = 'cp:work:' + plan.id + '::' + entry.id;
    if (existing[marker]) return;
    const win = resolveCropWorkWindow_(entry, plant, geo);
    const placeId = marker + (fieldIds.length ? '|' + fieldIds.join(',') : '');
    const workName = win.cancelled ? ('[キャンセル] ' + entry.workName) : entry.workName;
    schedSheet.appendRow([
      workName,
      '',
      crop,
      fieldNames,
      win.start,
      win.end,
      win.label,
      plan.tag || '',
      '',
      '',
      placeId
    ]);
    existing[marker] = true;
    result.created++;
  });
  return result;
}

function ensureFieldWorksAfterCompletedPlanting_(sData, extraCompletedPlaceIds) {
  extraCompletedPlaceIds = extraCompletedPlaceIds || {};
  const lookup = buildCultivationPlanLookupById_();
  const donePlans = {};
  (sData || []).forEach(function(row) {
    if (String(row[0] || '').trim() !== '定植') return;
    const placeId = String(row[10] || '');
    const parsed = parseCpPlaceKind_(placeId);
    if (parsed.kind !== 'plant') return;
    const doneVal = row[8] || extraCompletedPlaceIds[placeId];
    if (!doneVal) return;
    parsed.planIds.forEach(function(id) {
      if (donePlans[id]) return;
      const plan = lookup[id];
      if (!plan) return;
      let plantDate = parseSheetDateLoose_(row[8]);
      if (!plantDate) plantDate = new Date();
      enqueueCropWorksForPlan_(plan, plantDate);
      donePlans[id] = true;
    });
  });
}

function collectExistingCpSowingPlanIds_(sData) {
  const ids = {};
  (sData || []).forEach(function(row) {
    if (String(row[0] || '').trim() !== '播種') return;
    const placeId = String(row[10] || '');
    if (placeId.indexOf('cp:procure:') === 0) return;
    if (placeId.indexOf('cp:plant:') === 0) return;
    if (placeId.indexOf('cp:work:') === 0) return;
    if (placeId.indexOf('cp:') !== 0) return;
    const id = placeId.split('|')[0].replace(/^cp:/, '');
    if (id) ids[id] = true;
  });
  return ids;
}

/** 調達が完了した計画だけ、播種を作業予定へ出す */
function ensureSowingAfterCompletedProcure_(sData, extraCompletedPlaceIds) {
  extraCompletedPlaceIds = extraCompletedPlaceIds || {};
  const existingSowing = collectExistingCpSowingPlanIds_(sData);
  const lookup = buildCultivationPlanLookupById_();
  const byYear = {};
  (sData || []).forEach(function(row) {
    if (String(row[0] || '').trim() !== '調達') return;
    const placeId = String(row[10] || '');
    if (placeId.indexOf('cp:procure:') !== 0) return;
    const done = !!(row[8] || extraCompletedPlaceIds[placeId]);
    if (!done) return;
    parseCpProcurePlanIds_(placeId).forEach(function(id) {
      if (existingSowing[id]) return;
      const plan = lookup[id];
      if (!plan) return;
      const year = String(plan.year || '');
      if (!year) return;
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(plan);
      existingSowing[id] = true;
    });
  });
  Object.keys(byYear).forEach(function(year) {
    upsertCultivationSowingSchedule_(year, byYear[year]);
  });
}

/** 対象計画の行だけ差し替える（シート全体の作り直しを避ける） */
function replaceCultivationPlanSheetRows_(sheet, matchingIndices, newRows) {
  const idxs = (matchingIndices || []).slice().sort(function(a, b) { return a - b; });
  const rows = newRows || [];
  const matchCount = idxs.length;
  const newCount = rows.length;

  if (matchCount === 0) {
    if (newCount > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newCount, 6).setValues(rows);
    }
    return;
  }

  let contiguous = true;
  for (let i = 1; i < matchCount; i++) {
    if (idxs[i] !== idxs[i - 1] + 1) {
      contiguous = false;
      break;
    }
  }

  const updateCount = Math.min(matchCount, newCount);
  if (updateCount > 0) {
    if (contiguous) {
      sheet.getRange(idxs[0] + 2, 1, updateCount, 6).setValues(rows.slice(0, updateCount));
    } else {
      for (let i = 0; i < updateCount; i++) {
        sheet.getRange(idxs[i] + 2, 1, 1, 6).setValues([rows[i]]);
      }
    }
  }

  if (newCount > matchCount) {
    const extra = rows.slice(matchCount);
    sheet.getRange(sheet.getLastRow() + 1, 1, extra.length, 6).setValues(extra);
  } else if (newCount < matchCount) {
    const toDelete = idxs.slice(newCount).map(function(i) { return i + 2; }).sort(function(a, b) { return b - a; });
    toDelete.forEach(function(r) { sheet.deleteRow(r); });
  }
}

function saveCultivationPlans(year, crop, planDataArray, planType, planName, opts) {
  opts = opts || {};
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
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

    const plans = planDataArray || [];
    const targetType = resolveCultivationPlanType_(
      planType || (plans[0] && (plans[0].planType || plans[0].planName)) || '本作'
    );
    const targetName = resolveCultivationPlanName_(year, crop, plans[0], targetType, planName);
    const previousName = String(opts.previousPlanName || '').trim();
    const matchNames = {};
    matchNames[targetName] = true;
    if (previousName) matchNames[previousName] = true;
    
    // 対象は「年度＋作物＋計画名」。本作2・試作などは別名として共存する。
    const existingCount = Math.max(0, sheet.getLastRow() - 1);
    const existingRows = existingCount > 0
      ? sheet.getRange(2, 1, existingCount, 6).getValues()
      : [];
    const previousById = {};
    const matchingIndices = [];
    let hadExecutedPrev = false;
    existingRows.forEach(function(row, i) {
      if (!(String(row[1]) === String(year) && String(row[3]) === String(crop))) return;
      const planData = parseCultivationPlanJson_(row[5]);
      if (!planData) return;
      const rowName = resolveCultivationPlanName_(year, crop, planData, null, null);
      if (!matchNames[rowName]) return;
      matchingIndices.push(i);
      if (planData.id) previousById[String(planData.id)] = planData;
      if (planData.status === 'executed') hadExecutedPrev = true;
    });

    if (opts.unexecutedOnly && hadExecutedPrev) {
      return {
        status: 'skipped',
        reason: 'executed',
        message: '実行済み計画のため自動保存しませんでした',
        planType: targetType,
        planName: targetName,
        hasExecuted: true,
        scheduleSync: { updated: 0, created: 0, deleted: 0 },
        plans: []
      };
    }
    if (opts.createOnly && matchingIndices.length > 0) {
      return {
        status: 'skipped',
        reason: 'exists',
        message: '同名の計画があるため新規自動保存を見送りました',
        planType: targetType,
        planName: targetName,
        hasExecuted: hadExecutedPrev,
        scheduleSync: { updated: 0, created: 0, deleted: 0 },
        plans: []
      };
    }

    // 未実行は planned のまま。既に実行済みの計画は status/tag/executedAt を引き継ぎ、
    // 播種・定植の変更を作業予定へ連動させる。
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    let hasExecuted = false;
    plans.forEach(plan => {
       plan.planType = targetType;
       plan.planName = targetName;
       const prev = previousById[String(plan.id)];
       const wasExecuted = !!(prev && prev.status === 'executed');
       if (wasExecuted && !opts.unexecutedOnly) {
         plan.status = 'executed';
         plan.executedAt = prev.executedAt || plan.executedAt || timestamp;
         if (!plan.tag && prev.tag) plan.tag = prev.tag;
         hasExecuted = true;
       } else {
         plan.status = 'planned';
         delete plan.executedAt;
         plan.tag = '';
       }
    });

    let scheduleSync = { updated: 0, created: 0, deleted: 0 };
    if (hasExecuted && !opts.skipScheduleSync) {
      assignCultivationPlanTags_(plans, { year: year });
      const executedPlans = plans.filter(p => p.status === 'executed');
      let sowingIds = {};
      try {
        const schedSheet = ss.getSheetByName('作業予定');
        if (schedSheet && schedSheet.getLastRow() > 1) {
          sowingIds = collectExistingCpSowingPlanIds_(
            schedSheet.getRange(2, 1, schedSheet.getLastRow() - 1, 11).getValues()
          );
        }
      } catch (eSowIds) {}
      const toSow = executedPlans.filter(p => sowingIds[String(p.id)]);
      const toProcure = executedPlans.filter(p => !sowingIds[String(p.id)]);
      if (toSow.length) scheduleSync = upsertCultivationSowingSchedule_(year, toSow);
      if (toProcure.length) upsertCultivationProcureSchedule_(year, toProcure);
    }

    const newRows = plans.map(function(plan) {
      return [
        timestamp,
        year,
        plan.id,
        plan.crop,
        plan.variety,
        JSON.stringify(plan)
      ];
    });
    replaceCultivationPlanSheetRows_(sheet, matchingIndices, newRows);
    if (!opts.skipMaster) {
      appendCultivationMasterBatch_(plans);
    }
    SpreadsheetApp.flush();

    const scheduleTouched = (scheduleSync.updated + scheduleSync.created + scheduleSync.deleted) > 0;
    return {
      status: 'success',
      message: hasExecuted
        ? (scheduleTouched
            ? '実行済み栽培計画を保存し、作業予定の播種日程も更新しました'
            : '実行済み栽培計画を保存しました')
        : '栽培計画を未実行計画として保存しました',
      planType: targetType,
      planName: targetName,
      hasExecuted: hasExecuted,
      scheduleSync: scheduleSync,
      plans: plans.map(p => ({
        id: p.id,
        status: p.status || 'planned',
        tag: p.tag || '',
        executedAt: p.executedAt || ''
      }))
    };
  } catch(e) {
    throw new Error("栽培計画保存エラー: " + e.message);
  } finally {
    try { lock.releaseLock(); } catch (lockErr) {}
  }
}

function countContiguousFragments_(idxs) {
  if (!idxs || !idxs.length) return 0;
  let n = 1;
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i] !== idxs[i - 1] + 1) n++;
  }
  return n;
}

/** 一致行の JSON 列だけ読む（全シートの巨大JSONを毎回引かない） */
function getCultivationPlanJsonCells_(sheet, rowCount, matchIdx) {
  const out = {};
  if (!sheet || !matchIdx || !matchIdx.length || rowCount <= 0) return out;
  const fragments = countContiguousFragments_(matchIdx);
  if (matchIdx.length >= 80 || fragments >= 25) {
    const col = sheet.getRange(2, 6, rowCount, 1).getValues();
    for (let i = 0; i < matchIdx.length; i++) {
      const idx = matchIdx[i];
      out[idx] = col[idx] ? col[idx][0] : '';
    }
    return out;
  }
  let start = 0;
  while (start < matchIdx.length) {
    let end = start;
    while (end + 1 < matchIdx.length && matchIdx[end + 1] === matchIdx[start] + (end - start) + 1) end++;
    const first = matchIdx[start];
    const count = matchIdx[end] - first + 1;
    const vals = sheet.getRange(first + 2, 6, count, 1).getValues();
    for (let k = 0; k < vals.length; k++) out[first + k] = vals[k][0];
    start = end + 1;
  }
  return out;
}

function getCultivationPlans(year, crop, planType, planName) {
  try {
    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('栽培計画');
    if (!sheet) return [];
    if (sheet.getLastRow() <= 1) return [];

    const rowCount = sheet.getLastRow() - 1;
    const meta = sheet.getRange(2, 2, rowCount, 3).getValues(); // year, id, crop
    const yearS = String(year);
    const cropS = String(crop);
    const matchIdx = [];
    for (let i = 0; i < meta.length; i++) {
      if (String(meta[i][0]) === yearS && String(meta[i][2]) === cropS) matchIdx.push(i);
    }
    if (!matchIdx.length) return [];

    const jsonByIdx = getCultivationPlanJsonCells_(sheet, rowCount, matchIdx);
    const results = [];
    const filterType = (planType != null && String(planType).trim() !== '')
      ? resolveCultivationPlanType_(planType)
      : '';
    const filterName = String(planName || '').trim();

    for (let i = 0; i < matchIdx.length; i++) {
      const idx = matchIdx[i];
      const planData = parseCultivationPlanJson_(jsonByIdx[idx]);
      if (!planData) continue;
      if (!planData.planType) planData.planType = resolveCultivationPlanType_(planData);
      if (!planData.planName) {
        planData.planName = resolveCultivationPlanName_(year, crop, planData, planData.planType, null);
      }
      if (filterName && String(planData.planName).trim() !== filterName) continue;
      if (!filterName && filterType && resolveCultivationPlanType_(planData) !== filterType) continue;
      results.push(planData);
    }
    return results;
  } catch(e) {
    throw new Error("栽培計画取得エラー: " + e.message);
  }
}

function cpPlanTaskFlat_(h) {
  if (h == null) return -1;
  if (typeof h === 'number' && isFinite(h)) return Math.floor(h);
  if (h && typeof h === 'object') {
    const mi = Number(h.monthIndex);
    if (!isFinite(mi)) return -1;
    if (h.periodIndex != null || h.period != null) {
      const pi = Number(h.periodIndex != null ? h.periodIndex : h.period) || 0;
      return mi > 17 ? mi : (mi * 6 + pi);
    }
    return mi;
  }
  return -1;
}

function cpPlanTaskRange_(planData, key) {
  let arr = [];
  if (planData && planData.tasks && Array.isArray(planData.tasks[key])) arr = planData.tasks[key];
  else if (planData && Array.isArray(planData[key])) arr = planData[key];
  let min = -1;
  let max = -1;
  (arr || []).forEach(function(h) {
    const f = cpPlanTaskFlat_(h);
    if (f < 0) return;
    if (min < 0 || f < min) min = f;
    if (max < 0 || f > max) max = f;
  });
  return { min: min, max: max };
}

function getSavedCultivationPlanList() {
  try {
    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('栽培計画');
    if (!sheet || sheet.getLastRow() <= 1) return [];

    // 一覧表示用に軽量化：作型DB全走査はせず、メーカー等は端末側で補完
    const dataRowCount = Math.max(0, sheet.getLastRow() - 1);
    const data = dataRowCount > 0
      ? sheet.getRange(2, 1, dataRowCount, 6).getValues()
      : [];
    const map = {};

    for (let i = 0; i < data.length; i++) {
       const row = data[i];
       const year = String(row[1]);
       const crop = String(row[3]);
       if (!year || !crop) continue;

       let status = 'planned';
       let trays = 0;
       let holes = 0;
       let areaA = 0;
       let planId = String(row[2] || '');
       let vName = String(row[4] || '').trim();
       let planName = '';
       let planType = '本作';
       let location = '';
       const planData = parseCultivationPlanJson_(row[5]);
       if (planData) {
         if (planData.status === 'executed') status = 'executed';
         trays = Number(planData.trays) || 0;
         holes = Number(planData.holes) || 0;
         areaA = Number(planData.areaA) || 0;
         if (planData.id) planId = String(planData.id);
         if (!vName && planData.variety) vName = String(planData.variety || '').trim();
         if (planData.planName) planName = String(planData.planName || '').trim();
         planType = resolveCultivationPlanType_(planData);
         location = String(planData.location || '').trim();
       }
       if (!vName) vName = '(品種未設定)';
       if (!planName) planName = resolveCultivationPlanName_(year, crop, planData || {}, planType, '');

       const seedCount = (holes === 1) ? trays : (trays * (holes > 0 ? holes : 0));

       const key = year + '_' + crop + '_' + planName;
       if (!map[key]) {
           map[key] = {
             year: year,
             crop: crop,
             planType: planType,
             planName: planName,
             location: '',
             locations: [],
             count: 0,
             plannedCount: 0,
             executedCount: 0,
             lastUpdated: row[0],
             plans: [],
             seedTotal: 0,
             seedPlannedTotal: 0
           };
       }
       map[key].count++;
       if (status === 'executed') map[key].executedCount++;
       else map[key].plannedCount++;
       if (location) {
         if (map[key].locations.indexOf(location) === -1) {
           map[key].locations.push(location);
         }
         map[key].location = map[key].locations.length === 1
           ? map[key].locations[0]
           : map[key].locations.join('・');
       }
       if (new Date(row[0]) > new Date(map[key].lastUpdated)) {
           map[key].lastUpdated = row[0];
           if (planName) map[key].planName = planName;
       }
       const sowR = cpPlanTaskRange_(planData, 'sowing');
       const plantR = cpPlanTaskRange_(planData, 'planting');
       map[key].plans.push({
         id: planId,
         variety: vName,
         maker: '',
         grainCount: '',
         trays: trays,
         holes: holes,
         areaA: areaA,
         seedCount: seedCount,
         status: status,
         planType: planType,
         planName: planName,
         location: location,
         tag: planData && planData.tag ? String(planData.tag || '').trim() : '',
         sowFrom: sowR.min,
         sowTo: sowR.max,
         plantFrom: plantR.min,
         plantTo: plantR.max
       });
       map[key].seedTotal += seedCount;
       if (status !== 'executed') map[key].seedPlannedTotal += seedCount;
    }

    return Object.values(map).sort((a, b) => {
      const y = String(b.year).localeCompare(String(a.year));
      if (y) return y;
      const c = String(a.crop).localeCompare(String(b.crop), 'ja');
      if (c) return c;
      return String(a.planName || '').localeCompare(String(b.planName || ''), 'ja');
    });
  } catch(e) {
    throw new Error("栽培計画リスト取得エラー: " + e.message);
  }
}

function farmBoardHasCompleteDate_(v) {
  if (v === true || v === 1) return true;
  const s = String(v == null ? '' : v).trim();
  if (!s || s === 'false' || s === '0' || s === '未完了') return false;
  return true;
}

function farmBoardTaskKind_(workName) {
  const w = String(workName || '');
  if (/^調達/.test(w) || /資材調達/.test(w)) return 'procure';
  if (/^播種/.test(w) || /セル成型|播種機/.test(w)) return 'sow';
  if (/^定植/.test(w)) return 'plant';
  if (/チッパー|ディスク/.test(w)) return 'chipper';
  if (/畝つぶし/.test(w)) return 'ridge_crush';
  if (/堆肥散布/.test(w)) return 'compost';
  if (/苦土石灰/.test(w)) return 'dolomite';
  if (/肥料散布/.test(w)) return 'fertilizer';
  if (/正転引き/.test(w)) return 'forward_pull';
  if (/畝立て/.test(w)) return 'ridge_make';
  return '';
}

function farmBoardParseQty_(hours) {
  const s = String(hours || '');
  const trays = s.match(/(\d+)\s*枚/);
  const bags = s.match(/(\d+)\s*袋/);
  const grains = s.match(/([\d,]+)\s*粒/);
  return {
    trays: trays ? Number(trays[1]) : 0,
    bags: bags ? Number(bags[1]) : 0,
    grains: grains ? Number(String(grains[1]).replace(/,/g, '')) : 0,
    label: s
  };
}

function farmBoardFmtDate_(v) {
  if (v == null || v === '') return '';
  try {
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
    }
  } catch (e) {}
  return String(v).trim();
}

function farmBoardCol_(idx, row, names, fallbackIndex) {
  for (let i = 0; i < names.length; i++) {
    if (idx[names[i]] !== undefined) return row[idx[names[i]]];
  }
  if (fallbackIndex !== undefined && row.length > fallbackIndex) return row[fallbackIndex];
  return '';
}

function farmBoardParsePlanIds_(placeId) {
  return parseCpPlaceKind_(placeId).planIds;
}

/**
 * ダッシュボード（カンバン）用の軽量データ。
 * 栽培計画・圃場・作業予定（調達/播種/定植/圃場準備）を返す。
 */
function getFarmBoardData() {
  const ss = TENANT_SS;
  if (!ss) throw new Error('スプレッドシートが設定されていません');

  const plans = getSavedCultivationPlanList() || [];
  const planById = {};
  plans.forEach(function(g) {
    (g.plans || []).forEach(function(p) {
      if (!p || !p.id) return;
      planById[String(p.id)] = {
        year: g.year || '',
        crop: g.crop || '',
        planName: g.planName || '',
        tag: p.tag || '',
        variety: p.variety || ''
      };
    });
  });

  const polygonsRaw = getSavedPolygons() || [];
  const fields = polygonsRaw.map(function(p) {
    return {
      id: p.id || '',
      name: p.name || '',
      year: p.year || '',
      area: p.area || 0,
      location: p.location || '',
      origin: p.origin || '',
      catStatuses: p.catStatuses || {}
    };
  });

  let prodCategories = [];
  try { prodCategories = getProdMgmtCategories() || []; } catch (e) {}

  const completedWorks = {};
  const workSheet = ss.getSheetByName('作業記録');
  if (workSheet && workSheet.getLastRow() >= 2) {
    const wData = workSheet.getDataRange().getValues();
    for (let i = 1; i < wData.length; i++) {
      if (String(wData[i][10] || '').trim() !== '完了') continue;
      const workName = String(wData[i][4] || '');
      if (!farmBoardTaskKind_(workName)) continue;
      const primaryField = String(wData[i][1] || '').split(',')[0].trim();
      const cropName = String(wData[i][5] || '');
      const key = primaryField + '_' + workName + '_' + cropName;
      const workDate = wData[i][3];
      if (!completedWorks[key] || new Date(workDate) > new Date(completedWorks[key])) {
        completedWorks[key] = workDate;
      }
    }
  }

  const tasks = [];
  const sheet = ss.getSheetByName('作業予定');
  if (sheet && sheet.getLastRow() >= 2) {
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(function(h) { return String(h).trim(); });
    const idx = {};
    headers.forEach(function(h, i) { idx[h] = i; });
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const workName = String(farmBoardCol_(idx, row, ['作業名'], 0) || '');
      const kind = farmBoardTaskKind_(workName);
      if (!kind) continue;
      const hoursRaw = farmBoardCol_(idx, row, ['枚数・時間', '時間', '予定時間'], 6);
      const qty = farmBoardParseQty_(hoursRaw);
      const completeRaw = farmBoardCol_(idx, row, ['完了日'], 8);
      const fieldName = String(farmBoardCol_(idx, row, ['圃場名'], 3) || '');
      const crop = String(farmBoardCol_(idx, row, ['作物名', '作物'], 2) || '');
      const recKey = String(fieldName).split(',')[0].trim() + '_' + workName + '_' + crop;
      let completed = farmBoardHasCompleteDate_(completeRaw);
      let completedDate = completed ? farmBoardFmtDate_(completeRaw) : '';
      if (!completed && completedWorks[recKey]) {
        completed = true;
        completedDate = farmBoardFmtDate_(completedWorks[recKey]);
      }
      const placeId = String(farmBoardCol_(idx, row, ['場所ID'], 10) || '');
      const planIds = farmBoardParsePlanIds_(placeId);
      const tagFromSheet = String(farmBoardCol_(idx, row, ['適合者', 'タグ'], 7) || '').trim();
      let year = '';
      let planNames = [];
      let tags = [];
      planIds.forEach(function(id) {
        const hit = planById[id];
        if (!hit) return;
        if (hit.year && !year) year = hit.year;
        if (hit.planName && planNames.indexOf(hit.planName) < 0) planNames.push(hit.planName);
        if (hit.tag && tags.indexOf(hit.tag) < 0) tags.push(hit.tag);
      });
      if (tagFromSheet && tags.indexOf(tagFromSheet) < 0) tags.push(tagFromSheet);
      tasks.push({
        kind: kind,
        workName: workName,
        fieldName: fieldName,
        crop: crop,
        variety: '',
        year: year,
        hours: String(hoursRaw || ''),
        trays: qty.trays,
        bags: qty.bags,
        grains: qty.grains,
        completed: completed,
        completedDate: completedDate,
        date: farmBoardFmtDate_(farmBoardCol_(idx, row, ['作業予定日', '予定日', '日付'], 4)),
        deadline: farmBoardFmtDate_(farmBoardCol_(idx, row, ['期限日'], 5)),
        tag: tags.join(' '),
        tags: tags,
        planIds: planIds,
        planNames: planNames,
        placeId: placeId
      });
    }
  }

  return { plans: plans, fields: fields, tasks: tasks, prodCategories: prodCategories };
}

function completeFarmBoardTasks(params) {
  params = params || {};
  const kind = String(params.kind || '');
  const wantComplete = params.completed !== false && params.completed !== 'false';
  const idSet = {};
  (params.planIds || []).forEach(function(id) {
    const s = String(id || '').trim();
    if (s) idSet[s] = true;
  });
  const fieldName = String(params.fieldName || '').trim();
  const tag = String(params.tag || '').trim();
  const ss = TENANT_SS;
  if (!ss) throw new Error('スプレッドシートが設定されていません');
  const sheet = ss.getSheetByName('作業予定');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, updated: 0 };

  const data = sheet.getDataRange().getValues();
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  let updated = 0;
  const completedPlaceIds = {};
  for (let i = 1; i < data.length; i++) {
    const workName = String(data[i][0] || '');
    if (farmBoardTaskKind_(workName) !== kind) continue;
    const placeId = String(data[i][10] || '');
    const ids = farmBoardParsePlanIds_(placeId);
    let hit = false;
    if (Object.keys(idSet).length) {
      for (let j = 0; j < ids.length; j++) {
        if (idSet[ids[j]]) { hit = true; break; }
      }
    }
    if (!hit && fieldName) {
      const names = String(data[i][3] || '').split(',');
      for (let j = 0; j < names.length; j++) {
        if (String(names[j] || '').trim() === fieldName) { hit = true; break; }
      }
    }
    if (!hit && tag) {
      const person = String(data[i][7] || '').trim();
      if (person === tag || person.split(/\s+/).indexOf(tag) >= 0) hit = true;
    }
    if (!hit) continue;
    const already = farmBoardHasCompleteDate_(data[i][8]);
    if (wantComplete === already) continue;
    sheet.getRange(i + 1, 9).setValue(wantComplete ? today : '');
    updated++;
    if (wantComplete) completedPlaceIds[placeId] = true;
  }
  if (wantComplete && kind === 'procure' && updated > 0) {
    ensureSowingAfterCompletedProcure_(sheet.getDataRange().getValues(), completedPlaceIds);
  }
  if (wantComplete && kind === 'sow' && updated > 0) {
    ensurePlantingAfterCompletedSowing_(sheet.getDataRange().getValues(), completedPlaceIds);
  }
  if (wantComplete && kind === 'plant' && updated > 0) {
    ensureFieldWorksAfterCompletedPlanting_(sheet.getDataRange().getValues(), completedPlaceIds);
  }
  return { success: true, updated: updated };
}

/** 保存済み栽培計画を年度＋作物＋計画名単位で削除 */
function deleteSavedCultivationPlans(year, crop, planType, planName) {
  try {
    const ss = TENANT_SS;
    if (!ss) return { success: false, message: 'スプレッドシート未設定' };
    const sheet = ss.getSheetByName('栽培計画');
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, deleted: 0, message: '削除対象はありませんでした' };
    }

    const targetYear = String(year || '').trim();
    const targetCrop = String(crop || '').trim();
    const targetName = String(planName || '').trim();
    const targetType = (!targetName && planType != null && String(planType).trim() !== '')
      ? resolveCultivationPlanType_(planType)
      : '';
    if (!targetYear || !targetCrop) {
      return { success: false, message: '年度と作物は必須です' };
    }

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    let deleted = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][1]) !== targetYear || String(data[i][3]) !== targetCrop) continue;
      const planData = parseCultivationPlanJson_(data[i][5]);
      const rowName = resolveCultivationPlanName_(targetYear, targetCrop, planData, null, null);
      if (targetName) {
        if (rowName !== targetName) continue;
      } else if (targetType) {
        if (resolveCultivationPlanType_(planData) !== targetType) continue;
      }
      sheet.deleteRow(i + 2);
      deleted++;
    }
    SpreadsheetApp.flush();
    const label = targetName || (targetType ? ` ${targetType}` : '');
    return {
      success: true,
      deleted: deleted,
      message: deleted > 0
        ? `${targetYear}年 ${targetCrop}${targetName ? '「' + targetName + '」' : label} の計画を${deleted}件削除しました`
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

/** 1計画の半旬別播種枚数配列(108) */
function computePlanSowingByPeriod_(plan) {
  const PERIODS = 108;
  const amounts = [];
  for (let i = 0; i < PERIODS; i++) amounts.push(0);
  if (!plan) return amounts;

  let sowing = [];
  if (plan.tasks && Array.isArray(plan.tasks.sowing)) sowing = plan.tasks.sowing;
  else if (Array.isArray(plan.sowing)) sowing = plan.sowing;
  if (!sowing.length) return amounts;

  const cells = [];
  for (let i = 0; i < sowing.length; i++) {
    const flat = cpHarvestFlatIndex_(sowing[i]);
    if (flat < 0 || flat >= PERIODS) continue;
    cells.push(flat);
  }
  if (!cells.length) return amounts;

  const trays = Number(plan.trays) || 0;
  if (!(trays > 0)) return amounts;
  const each = trays / cells.length;
  for (let j = 0; j < cells.length; j++) {
    amounts[cells[j]] += each;
  }
  return amounts;
}

/** 1計画の半旬別定植面積(a)配列(108) */
function computePlanPlantingByPeriod_(plan) {
  const PERIODS = 108;
  const amounts = [];
  for (let i = 0; i < PERIODS; i++) amounts.push(0);
  if (!plan) return amounts;

  let planting = [];
  if (plan.tasks && Array.isArray(plan.tasks.planting)) planting = plan.tasks.planting;
  else if (Array.isArray(plan.planting)) planting = plan.planting;
  if (!planting.length) return amounts;

  const cells = [];
  for (let i = 0; i < planting.length; i++) {
    const flat = cpHarvestFlatIndex_(planting[i]);
    if (flat < 0 || flat >= PERIODS) continue;
    cells.push(flat);
  }
  if (!cells.length) return amounts;

  const area = Number(plan.areaA) || 0;
  if (!(area > 0)) return amounts;
  const each = area / cells.length;
  for (let j = 0; j < cells.length; j++) {
    amounts[cells[j]] += each;
  }
  return amounts;
}

function cultivationPlanGroupKey_(year, crop, planName) {
  return String(year || '') + '\t' + String(crop || '') + '\t' + String(planName || '').trim();
}

/**
 * 栽培計画を条件で絞り込み、作物別・半旬別の収穫量・定植面積・播種枚数を返す
 */
function getCultivationPlanChartSummary(params) {
  try {
    params = params || {};
    const targetYear = String(params.year || '').trim() || String(new Date().getFullYear());
    const planTypeFilter = params.planType || 'all';
    const statusFilter = params.status || 'both';
    const locationFilter = String(params.location || '').trim();
    const excludeKeys = Array.isArray(params.excludePlanKeys)
      ? params.excludePlanKeys.map(function(k) { return String(k || '').trim(); }).filter(Boolean)
      : [];
    const excludeSet = {};
    excludeKeys.forEach(function(k) { excludeSet[k] = true; });
    const PERIODS = 108;
    const ss = TENANT_SS;
    if (!ss) return { success: false, message: 'スプレッドシート未設定' };

    const sheet = ss.getSheetByName('栽培計画');
    const parsedRows = [];
    const groupLocs = {};

    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow(), 6).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][1]) !== targetYear) continue;
        const planData = parseCultivationPlanJson_(data[i][5]);
        if (!planData) continue;
        const crop = String(planData.crop || data[i][3] || '').trim();
        if (!crop) continue;
        const planName = resolveCultivationPlanName_(targetYear, crop, planData, null, '');
        const gKey = cultivationPlanGroupKey_(targetYear, crop, planName);
        const loc = String(planData.location || '').trim();
        if (!groupLocs[gKey]) groupLocs[gKey] = {};
        if (loc) groupLocs[gKey][loc] = true;
        parsedRows.push({ planData: planData, crop: crop, gKey: gKey });
      }
    }

    function groupPassesLocation_(gKey) {
      if (!locationFilter) return true;
      const locs = groupLocs[gKey] || {};
      if (locs[locationFilter]) return true;
      return Object.keys(locs).some(function(l) { return l.indexOf(locationFilter) >= 0; });
    }

    const cropMap = {};
    parsedRows.forEach(function(row) {
      if (excludeSet[row.gKey]) return;
      const plan = row.planData;
      const type = resolveCultivationPlanType_(plan);
      if (planTypeFilter !== 'all' && type !== planTypeFilter) return;
      if (!groupPassesLocation_(row.gKey)) return;

      const st = (plan.status === 'executed') ? 'executed' : 'planned';
      if (statusFilter === 'planned' && st === 'executed') return;
      if (statusFilter === 'executed' && st !== 'executed') return;

      const ploc = String(plan.location || '').trim();
      if (locationFilter && ploc && ploc !== locationFilter) return;

      const crop = row.crop;
      if (!cropMap[crop]) {
        cropMap[crop] = {
          crop: crop,
          harvest: [],
          planting: [],
          sowing: []
        };
        for (let p = 0; p < PERIODS; p++) {
          cropMap[crop].harvest.push(0);
          cropMap[crop].planting.push(0);
          cropMap[crop].sowing.push(0);
        }
      }

      const h = computePlanHarvestByPeriod_(plan);
      const pl = computePlanPlantingByPeriod_(plan);
      const sw = computePlanSowingByPeriod_(plan);
      for (let p = 0; p < PERIODS; p++) {
        cropMap[crop].harvest[p] += h[p] || 0;
        cropMap[crop].planting[p] += pl[p] || 0;
        cropMap[crop].sowing[p] += sw[p] || 0;
      }
    });

    const crops = Object.keys(cropMap).sort(function(a, b) {
      return String(a).localeCompare(String(b), 'ja');
    }).map(function(k) {
      const row = cropMap[k];
      let harvestTotal = 0;
      let plantingTotal = 0;
      let sowingTotal = 0;
      for (let p = 0; p < PERIODS; p++) {
        harvestTotal += row.harvest[p];
        plantingTotal += row.planting[p];
        sowingTotal += row.sowing[p];
      }
      return {
        crop: row.crop,
        harvest: row.harvest,
        planting: row.planting,
        sowing: row.sowing,
        harvestTotal: harvestTotal,
        plantingTotal: plantingTotal,
        sowingTotal: sowingTotal
      };
    });

    return { success: true, year: targetYear, periods: PERIODS, crops: crops };
  } catch (e) {
    return { success: false, message: '計画グラフ集計エラー: ' + (e.message || String(e)) };
  }
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
 * 定植の早い順に並べ、その順を保ったまま収穫の早い順へ並べ替えた結果で、
 * 拠点＋作物＋本作/試作ごとへタグを割り当て（画面上の並びは使わない）。
 * 番号は「年度 × 拠点略称 × 作物略称 × 本/試」で全体ユニーク
 * （本作・本作2など計画名をまたいで空き番を使う）。
 * 例: 徳阿-キャ本1, 徳阿-キャ本2（本作）のあと本作2は 徳阿-キャ本3…
 * @param {Object[]} plans
 * @param {{ year?: string|number }=} options
 */
function extractCultivationTagNumber_(tag, prefix) {
  const t = String(tag || '').trim();
  const p = String(prefix || '');
  if (!p || !t.startsWith(p)) return null;
  const rest = t.slice(p.length);
  if (!/^\d+$/.test(rest)) return null;
  const n = parseInt(rest, 10);
  return (n > 0) ? n : null;
}

/** 同一年度・同一プレフィックスで既に使われている番号（excludeIds の計画は除外） */
function collectUsedCultivationTagNumbers_(year, prefix, excludeIdSet) {
  const used = {};
  if (!year || !prefix) return used;
  const sheet = TENANT_SS.getSheetByName('栽培計画');
  if (!sheet || sheet.getLastRow() < 2) return used;
  const last = sheet.getLastRow();
  const data = sheet.getRange(2, 1, last - 1, 6).getValues();
  const yearStr = String(year);
  const exclude = excludeIdSet || {};
  data.forEach(row => {
    if (String(row[1]) !== yearStr) return;
    let plan = null;
    try {
      plan = parseCultivationPlanJson_(row[5]);
    } catch (e) {
      plan = null;
    }
    if (!plan) return;
    const pid = String(plan.id || row[2] || '');
    if (pid && exclude[pid]) return;
    const n = extractCultivationTagNumber_(plan.tag, prefix);
    if (n) used[n] = true;
  });
  return used;
}

function assignCultivationPlanTags_(plans, options) {
  if (!plans || plans.length === 0) return;
  const opts = options || {};
  const year = opts.year != null && String(opts.year).trim() !== ''
    ? opts.year
    : (plans[0] && plans[0].year);
  const groups = {};
  const locationCodeMap = {};
  readLocationMasterDetails_().forEach(location => {
    if (!location || !location.name) return;
    locationCodeMap[String(location.name)] =
      String(location.tagAbbreviation || location.name).trim();
  });
  const cropCodeMap = readCropTagAbbreviationMap_();
  const excludeIdSet = {};
  plans.forEach(plan => {
    if (plan && plan.id != null) excludeIdSet[String(plan.id)] = true;
  });

  plans.forEach(plan => {
    const planting = (plan.tasks && plan.tasks.planting) ? plan.tasks.planting : [];
    const harvesting = (plan.tasks && plan.tasks.harvesting) ? plan.tasks.harvesting : [];
    const getEarliest = cells => {
      let earliest = 9999;
      cells.forEach(c => {
        const mIdx = Number(c.monthIndex);
        const pIdx = (c.periodIndex != null) ? Number(c.periodIndex) : Number(c.period);
        if (!isNaN(mIdx) && !isNaN(pIdx)) {
          const idx = mIdx * 6 + pIdx;
          if (idx < earliest) earliest = idx;
        }
      });
      return earliest;
    };
    const earliestPlanting = getEarliest(planting);
    const earliestHarvesting = getEarliest(harvesting);
    const crop = plan.crop || '';
    const location = String(plan.location || '').trim();
    const planType = resolveCultivationPlanType_(plan);
    const groupKey = location + '\t' + crop + '\t' + planType;
    if (!groups[groupKey]) groups[groupKey] = {
      crop: crop,
      location: location,
      planType: planType,
      items: []
    };
    groups[groupKey].items.push({
      plan: plan,
      earliestPlanting: earliestPlanting,
      earliestHarvesting: earliestHarvesting,
      idx: groups[groupKey].items.length
    });
  });

  Object.keys(groups).forEach(groupKey => {
    const group = groups[groupKey];
    // 定植早い順 → その順を保ったまま収穫早い順（＝収穫優先、同時期は定植順）
    group.items.sort((a, b) =>
      (a.earliestPlanting - b.earliestPlanting) || (a.idx - b.idx)
    );
    group.items.forEach((item, i) => { item.idx = i; });
    group.items.sort((a, b) =>
      (a.earliestHarvesting - b.earliestHarvesting) || (a.idx - b.idx)
    );
    const locationCode = group.location
      ? (locationCodeMap[group.location] || group.location)
      : '';
    const cropCode = cropCodeMap[group.crop] || group.crop || '';
    const typeCode = group.planType === '試作' ? '試' : '本';
    const mid = cropCode + typeCode;
    const prefix = locationCode ? (locationCode + '-' + mid) : mid;
    const usedNums = collectUsedCultivationTagNumbers_(year, prefix, excludeIdSet);
    let next = 1;
    group.items.forEach(item => {
      while (usedNums[next]) next++;
      item.plan.tag = prefix + next;
      usedNums[next] = true;
      next++;
    });
  });
}

// ===== 育苗場所マスタ / 作物栽培設定 / 播種記録 =====
const NURSERY_LOCATION_HEADERS_ = ['ID', '場所名', '圃場ID', '圃場名', '方向', '備考', '拠点', '地図緯度', '地図経度', '地図ズーム'];
const CROP_CULT_SETTING_HEADERS_ = ['作物名', '播種穴数', '備考'];
const SOWING_RECORD_HEADERS_ = ['記録時間', '記録者', 'TAG', '作物名', '品種名', '区画', '方向', '播種日', '枚数', '穴数', '計画ID', 'システムID', '備考'];

function ensureNurseryLocationSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('育苗場所マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('育苗場所マスタ');
    sheet.appendRow(NURSERY_LOCATION_HEADERS_.slice());
    sheet.getRange(1, 1, 1, NURSERY_LOCATION_HEADERS_.length).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), NURSERY_LOCATION_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    NURSERY_LOCATION_HEADERS_.forEach((h, idx) => {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function ensureCropCultSettingSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('作物栽培設定マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('作物栽培設定マスタ');
    sheet.appendRow(CROP_CULT_SETTING_HEADERS_.slice());
    sheet.getRange(1, 1, 1, CROP_CULT_SETTING_HEADERS_.length).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), CROP_CULT_SETTING_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    CROP_CULT_SETTING_HEADERS_.forEach((h, idx) => {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function ensureSowingRecordSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('播種記録');
  if (!sheet) {
    sheet = ss.insertSheet('播種記録');
    sheet.appendRow(SOWING_RECORD_HEADERS_.slice());
    sheet.getRange(1, 1, 1, SOWING_RECORD_HEADERS_.length).setFontWeight('bold');
  } else {
    const needCols = Math.max(sheet.getLastColumn(), SOWING_RECORD_HEADERS_.length);
    const headers = sheet.getRange(1, 1, 1, needCols).getValues()[0].map(h => String(h || '').trim());
    SOWING_RECORD_HEADERS_.forEach((h, idx) => {
      if (!headers[idx]) sheet.getRange(1, idx + 1).setValue(h);
    });
  }
  return sheet;
}

function readNurseryLocationList_() {
  const sheet = ensureNurseryLocationSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const colCount = Math.max(NURSERY_LOCATION_HEADERS_.length, 6);
  const values = sheet.getRange(2, 1, last - 1, colCount).getValues();
  return values.map(r => ({
    id: String(r[0] || '').trim(),
    name: String(r[1] || '').trim(),
    polyId: String(r[2] || '').trim(),
    polyName: String(r[3] || '').trim(),
    direction: String(r[4] || '').trim(),
    note: String(r[5] || '').trim(),
    locationName: String(r[6] || '').trim(),
    mapLat: (r[7] === '' || r[7] == null) ? '' : r[7],
    mapLng: (r[8] === '' || r[8] == null) ? '' : r[8],
    mapZoom: (r[9] === '' || r[9] == null) ? '' : r[9]
  })).filter(x => x.id || x.name);
}

function readCropCultSettingList_() {
  const sheet = ensureCropCultSettingSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, 3).getValues();
  return values.map(r => ({
    cropName: String(r[0] || '').trim(),
    sowingHoles: (r[1] === '' || r[1] == null) ? '' : r[1],
    note: String(r[2] || '').trim()
  })).filter(x => x.cropName);
}

function readSowingRecordList_() {
  const sheet = ensureSowingRecordSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, SOWING_RECORD_HEADERS_.length).getValues();
  return values.map(r => ({
    recordedAt: String(r[0] || '').trim(),
    author: String(r[1] || '').trim(),
    tag: String(r[2] || '').trim(),
    cropName: String(r[3] || '').trim(),
    variety: String(r[4] || '').trim(),
    nurseryName: String(r[5] || '').trim(),
    direction: String(r[6] || '').trim(),
    sowingDate: r[7] instanceof Date ? Utilities.formatDate(r[7], 'Asia/Tokyo', 'yyyy-MM-dd') : String(r[7] || '').trim(),
    trays: Number(r[8]) || 0,
    holes: (r[9] === '' || r[9] == null) ? '' : r[9],
    planId: String(r[10] || '').trim(),
    recordId: String(r[11] || '').trim(),
    note: String(r[12] || '').trim()
  })).filter(x => x.tag || x.cropName || x.trays);
}

function appendSowingRecordFromWork_(recordData, author, recordId) {
  if (!recordData || !recordData.sowingRecord) return;
  const s = recordData.sowingRecord;
  const sheet = ensureSowingRecordSheet_();
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  sheet.appendRow([
    now,
    author || '',
    String(s.tag || '').trim(),
    String(s.cropName || recordData.crop || '').trim(),
    String(s.variety || '').trim(),
    String(s.nurseryName || '').trim(),
    String(s.direction || '').trim(),
    String(s.sowingDate || recordData.workDate || '').trim(),
    Number(s.trays) || 0,
    (s.holes === '' || s.holes == null) ? '' : s.holes,
    String(s.planId || '').trim(),
    recordId || '',
    String(s.note || '').trim()
  ]);
}

/** 作業予定の「枚数・時間」または計画から播種枚数（粒）を取る */
function parseScheduleSowingTrays_(hoursCell, plan) {
  const qty = farmBoardParseQty_(hoursCell);
  if (qty.trays > 0) return qty.trays;
  if (qty.grains > 0) return qty.grains;
  return Number(plan && plan.trays) || 0;
}

/** 作業一覧完了から作った播種記録のシステムID */
function sowingRecordIdFromSchedule_(placeId) {
  const parsed = parseCpPlaceKind_(placeId);
  const marker = String((parsed && parsed.marker) || String(placeId || '').split('|')[0] || '').trim();
  if (!marker) return '';
  return 'sched-sow:' + marker;
}

/**
 * 作業一覧で播種を完了したとき、播種記録へ実績を書く（播種進捗と同期）。
 * 既に同IDの記録があればスキップ。
 */
function ensureSowingRecordAfterScheduleComplete_(rowData, userName, completedAt) {
  rowData = rowData || [];
  const placeId = String(rowData[10] || '').trim();
  const workName = String(rowData[0] || '').trim();
  const parsed = parseCpPlaceKind_(placeId);
  if (parsed.kind !== 'sow' && workName !== '播種') return null;

  const recordId = sowingRecordIdFromSchedule_(placeId);
  if (!recordId) return null;

  const existing = readSowingRecordList_();
  if (existing.some(function(r) { return String(r.recordId || '') === recordId; })) {
    return recordId;
  }

  const planId = (parsed.planIds && parsed.planIds[0]) || '';
  const planLookup = buildCultivationPlanLookupById_();
  const plan = planId ? planLookup[planId] : null;
  const trays = parseScheduleSowingTrays_(rowData[6], plan);
  const tag = String(rowData[7] || (plan && plan.tag) || '').trim();
  const cropName = String(rowData[2] || (plan && plan.crop) || '').trim();

  appendSowingRecordFromWork_({
    crop: cropName,
    workDate: completedAt,
    sowingRecord: {
      tag: tag,
      cropName: cropName,
      variety: (plan && plan.variety) || '',
      nurseryName: '',
      direction: '',
      sowingDate: completedAt,
      trays: trays,
      holes: (plan && plan.holes != null) ? plan.holes : '',
      planId: planId,
      note: '作業一覧から完了'
    }
  }, userName || '', recordId);
  return recordId;
}

/** 作業一覧の播種完了取消時、自動作成した播種記録を削除 */
function removeSowingRecordAfterScheduleUndo_(rowData) {
  rowData = rowData || [];
  const placeId = String(rowData[10] || '').trim();
  const recordId = sowingRecordIdFromSchedule_(placeId);
  if (!recordId) return false;
  const sheet = ensureSowingRecordSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const numRows = last - 1;
  const values = sheet.getRange(2, 1, numRows, SOWING_RECORD_HEADERS_.length).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][11] || '') === recordId) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

/** 作業予定データから完了済み播種の計画ID別実績枚数を集計 */
function buildCompletedSowTraysByPlanIdFromData_(sData, planLookup) {
  const map = {};
  (sData || []).forEach(function(row) {
    if (!String(row[8] || '').trim()) return;
    const placeId = String(row[10] || '');
    const workName = String(row[0] || '').trim();
    const parsed = parseCpPlaceKind_(placeId);
    if (parsed.kind !== 'sow' && workName !== '播種') return;
    const planIds = (parsed.planIds && parsed.planIds.length) ? parsed.planIds : [];
    planIds.forEach(function(pid) {
      const plan = planLookup[pid];
      const trays = parseScheduleSowingTrays_(row[6], plan);
      map[pid] = (map[pid] || 0) + trays;
    });
  });
  return map;
}

/** 完了済み播種の作業予定から計画ID別の実績枚数を集計 */
function buildCompletedSowTraysByPlanId_() {
  const ss = TENANT_SS;
  const schedSheet = ss.getSheetByName('作業予定');
  if (!schedSheet || schedSheet.getLastRow() < 2) return {};
  const numRows = schedSheet.getLastRow() - 1;
  const sData = schedSheet.getRange(2, 1, numRows, 11).getValues();
  const planLookup = buildCultivationPlanLookupById_();
  return buildCompletedSowTraysByPlanIdFromData_(sData, planLookup);
}

/** 播種・育苗で共通利用するシート読込（1回だけ） */
function loadSowingSharedContext_() {
  const planLookup = buildCultivationPlanLookupById_();
  const records = readSowingRecordList_();
  let sData = [];
  const schedSheet = TENANT_SS.getSheetByName('作業予定');
  if (schedSheet && schedSheet.getLastRow() > 1) {
    sData = schedSheet.getRange(2, 1, schedSheet.getLastRow() - 1, 11).getValues();
  }
  return {
    planLookup: planLookup,
    records: records,
    sData: sData,
    scheduleState: buildCpScheduleProgressState_(sData),
    scheduleDoneByPlan: buildCompletedSowTraysByPlanIdFromData_(sData, planLookup)
  };
}

function buildCultivationPlanLookupById_() {
  const map = {};
  const sheet = TENANT_SS.getSheetByName('栽培計画');
  if (!sheet || sheet.getLastRow() < 2) return map;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  data.forEach(r => {
    try {
      const plan = JSON.parse(String(r[5] || '{}'));
      if (plan && plan.id) {
        if (!plan.year) plan.year = r[1];
        map[String(plan.id)] = plan;
      }
    } catch (e) {}
  });
  return map;
}

function lookupCultivationByTag(params) {
  const tag = String((params && params.tag) || '').trim();
  if (!tag) return { success: true, plan: null };
  const yearFilter = (params && params.year != null && String(params.year).trim() !== '')
    ? String(params.year).trim()
    : '';
  const sheet = TENANT_SS.getSheetByName('栽培計画');
  if (!sheet || sheet.getLastRow() < 2) return { success: true, plan: null };
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  let foundExactYear = null;
  let foundExactYearExecuted = null;
  let foundAny = null;
  let foundAnyExecuted = null;
  for (let i = 0; i < data.length; i++) {
    try {
      const plan = JSON.parse(String(data[i][5] || '{}'));
      if (!(plan && String(plan.tag || '').trim() === tag)) continue;
      const candidate = {
        id: plan.id || '',
        year: plan.year || data[i][1],
        crop: plan.crop || String(data[i][3] || ''),
        variety: plan.variety || String(data[i][4] || ''),
        tag: plan.tag || tag,
        trays: plan.trays || 0,
        holes: plan.holes,
        status: plan.status || ''
      };
      const yearMatch = !yearFilter || String(candidate.year) === yearFilter;
      if (yearMatch) {
        if (!foundExactYear) foundExactYear = candidate;
        if (plan.status === 'executed') {
          foundExactYearExecuted = candidate;
          break;
        }
      } else {
        if (!foundAny) foundAny = candidate;
        if (plan.status === 'executed' && !foundAnyExecuted) foundAnyExecuted = candidate;
      }
    } catch (e) {}
  }
  return {
    success: true,
    plan: foundExactYearExecuted || foundExactYear || foundAnyExecuted || foundAny
  };
}

/** 作業予定シートから栽培計画ごとの完了状態を集計 */
function buildCpScheduleProgressState_(sData) {
  const state = {};
  function ensure(id) {
    const k = String(id);
    if (!state[k]) {
      state[k] = {
        procureDone: false,
        sowDone: false,
        plantDone: false,
        worksDone: {},
        worksExist: {}
      };
    }
    return state[k];
  }
  (sData || []).forEach(function(row) {
    const placeId = String(row[10] || '');
    if (!placeId) return;
    const parsed = parseCpPlaceKind_(placeId);
    const done = !!(row[8]);
    if (parsed.kind === 'procure') {
      parseCpProcurePlanIds_(placeId).forEach(function(pid) {
        const st = ensure(pid);
        if (done) st.procureDone = true;
      });
    } else if (parsed.kind === 'sow') {
      parsed.planIds.forEach(function(pid) {
        const st = ensure(pid);
        if (done) st.sowDone = true;
      });
    } else if (parsed.kind === 'plant') {
      parsed.planIds.forEach(function(pid) {
        const st = ensure(pid);
        if (done) st.plantDone = true;
      });
    } else if (parsed.kind === 'work') {
      parsed.planIds.forEach(function(pid) {
        const st = ensure(pid);
        const eid = String(parsed.entryId || '');
        if (!eid) return;
        st.worksExist[eid] = true;
        if (done) st.worksDone[eid] = true;
      });
    }
  });
  return state;
}

/** 1計画の栽培パイプライン＋品目別作業の進捗ラベルを算出 */
function computePlanCropWorkProgress_(plan, state, entries) {
  const st = (state && state[String(plan.id)]) || {
    procureDone: false,
    sowDone: false,
    plantDone: false,
    worksDone: {},
    worksExist: {}
  };
  const hasSowing = ((plan.tasks && plan.tasks.sowing) || []).length > 0;
  const needsProcure = hasSowing && cpPlanSeedNeedCount_(plan) > 0;
  const entriesSorted = entries || [];
  const totalWorks = entriesSorted.length;
  let completedWorks = 0;
  entriesSorted.forEach(function(e) {
    if (st.worksDone[String(e.id)]) completedWorks++;
  });

  let statusLabel = '';
  let nextLabel = '';
  let stageCode = 'all_done';

  if (needsProcure && !st.procureDone) {
    statusLabel = '調達待ち';
    nextLabel = '調達';
    stageCode = 'procure_pending';
  } else if (hasSowing && !st.sowDone) {
    statusLabel = (needsProcure && st.procureDone) ? '調達完了' : '播種待ち';
    nextLabel = '播種';
    stageCode = 'sow_pending';
  } else if (!st.plantDone) {
    statusLabel = (hasSowing && st.sowDone) ? '播種完了' : '定植待ち';
    nextLabel = '定植';
    stageCode = 'plant_pending';
  } else if (totalWorks === 0) {
    statusLabel = '定植完了';
    nextLabel = '';
    stageCode = 'all_done';
    completedWorks = 0;
  } else {
    let lastDoneName = '定植';
    let nextWorkName = '';
    let allDone = true;
    for (let i = 0; i < entriesSorted.length; i++) {
      const e = entriesSorted[i];
      const eid = String(e.id);
      if (!st.worksDone[eid]) {
        allDone = false;
        nextWorkName = e.workName;
        break;
      }
      lastDoneName = e.workName;
    }
    if (allDone) {
      statusLabel = lastDoneName + 'まで完了';
      nextLabel = '';
      stageCode = 'all_done';
      completedWorks = totalWorks;
    } else {
      statusLabel = lastDoneName + 'まで完了';
      nextLabel = nextWorkName;
      stageCode = 'work_pending';
    }
  }

  return {
    statusLabel: statusLabel,
    nextLabel: nextLabel,
    stageCode: stageCode,
    completedWorks: completedWorks,
    totalWorks: totalWorks,
    plantDone: !!st.plantDone,
    sowDone: !!st.sowDone,
    procureDone: !!st.procureDone
  };
}

/** 圃場別・TAG別の栽培作業進捗一覧（実行済み栽培計画ベース） */
function getCropWorkProgressSummary(params) {
  const yearFilter = (params && params.year) ? String(params.year) : '';
  const planLookup = buildCultivationPlanLookupById_();
  const ss = TENANT_SS;
  const schedSheet = ss.getSheetByName('作業予定');
  let sData = [];
  if (schedSheet && schedSheet.getLastRow() > 1) {
    sData = schedSheet.getRange(2, 1, schedSheet.getLastRow() - 1, 11).getValues();
  }
  const state = buildCpScheduleProgressState_(sData);
  const cropEntriesCache = {};
  function entriesForCrop(crop) {
    const c = String(crop || '').trim();
    if (!c) return [];
    if (!cropEntriesCache[c]) {
      try {
        const res = getCropWorkPlan({ cropName: c });
        cropEntriesCache[c] = (res.plan && res.plan.entries) || [];
      } catch (e) {
        cropEntriesCache[c] = [];
      }
    }
    return cropEntriesCache[c];
  }

  const plans = Object.keys(planLookup).map(function(k) { return planLookup[k]; }).filter(function(p) {
    if (!p || p.status !== 'executed') return false;
    if (yearFilter && String(p.year) !== yearFilter) return false;
    return true;
  });

  const byField = [];
  const byTag = [];

  plans.forEach(function(plan) {
    const entries = entriesForCrop(plan.crop);
    const prog = computePlanCropWorkProgress_(plan, state, entries);
    const fieldIds = (plan.fieldIds && plan.fieldIds.length) ? plan.fieldIds : [''];
    const fieldNames = cpPlanFieldNames_(plan);
    const base = {
      planId: plan.id,
      year: plan.year,
      crop: plan.crop || '',
      variety: plan.variety || '',
      tag: plan.tag || '',
      fieldNames: fieldNames,
      statusLabel: prog.statusLabel,
      nextLabel: prog.nextLabel,
      stageCode: prog.stageCode,
      completedWorks: prog.completedWorks,
      totalWorks: prog.totalWorks,
      displayProgress: prog.nextLabel
        ? (prog.statusLabel + ' → 次: ' + prog.nextLabel)
        : prog.statusLabel
    };
    byTag.push(base);
    fieldIds.forEach(function(fid) {
      byField.push({
        planId: base.planId,
        year: base.year,
        crop: base.crop,
        variety: base.variety,
        tag: base.tag,
        fieldNames: base.fieldNames,
        statusLabel: base.statusLabel,
        nextLabel: base.nextLabel,
        stageCode: base.stageCode,
        completedWorks: base.completedWorks,
        totalWorks: base.totalWorks,
        displayProgress: base.displayProgress,
        fieldId: String(fid || ''),
        fieldName: fid ? resolveCpFieldDisplayName_(fid) : '(圃場未選択)'
      });
    });
  });

  byField.sort(function(a, b) {
    return String(a.fieldName).localeCompare(String(b.fieldName), 'ja')
      || String(a.tag).localeCompare(String(b.tag), 'ja');
  });
  byTag.sort(function(a, b) {
    return String(a.tag).localeCompare(String(b.tag), 'ja')
      || String(a.crop).localeCompare(String(b.crop), 'ja');
  });

  return {
    success: true,
    byField: byField,
    byTag: byTag,
    year: yearFilter || 'all'
  };
}

/** 圃場表示名の照合用（畝付きラベルは括弧前を基準名に） */
function normalizeFieldNameForMatch_(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  const paren = s.indexOf('(');
  if (paren > 0) return s.slice(0, paren).trim();
  return s;
}

/**
 * 収穫中の畑一覧＋そろそろ終わりそうな畑。
 * 作業記録の「収穫」未完了を基準にし、栽培計画の収穫半旬で終盤判定する。
 */
function getHarvestingFieldsSummary(params) {
  const todayStr = String((params && params.today) || '').trim()
    || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const todayParts = todayStr.split('-').map(Number);
  const today = (todayParts.length >= 3)
    ? new Date(todayParts[0], todayParts[1] - 1, todayParts[2])
    : new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const ALMOST_DAYS = 10;
  const LONG_HARVEST_DAYS = 21;

  const ss = TENANT_SS;
  const workDeptMap = buildWorkDeptMapFromMaster_();
  const fieldNameToPolyId = {};
  try {
    getSavedPolygons().forEach(function(p) {
      if (p && p.name && p.id) fieldNameToPolyId[String(p.name)] = p.id;
    });
  } catch (e) {}

  // field|crop → 集計
  const groups = {};
  function ensureGroup(fieldName, cropName) {
    const f = String(fieldName || '').trim();
    const c = String(cropName || '').trim();
    const key = f + '\t' + c;
    if (!groups[key]) {
      groups[key] = {
        fieldName: f,
        cropName: c,
        polyId: fieldNameToPolyId[f] || '',
        depts: [],
        authors: [],
        firstYmd: '',
        lastYmd: '',
        lastIncompleteYmd: '',
        lastCompleteYmd: '',
        lastProgress: '',
        lastWorkName: '',
        incompleteCount: 0,
        completeCount: 0
      };
    }
    return groups[key];
  }

  const workSheet = ss.getSheetByName('作業記録');
  if (workSheet && workSheet.getLastRow() > 1) {
    const wData = workSheet.getDataRange().getValues();
    for (let i = 1; i < wData.length; i++) {
      const workName = String(wData[i][4] || '');
      if (!workName || workName.indexOf('収穫') < 0) continue;
      const fieldRaw = String(wData[i][1] || '');
      const primaryField = fieldRaw.split(',')[0].trim();
      if (!primaryField) continue;
      const cropName = String(wData[i][5] || '').trim();
      const progress = String(wData[i][10] || '').trim();
      const author = String(wData[i][2] || '').trim();
      const workDate = wData[i][3];
      const ymd = formatWorkDateYmd_(workDate);
      const dept = workDeptMap[workName] || '未分類';
      const g = ensureGroup(primaryField, cropName);

      if (ymd) {
        if (!g.firstYmd || ymd < g.firstYmd) g.firstYmd = ymd;
        if (!g.lastYmd || ymd > g.lastYmd) g.lastYmd = ymd;
      }
      if (author && g.authors.indexOf(author) < 0) g.authors.push(author);
      if (dept && g.depts.indexOf(dept) < 0) g.depts.push(dept);
      g.lastWorkName = workName;

      if (progress === '完了') {
        g.completeCount++;
        if (ymd && (!g.lastCompleteYmd || ymd >= g.lastCompleteYmd)) {
          g.lastCompleteYmd = ymd;
        }
      } else {
        g.incompleteCount++;
        if (ymd && (!g.lastIncompleteYmd || ymd >= g.lastIncompleteYmd)) {
          g.lastIncompleteYmd = ymd;
          g.lastProgress = progress || '途中';
        } else if (!g.lastProgress) {
          g.lastProgress = progress || '途中';
        }
      }
    }
  }

  // 実行済み計画の収穫窓（圃場名×作物で参照）
  const planLookup = buildCultivationPlanLookupById_();
  const planWindows = [];
  Object.keys(planLookup).forEach(function(k) {
    const plan = planLookup[k];
    if (!plan || plan.status !== 'executed') return;
    const harvestCells = (plan.tasks && Array.isArray(plan.tasks.harvesting)) ? plan.tasks.harvesting : [];
    if (!harvestCells.length) return;
    let windowStart = null;
    let windowEnd = null;
    harvestCells.forEach(function(cell) {
      try {
        const parts = cpCellToDateParts(plan.year, cell);
        if (!windowStart || parts.start < windowStart) windowStart = parts.start;
        if (!windowEnd || parts.end > windowEnd) windowEnd = parts.end;
      } catch (e) {}
    });
    if (!windowStart || !windowEnd) return;
    const start0 = new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate());
    const end0 = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate());
    const fieldIds = (plan.fieldIds && plan.fieldIds.length) ? plan.fieldIds : [];
    const displayNames = fieldIds.length
      ? fieldIds.map(resolveCpFieldDisplayName_)
      : [];
    const baseNames = displayNames.map(normalizeFieldNameForMatch_).filter(Boolean);
    planWindows.push({
      planId: plan.id,
      year: plan.year,
      crop: String(plan.crop || '').trim(),
      variety: plan.variety || '',
      tag: plan.tag || '',
      fieldNames: cpPlanFieldNames_(plan),
      baseNames: baseNames,
      displayNames: displayNames,
      harvestLabel: formatCpPeriodLabel(plan.year, harvestCells),
      harvestStart: Utilities.formatDate(start0, 'Asia/Tokyo', 'yyyy-MM-dd'),
      harvestEnd: Utilities.formatDate(end0, 'Asia/Tokyo', 'yyyy-MM-dd'),
      startMs: start0.getTime(),
      endMs: end0.getTime()
    });
  });

  function findPlanFor(fieldName, cropName) {
    const base = normalizeFieldNameForMatch_(fieldName);
    const crop = String(cropName || '').trim();
    let best = null;
    planWindows.forEach(function(pw) {
      if (crop && pw.crop && pw.crop !== crop) return;
      const hit = pw.baseNames.some(function(bn) {
        return bn === base || bn === fieldName || String(fieldName).indexOf(bn) === 0;
      }) || (pw.displayNames.indexOf(fieldName) >= 0);
      if (!hit) return;
      // 収穫期間が今日に近い／重なるものを優先
      if (!best) {
        best = pw;
        return;
      }
      const bestDist = Math.min(Math.abs(todayMs - best.startMs), Math.abs(todayMs - best.endMs));
      const dist = Math.min(Math.abs(todayMs - pw.startMs), Math.abs(todayMs - pw.endMs));
      if (dist < bestDist) best = pw;
    });
    return best;
  }

  const harvesting = [];
  Object.keys(groups).forEach(function(key) {
    const g = groups[key];
    if (!g.incompleteCount) return;
    // 最終の未完了より後（同日含む）に完了があるなら収穫中ではない
    if (g.lastCompleteYmd && g.lastIncompleteYmd && g.lastCompleteYmd >= g.lastIncompleteYmd) return;
    if (g.lastCompleteYmd && !g.lastIncompleteYmd) return;

    const plan = findPlanFor(g.fieldName, g.cropName);
    let daysToEnd = null;
    let daysSinceFirst = null;
    let windowProgress = null;
    let almostDone = false;
    const reasons = [];

    if (g.firstYmd) {
      const fp = g.firstYmd.split('-').map(Number);
      if (fp.length >= 3) {
        const first = new Date(fp[0], fp[1] - 1, fp[2]);
        first.setHours(0, 0, 0, 0);
        daysSinceFirst = Math.max(0, Math.round((todayMs - first.getTime()) / 86400000));
      }
    }

    if (plan) {
      daysToEnd = Math.round((plan.endMs - todayMs) / 86400000);
      const span = Math.max(1, plan.endMs - plan.startMs);
      windowProgress = Math.max(0, Math.min(1, (todayMs - plan.startMs) / span));
      if (todayMs > plan.endMs) {
        almostDone = true;
        reasons.push('計画の収穫期間を過ぎています');
      } else if (daysToEnd <= ALMOST_DAYS) {
        almostDone = true;
        reasons.push('計画の収穫終了まであと' + daysToEnd + '日');
      } else if (windowProgress >= 0.75 && todayMs >= plan.startMs) {
        almostDone = true;
        reasons.push('計画収穫期間の終盤');
      }
    }
    if (!almostDone && daysSinceFirst != null && daysSinceFirst >= LONG_HARVEST_DAYS) {
      almostDone = true;
      reasons.push('収穫開始から' + daysSinceFirst + '日経過');
    }

    harvesting.push({
      fieldName: g.fieldName,
      cropName: g.cropName,
      polyId: g.polyId,
      depts: g.depts,
      authors: g.authors,
      firstHarvestYmd: g.firstYmd,
      lastHarvestYmd: g.lastIncompleteYmd || g.lastYmd,
      lastProgress: g.lastProgress || '途中',
      workName: g.lastWorkName || '収穫',
      daysSinceFirst: daysSinceFirst,
      almostDone: almostDone,
      almostReasons: reasons,
      statusLabel: almostDone ? 'そろそろ終わり' : '収穫中',
      planId: plan ? plan.planId : '',
      variety: plan ? plan.variety : '',
      tag: plan ? plan.tag : '',
      harvestLabel: plan ? plan.harvestLabel : '',
      harvestStart: plan ? plan.harvestStart : '',
      harvestEnd: plan ? plan.harvestEnd : '',
      daysToEnd: daysToEnd,
      windowProgress: windowProgress
    });
  });

  harvesting.sort(function(a, b) {
    if (!!b.almostDone !== !!a.almostDone) return a.almostDone ? -1 : 1;
    const da = (a.daysToEnd != null) ? a.daysToEnd : 9999;
    const db = (b.daysToEnd != null) ? b.daysToEnd : 9999;
    if (da !== db) return da - db;
    return String(a.fieldName).localeCompare(String(b.fieldName), 'ja')
      || String(a.cropName).localeCompare(String(b.cropName), 'ja');
  });

  const almostDoneList = harvesting.filter(function(r) { return !!r.almostDone; });

  return {
    success: true,
    today: todayStr,
    harvesting: harvesting,
    almostDone: almostDoneList,
    counts: {
      harvesting: harvesting.length,
      almostDone: almostDoneList.length
    }
  };
}

/**
 * 天気優先事項用: 実行済み計画のうち「定植待ち」かつ定植半旬が開始済み（期間内〜後）の候補。
 * 播種→定植まで進んでいない（調達待ち・播種待ち）は除外。
 */
function getWeatherPlantingPriorities(params) {
  const todayStr = String((params && params.today) || '').trim()
    || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const todayParts = todayStr.split('-').map(Number);
  const today = (todayParts.length >= 3)
    ? new Date(todayParts[0], todayParts[1] - 1, todayParts[2])
    : new Date();
  today.setHours(0, 0, 0, 0);

  const planLookup = buildCultivationPlanLookupById_();
  const ss = TENANT_SS;
  const schedSheet = ss.getSheetByName('作業予定');
  let sData = [];
  if (schedSheet && schedSheet.getLastRow() > 1) {
    sData = schedSheet.getRange(2, 1, schedSheet.getLastRow() - 1, 11).getValues();
  }
  const state = buildCpScheduleProgressState_(sData);
  const items = [];

  Object.keys(planLookup).forEach(function(k) {
    const plan = planLookup[k];
    if (!plan || plan.status !== 'executed') return;

    const plantingCells = (plan.tasks && Array.isArray(plan.tasks.planting)) ? plan.tasks.planting : [];
    if (!plantingCells.length) return;

    const prog = computePlanCropWorkProgress_(plan, state, []);
    // 定植待ちのみ（播種まで完了していない／既に定植済みは除外）
    if (prog.stageCode !== 'plant_pending') return;
    const hasSowing = ((plan.tasks && plan.tasks.sowing) || []).length > 0;
    if (hasSowing && !prog.sowDone) return;

    let windowStart = null;
    let windowEnd = null;
    plantingCells.forEach(function(cell) {
      try {
        const parts = cpCellToDateParts(plan.year, cell);
        if (!windowStart || parts.start < windowStart) windowStart = parts.start;
        if (!windowEnd || parts.end > windowEnd) windowEnd = parts.end;
      } catch (e) {}
    });
    if (!windowStart || !windowEnd) return;

    const start0 = new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate());
    const end0 = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate());
    // 定植期間の開始日以降（期間内〜後）。開始前は出さない
    if (today.getTime() < start0.getTime()) return;

    const inWindow = today.getTime() <= end0.getTime();
    items.push({
      planId: plan.id,
      year: plan.year,
      crop: plan.crop || '',
      variety: plan.variety || '',
      tag: plan.tag || '',
      fieldNames: cpPlanFieldNames_(plan),
      statusLabel: prog.statusLabel,
      plantingLabel: formatCpPeriodLabel(plan.year, plantingCells),
      plantingStart: Utilities.formatDate(start0, 'Asia/Tokyo', 'yyyy-MM-dd'),
      plantingEnd: Utilities.formatDate(end0, 'Asia/Tokyo', 'yyyy-MM-dd'),
      phase: inWindow ? 'in' : 'after'
    });
  });

  items.sort(function(a, b) {
    return String(a.plantingStart || '').localeCompare(String(b.plantingStart || ''))
      || String(a.crop || '').localeCompare(String(b.crop || ''), 'ja');
  });

  return {
    success: true,
    today: todayStr,
    items: items
  };
}

function getSowingProgress(params) {
  return getSowingProgressFromContext_(loadSowingSharedContext_(), params);
}

function getSowingProgressFromContext_(ctx, params) {
  const yearFilter = (params && params.year) ? String(params.year) : '';
  const planLookup = ctx.planLookup;
  const plans = Object.keys(planLookup).map(k => planLookup[k]).filter(p => {
    if (!p || p.status !== 'executed') return false;
    if (yearFilter && String(p.year) !== yearFilter) return false;
    const sowing = (p.tasks && p.tasks.sowing) ? p.tasks.sowing : [];
    return sowing.length > 0;
  });
  const records = ctx.records;
  const byPlanId = {};
  const byTag = {};
  records.forEach(r => {
    const trays = Number(r.trays) || 0;
    const pid = String(r.planId || '').trim();
    if (pid) byPlanId[pid] = (byPlanId[pid] || 0) + trays;
    const key = r.tag || (r.cropName + '|' + r.variety);
    if (!byTag[key]) byTag[key] = { tag: r.tag, cropName: r.cropName, variety: r.variety, trays: 0, records: [] };
    byTag[key].trays += trays;
    byTag[key].records.push(r);
  });
  const scheduleDoneByPlan = ctx.scheduleDoneByPlan;
  const rows = plans.map(p => {
    const plannedTrays = Number(p.trays) || 0;
    const fromPlanId = byPlanId[String(p.id)] || 0;
    const hit = byTag[p.tag] || { trays: 0, records: [] };
    // 計画ID付き記録があれば優先（TAG集計との二重加算を避ける）
    const fromRecords = fromPlanId > 0 ? fromPlanId : (Number(hit.trays) || 0);
    const fromSchedule = scheduleDoneByPlan[String(p.id)] || 0;
    const doneTrays = Math.max(fromRecords, fromSchedule);
    const pct = plannedTrays > 0 ? Math.min(100, Math.round(doneTrays / plannedTrays * 100)) : (doneTrays > 0 ? 100 : 0);
    let periodLabel = '';
    try {
      periodLabel = formatCpPeriodLabel(p.year, (p.tasks && p.tasks.sowing) || []);
    } catch (e) { periodLabel = ''; }
    return {
      planId: p.id,
      year: p.year,
      crop: p.crop || '',
      variety: p.variety || '',
      tag: p.tag || '',
      plannedTrays: plannedTrays,
      doneTrays: doneTrays,
      remainTrays: Math.max(0, plannedTrays - doneTrays),
      progressPct: pct,
      periodLabel: periodLabel,
      recordCount: (hit.records || []).length
    };
  });
  // 計画なしの実績も残す
  Object.keys(byTag).forEach(k => {
    const b = byTag[k];
    if (b.tag && rows.some(r => r.tag === b.tag)) return;
    if (!b.tag && rows.some(r => r.crop === b.cropName && r.variety === b.variety)) return;
    rows.push({
      planId: '',
      year: '',
      crop: b.cropName || '',
      variety: b.variety || '',
      tag: b.tag || '',
      plannedTrays: 0,
      doneTrays: b.trays || 0,
      remainTrays: 0,
      progressPct: 100,
      periodLabel: '',
      recordCount: (b.records || []).length,
      unplanned: true
    });
  });
  const byCrop = {};
  rows.forEach(r => {
    const c = r.crop || '(不明)';
    if (!byCrop[c]) byCrop[c] = { crop: c, plannedTrays: 0, doneTrays: 0, planCount: 0 };
    byCrop[c].plannedTrays += Number(r.plannedTrays) || 0;
    byCrop[c].doneTrays += Number(r.doneTrays) || 0;
    byCrop[c].planCount += 1;
  });
  const cropSummary = Object.keys(byCrop).map(k => {
    const c = byCrop[k];
    c.progressPct = c.plannedTrays > 0 ? Math.min(100, Math.round(c.doneTrays / c.plannedTrays * 100)) : (c.doneTrays > 0 ? 100 : 0);
    return c;
  }).sort((a, b) => String(a.crop).localeCompare(String(b.crop), 'ja'));
  return {
    success: true,
    rows: rows.sort((a, b) => String(a.crop).localeCompare(String(b.crop), 'ja') || String(a.tag).localeCompare(String(b.tag), 'ja')),
    cropSummary: cropSummary,
    records: records
  };
}

/**
 * 作業記録の播種UI用: いまの播種期間（またはまもなく／未完了）の実行済み計画一覧。
 * params: { today?, crop?, year?, includeDone?, includePastPlans? }
 */
function getCurrentSowingPlanOptions(params) {
  return getCurrentSowingPlanOptionsFromContext_(null, params);
}

function getCurrentSowingPlanOptionsFromContext_(ctx, params) {
  params = params || {};
  const todayStr = String(params.today || '').trim()
    || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const todayParts = todayStr.split('-').map(Number);
  const today = (todayParts.length >= 3)
    ? new Date(todayParts[0], todayParts[1] - 1, todayParts[2])
    : new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const cropFilter = String(params.crop || '').trim();
  const yearFilter = String(params.year || '').trim() || String(today.getFullYear());
  const includeDone = params.includeDone === true || params.includeDone === 'true';
  const includePastPlans = params.includePastPlans === true || params.includePastPlans === 'true';
  const lightProgress = params.lightProgress === true || params.lightProgress === 'true';
  const BEFORE_DAYS = 7;
  const AFTER_DAYS = 14;

  if (!ctx) ctx = loadSowingSharedContext_();
  const planLookup = ctx.planLookup;
  const state = ctx.scheduleState;
  const records = ctx.records;
  const scheduleDoneByPlan = ctx.scheduleDoneByPlan;

  const traysByPlanId = {};
  const traysByTag = {};
  records.forEach(function(r) {
    const trays = Number(r.trays) || 0;
    const pid = String(r.planId || '').trim();
    if (pid) traysByPlanId[pid] = (traysByPlanId[pid] || 0) + trays;
    const tag = String(r.tag || '').trim();
    if (!tag) return;
    traysByTag[tag] = (traysByTag[tag] || 0) + trays;
  });

  const items = [];
  Object.keys(planLookup).forEach(function(k) {
    const plan = planLookup[k];
    if (!plan || plan.status !== 'executed') return;
    if (yearFilter && String(plan.year) !== yearFilter) return;
    const crop = String(plan.crop || '').trim();
    if (cropFilter && crop !== cropFilter) return;
    const sowingCells = (plan.tasks && Array.isArray(plan.tasks.sowing)) ? plan.tasks.sowing : [];
    if (!sowingCells.length) return;

    let windowStart = null;
    let windowEnd = null;
    sowingCells.forEach(function(cell) {
      try {
        const parts = cpCellToDateParts(plan.year, cell);
        if (!windowStart || parts.start < windowStart) windowStart = parts.start;
        if (!windowEnd || parts.end > windowEnd) windowEnd = parts.end;
      } catch (e) {}
    });
    if (!windowStart || !windowEnd) return;
    const start0 = new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate());
    const end0 = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate());
    const startMs = start0.getTime();
    const endMs = end0.getTime();
    const earlyMs = startMs - BEFORE_DAYS * 86400000;
    const lateMs = endMs + AFTER_DAYS * 86400000;

    let prog;
    if (lightProgress && includePastPlans) {
      const pst = state[String(plan.id)];
      prog = {
        plantDone: !!(pst && pst.plantDone),
        sowDone: !!(pst && pst.sowDone),
        stageCode: '',
        statusLabel: ''
      };
    } else {
      prog = computePlanCropWorkProgress_(plan, state, []);
    }
    if (prog.plantDone && !includePastPlans) return;
    const sowDone = !!prog.sowDone;
    const plannedTrays = Number(plan.trays) || 0;
    const fromPlanId = traysByPlanId[String(plan.id)] || 0;
    const fromTag = traysByTag[String(plan.tag || '').trim()] || 0;
    const fromRecords = fromPlanId > 0 ? fromPlanId : fromTag;
    const doneTrays = Math.max(fromRecords, scheduleDoneByPlan[String(plan.id)] || 0);
    const traysDone = plannedTrays > 0 ? (doneTrays >= plannedTrays) : sowDone;
    if (!includePastPlans && !includeDone && traysDone && sowDone) return;

    const inCurrentWindow = todayMs >= earlyMs && todayMs <= lateMs;
    const overdueOpen = todayMs > endMs && !sowDone && !traysDone;
    if (!includePastPlans && !inCurrentWindow && !overdueOpen) return;

    let phase = 'in';
    if (todayMs < startMs) phase = 'soon';
    else if (todayMs > endMs) phase = 'after';

    const periodLabel = formatCpPeriodLabel(plan.year, sowingCells);
    const plantingCells = (plan.tasks && Array.isArray(plan.tasks.planting)) ? plan.tasks.planting : [];
    const harvestCells = (plan.tasks && Array.isArray(plan.tasks.harvesting)) ? plan.tasks.harvesting : [];
    const sowingLabel = periodLabel;
    let plantingLabel = '';
    let harvestLabel = '';
    try { plantingLabel = formatCpPeriodLabel(plan.year, plantingCells); } catch (eP) { plantingLabel = ''; }
    try { harvestLabel = formatCpPeriodLabel(plan.year, harvestCells); } catch (eH) { harvestLabel = ''; }
    items.push({
      planId: plan.id,
      year: plan.year,
      crop: crop,
      variety: plan.variety || '',
      tag: plan.tag || '',
      trays: plannedTrays,
      holes: plan.holes != null ? plan.holes : '',
      doneTrays: doneTrays,
      remainTrays: Math.max(0, plannedTrays - doneTrays),
      fieldNames: cpPlanFieldNames_(plan),
      periodLabel: periodLabel,
      sowingLabel: sowingLabel,
      plantingLabel: plantingLabel,
      harvestLabel: harvestLabel,
      sowingStart: Utilities.formatDate(start0, 'Asia/Tokyo', 'yyyy-MM-dd'),
      sowingEnd: Utilities.formatDate(end0, 'Asia/Tokyo', 'yyyy-MM-dd'),
      phase: phase,
      stageCode: prog.stageCode || '',
      statusLabel: prog.statusLabel || '',
      sowDone: sowDone
    });
  });

  items.sort(function(a, b) {
    const phaseOrder = { in: 0, soon: 1, after: 2 };
    const pa = phaseOrder[a.phase] != null ? phaseOrder[a.phase] : 9;
    const pb = phaseOrder[b.phase] != null ? phaseOrder[b.phase] : 9;
    if (pa !== pb) return pa - pb;
    return String(a.sowingStart || '').localeCompare(String(b.sowingStart || ''))
      || String(a.crop || '').localeCompare(String(b.crop || ''), 'ja')
      || String(a.tag || '').localeCompare(String(b.tag || ''), 'ja');
  });

  return {
    success: true,
    today: todayStr,
    year: yearFilter,
    crop: cropFilter,
    items: items
  };
}

/**
 * スケジュール画面の育苗記録新規追加用。
 * 現在期間の計画・育苗場所マスタ（場所カテゴリ／区画／方向）・穴数設定を返す。
 */
function getSowingNurseryFormOptions(params) {
  params = params || {};
  const includePastPlans = params.includePastPlans != null ? params.includePastPlans : true;
  const planRes = getCurrentSowingPlanOptions(Object.assign({}, params, {
    includeDone: params.includeDone != null ? params.includeDone : true,
    includePastPlans: includePastPlans,
    lightProgress: includePastPlans === true || includePastPlans === 'true'
  }));
  return buildSowingNurseryFormOptionsPayload_(planRes, params);
}

/** 進捗＋フォーム用データを1回のシート読込でまとめて返す */
function getSowingNurseryBundle(params) {
  params = params || {};
  const ctx = loadSowingSharedContext_();
  const year = String(params.year || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy'));
  const includePastPlans = params.includePastPlans != null ? params.includePastPlans : true;
  const progress = getSowingProgressFromContext_(ctx, { year: year });
  const planRes = getCurrentSowingPlanOptionsFromContext_(ctx, Object.assign({}, params, {
    year: year,
    includeDone: params.includeDone != null ? params.includeDone : true,
    includePastPlans: includePastPlans,
    lightProgress: includePastPlans === true || includePastPlans === 'true'
  }));
  const formOptions = buildSowingNurseryFormOptionsPayload_(planRes, params);
  return { success: true, progress: progress, formOptions: formOptions };
}

function buildSowingNurseryFormOptionsPayload_(planRes, params) {
  params = params || {};
  const items = (planRes && planRes.items) || [];
  const nurseryLocations = readNurseryLocationList_();
  const cropCultSettings = readCropCultSettingList_();

  const catMap = {};
  nurseryLocations.forEach(function(n) {
    const cat = String(n.polyName || '').trim() || '未分類';
    if (!catMap[cat]) catMap[cat] = [];
    catMap[cat].push(n);
  });
  const locationCategories = Object.keys(catMap).sort(function(a, b) {
    return String(a).localeCompare(String(b), 'ja');
  }).map(function(cat) {
    const rows = catMap[cat] || [];
    const plotMap = {};
    const directions = [];
    const dirSeen = {};
    let locationName = '';
    let mapLat = '';
    let mapLng = '';
    let mapZoom = '';
    rows.forEach(function(n) {
      if (!locationName && String(n.locationName || '').trim()) {
        locationName = String(n.locationName || '').trim();
      }
      if (mapLat === '' && n.mapLat !== '' && n.mapLat != null) mapLat = n.mapLat;
      if (mapLng === '' && n.mapLng !== '' && n.mapLng != null) mapLng = n.mapLng;
      if (mapZoom === '' && n.mapZoom !== '' && n.mapZoom != null) mapZoom = n.mapZoom;
      const d = String(n.direction || '').trim();
      if (d && !dirSeen[d]) { dirSeen[d] = true; directions.push(d); }
      const pname = String(n.name || '').trim();
      if (!pname) return;
      if (!plotMap[pname]) {
        plotMap[pname] = {
          id: n.id || '',
          polyId: String(n.polyId || '').trim(),
          name: pname,
          direction: d,
          polyName: n.polyName || '',
          note: n.note || '',
          dirs: []
        };
      }
      if (d && plotMap[pname].dirs.indexOf(d) < 0) plotMap[pname].dirs.push(d);
      if (!plotMap[pname].id && n.id) plotMap[pname].id = n.id;
      if (!plotMap[pname].polyId && n.polyId) plotMap[pname].polyId = String(n.polyId || '').trim();
    });
    const plots = Object.keys(plotMap).sort(function(a, b) {
      return String(a).localeCompare(String(b), 'ja');
    }).map(function(k) { return plotMap[k]; });
    directions.sort(function(a, b) { return String(a).localeCompare(String(b), 'ja'); });
    return { name: cat, plots: plots, directions: directions, locationName: locationName, mapLat: mapLat, mapLng: mapLng, mapZoom: mapZoom };
  });

  const cropSet = {};
  items.forEach(function(it) {
    const c = String(it.crop || '').trim();
    if (c) cropSet[c] = true;
  });
  cropCultSettings.forEach(function(s) {
    const c = String(s.cropName || '').trim();
    if (c) cropSet[c] = true;
  });
  // 予定にない作物も播種できるよう、作物マスタも候補に含める
  try {
    readMergedCropMasterList_().forEach(function(c) {
      const n = String((c && c.name) || c || '').trim();
      if (n) cropSet[n] = true;
    });
  } catch (eCrop) {}
  const crops = Object.keys(cropSet).sort(function(a, b) {
    return String(a).localeCompare(String(b), 'ja');
  });

  return {
    success: true,
    today: (planRes && planRes.today) || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'),
    year: (planRes && planRes.year) || String(new Date().getFullYear()),
    plans: items,
    crops: crops,
    locationCategories: locationCategories,
    nurseryLocations: nurseryLocations,
    locations: (function() {
      try {
        return readLocationMasterDetails_().map(function(l) {
          return { name: String(l.name || '').trim() };
        }).filter(function(l) { return !!l.name; });
      } catch (eLoc) { return []; }
    })(),
    holesOptions: (function() {
      var holesOptions = [72, 128, 200, 288];
      try {
        var master = getCultivationMaster();
        if (master && Array.isArray(master.holes)) {
          master.holes.forEach(function(h) {
            var n = Number(h);
            if (!isFinite(n) || n < 0) return;
            if (holesOptions.indexOf(n) < 0) holesOptions.push(n);
          });
          holesOptions.sort(function(a, b) { return a - b; });
        }
      } catch (eHoles) {}
      return holesOptions;
    })(),
    cropCultSettings: cropCultSettings
  };
}

/** スケジュール画面などから播種・育苗記録を直接追加 */
/**
 * 栽培計画マスタの穴数などの選択肢を追加・編集・削除
 * params: { field:'holes', manageAction:'add'|'edit'|'delete', value, oldValue?, userName? }
 */
function manageCultivationListOption(params) {
  params = params || {};
  const field = String(params.field || '').trim();
  const manageAction = String(params.manageAction || '').trim();
  const value = params.value;
  const oldValue = params.oldValue;
  const userName = String(params.userName || '').trim() || 'ユーザー';
  if (field !== 'holes') throw new Error('未対応のフィールドです: ' + field);

  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('栽培計画マスタ');
  if (!sheet) {
    sheet = ss.insertSheet('栽培計画マスタ');
    sheet.appendRow(['作物', '品種', '穴数', '条数', '株間', '畝間', '収穫係数', '定植面積', '1苗当たり収量', '1P当たり入り数']);
  }
  const data = sheet.getDataRange().getValues();
  const col = 2; // 穴数

  if (manageAction === 'add') {
    const n = Number(value);
    if (!isFinite(n) || n < 0) throw new Error('穴数が不正です');
    let exists = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col]) === String(n)) { exists = true; break; }
    }
    if (!exists) {
      sheet.appendRow(['', '', n, '', '', '', '', '', '', '']);
      writeLog(userName, 'マスタ追加', String(n), '対象: 栽培計画マスタ / 穴数');
    }
  } else if (manageAction === 'edit') {
    const n = Number(value);
    const old = Number(oldValue);
    if (!isFinite(n) || n < 0) throw new Error('穴数が不正です');
    let changed = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col]) === String(old)) {
        sheet.getRange(i + 1, col + 1).setValue(n);
        changed++;
      }
    }
    if (!changed) sheet.appendRow(['', '', n, '', '', '', '', '', '', '']);
    writeLog(userName, 'マスタ編集', String(old) + '→' + String(n), '対象: 栽培計画マスタ / 穴数');
  } else if (manageAction === 'delete') {
    const n = Number(value);
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][col]) === String(n)) {
        const row = data[i];
        const other = [0, 1, 3, 4, 5, 6, 7, 8, 9].some(function(ci) {
          return row[ci] !== '' && row[ci] != null;
        });
        if (!other) sheet.deleteRow(i + 1);
        else sheet.getRange(i + 1, col + 1).setValue('');
      }
    }
    writeLog(userName, 'マスタ削除', String(n), '対象: 栽培計画マスタ / 穴数');
  } else {
    throw new Error('未対応の操作です: ' + manageAction);
  }

  let holesOptions = [72, 128, 200, 288];
  try {
    const master = getCultivationMaster();
    if (master && Array.isArray(master.holes)) {
      master.holes.forEach(function(h) {
        const n = Number(h);
        if (!isFinite(n) || n < 0) return;
        if (holesOptions.indexOf(n) < 0) holesOptions.push(n);
      });
      holesOptions.sort(function(a, b) { return a - b; });
    }
  } catch (e2) {}
  return { success: true, holesOptions: holesOptions };
}

function saveSowingRecord(params) {
  params = params || {};
  const userName = String(params.userName || '').trim() || 'ユーザー';
  const s = (params.sowingRecord && typeof params.sowingRecord === 'object')
    ? params.sowingRecord
    : params;
  const tag = String(s.tag || '').trim();
  const cropName = String(s.cropName || s.crop || '').trim();
  const trays = Number(s.trays);
  if (!tag && !cropName) throw new Error('作物名またはTAGを入力してください');
  if (!(trays > 0)) throw new Error('枚数を入力してください');

  const sowingDate = String(s.sowingDate || '').trim()
    || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const recordId = String(s.recordId || '').trim()
    || ('manual-sow-' + Utilities.getUuid().substring(0, 8));

  appendSowingRecordFromWork_({
    crop: cropName,
    workDate: sowingDate,
    sowingRecord: {
      tag: tag,
      cropName: cropName,
      variety: String(s.variety || '').trim(),
      nurseryName: String(s.nurseryName || s.plot || '').trim(),
      direction: String(s.direction || '').trim(),
      sowingDate: sowingDate,
      trays: trays,
      holes: (s.holes === '' || s.holes == null) ? '' : s.holes,
      planId: String(s.planId || '').trim(),
      note: String(s.note || '').trim()
    }
  }, userName, recordId);

  writeLog(userName, '播種記録追加', tag || cropName,
    '枚数: ' + trays + ', 区画: ' + String(s.nurseryName || s.plot || '') + ', 日: ' + sowingDate);
  return { success: true, recordId: recordId };
}

/** 実行前に、実際の実行処理と同じ規則でタグ割り当てを確認する */
function previewCultivationPlanTags(params) {
  try {
    const year = params && params.year;
    const crop = params && params.crop;
    const planType = params && params.planType;
    const planName = params && params.planName;
    if (!year || !crop) throw new Error('年度と作物が必要です');

    const plans = getCultivationPlans(year, crop, planType, planName);
    if (!plans || plans.length === 0) {
      return { success: false, message: '対象の栽培計画がありません' };
    }

    let targets = plans.filter(p => p.status !== 'executed');
    if (params.planIds && params.planIds.length > 0) {
      const idSet = {};
      params.planIds.forEach(id => { idSet[String(id)] = true; });
      targets = plans.filter(p => idSet[String(p.id)] && p.status !== 'executed');
    }
    if (targets.length === 0) {
      return { success: false, message: '実行対象の未実行計画がありません' };
    }

    assignCultivationPlanTags_(plans, { year: year });
    const tagOrder = function(tag) {
      const m = String(tag || '').match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 9999;
    };
    targets.sort((a, b) => tagOrder(a.tag) - tagOrder(b.tag) || String(a.tag || '').localeCompare(String(b.tag || ''), 'ja'));
    return {
      success: true,
      year: year,
      crop: crop,
      planType: planType ? resolveCultivationPlanType_(planType) : '',
      planName: planName ? String(planName) : '',
      plans: targets.map(plan => ({
        id: plan.id || '',
        crop: plan.crop || crop,
        location: plan.location || '',
        variety: plan.variety || '(品種未設定)',
        tag: plan.tag || '',
        trays: Number(plan.trays) || 0,
        holes: Number(plan.holes) || 0,
        maker: plan.maker || '',
        grainCount: plan.grainCount || cpLookupGrainCountFromCroptypeDb_(plan.crop || crop, plan.variety || '')
      }))
    };
  } catch (e) {
    return { success: false, message: 'タグ割り当て確認エラー: ' + e.message };
  }
}

/**
 * 未実行の栽培計画を「実行」し、播種を作業予定へ登録する
 * params: { year, crop, planType?: string, planName?: string, planIds?: string[] }
 */
function executeCultivationPlans(params) {
  try {
    const year = params.year;
    const crop = params.crop;
    const planType = params.planType;
    const planName = params.planName;
    if (!year || !crop) throw new Error('年度と作物が必要です');

    const plans = getCultivationPlans(year, crop, planType, planName);
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

    // 実行時に定植早い順→収穫早い順の結果でタグを自動割り当て（年度内で全体ユニーク）
    assignCultivationPlanTags_(plans, { year: year });

    const executedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
    targets.forEach(plan => {
      plan.status = 'executed';
      plan.executedAt = executedAt;
    });

    // 今回実行した計画の調達だけ出す。播種は調達完了後に出す。
    const procureSync = upsertCultivationProcureSchedule_(year, targets);
    const procureCount = (procureSync.created || 0) + (procureSync.updated || 0);

    // 計画シートを更新（実行済みステータスを反映）
    const planSheet = TENANT_SS.getSheetByName('栽培計画');
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
      message: procureCount + '件の調達を作業予定に登録しました。調達が完了すると、その計画分の播種が出ます。',
      created: 0,
      procured: procureCount,
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
    master.cropTagAbbreviations = readCropTagAbbreviationMap_();
    try {
      master.conditions = getFieldConditionsList_();
    } catch (e) {
      master.conditions = ['露地', 'ハウス'];
    }
    try {
      master.climates = getClimateMasterList_();
    } catch (e) {
      master.climates = ['暖地', '温暖地', '一般地', '高冷地'];
    }
    
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
      ss.insertSheet('作型DB').appendRow(['作物', '品種', 'まき時期', '産地', '播種', '定植', '収穫', 'ファイルURL', '特性', 'メーカー', '粒数', '年度', '拠点', '圃場条件']);
    } else {
      const dbData = croptypeSheet.getDataRange().getValues();
      const headers = (dbData[0] || []).map(h => String(h || '').trim());
      const fileUrlCol = headers.indexOf('ファイルURL');
      let charCol = headers.indexOf('特性');
      if (charCol === -1) charCol = headers.indexOf('特性(タグ)');
      const makerCol = headers.indexOf('メーカー');
      const grainCol = headers.indexOf('粒数');
      const drCol = headers.indexOf('耐病性');
      const harvestSeasonCol = headers.indexOf('とる時期');
      const yearCol = headers.indexOf('年度');
      const locationCol = headers.indexOf('拠点');
      const fieldCondCol = headers.indexOf('圃場条件');
      for (let i = 1; i < dbData.length; i++) {
        let r = dbData[i];
        if (r[0] && r[1]) {
          try {
            const years = yearCol !== -1 ? parseCroptypeHistoryCsv_(r[yearCol]) : [];
            const locations = locationCol !== -1 ? parseCroptypeHistoryCsv_(r[locationCol]) : [];
            const fieldConditions = fieldCondCol !== -1 ? parseCroptypeHistoryCsv_(r[fieldCondCol]) : [];
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
              grainCount: grainCol !== -1 ? String(r[grainCol] || '') : '',
              diseaseResistance: drCol !== -1 ? String(r[drCol] || '') : '',
              harvestSeason: harvestSeasonCol !== -1 ? String(r[harvestSeasonCol] || '') : '',
              years: years,
              year: years.length ? years.join(',') : '',
              locations: locations,
              location: locations.length ? locations.join(',') : '',
              fieldConditions: fieldConditions,
              fieldCondition: fieldConditions.length ? fieldConditions.join(',') : ''
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

/** 作型の播種/定植/収穫を比較用キーに正規化 */
function normalizeCroptypeScheduleKey_(arr) {
  let parsed = arr;
  if (typeof arr === 'string') {
    try { parsed = JSON.parse(arr); } catch (e) { return String(arr || ''); }
  }
  if (!Array.isArray(parsed)) return '[]';
  const out = [];
  parsed.forEach(x => {
    if (typeof x === 'number' && !isNaN(x)) {
      out.push(x);
    } else if (x && typeof x === 'object') {
      const mi = parseInt(x.monthIndex, 10);
      if (!isNaN(mi)) {
        if (x.periodIndex != null || x.period != null) {
          const pi = parseInt(x.periodIndex != null ? x.periodIndex : x.period, 10) || 0;
          out.push(mi > 17 ? mi : (mi * 6 + pi));
        } else {
          out.push(mi);
        }
      }
    }
  });
  out.sort(function(a, b) { return a - b; });
  return JSON.stringify(out);
}

function parseCroptypeHistoryCsv_(val) {
  const s = String(val == null ? '' : val).trim();
  if (!s) return [];
  if (s.charAt(0) === '[') {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map(function(v) { return String(v == null ? '' : v).trim(); }).filter(Boolean);
      }
    } catch (e) {}
  }
  return s.split(/[,、／/|]/).map(function(v) { return v.trim(); }).filter(Boolean);
}

function mergeCroptypeHistoryCsv_(existing, add) {
  const set = {};
  parseCroptypeHistoryCsv_(existing).forEach(function(v) { set[v] = true; });
  parseCroptypeHistoryCsv_(add).forEach(function(v) { set[v] = true; });
  const arr = Object.keys(set);
  const allYear = arr.every(function(v) { return /^\d{4}$/.test(v); });
  if (allYear) arr.sort(function(a, b) { return Number(a) - Number(b); });
  else arr.sort(function(a, b) { return a.localeCompare(b, 'ja'); });
  return arr.join(',');
}

function ensureCroptypeSheetHeaders_(sheet) {
  const rawHeaders = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  const headers = rawHeaders.map(function(h) { return h ? String(h).trim() : ''; });
  const needed = ['特性(タグ)', 'メーカー', '粒数', '耐病性', '年度', '拠点', '圃場条件'];
  let changed = false;
  needed.forEach(function(name) {
    if (headers.indexOf(name) === -1) {
      sheet.getRange(1, headers.length + 1).setValue(name);
      headers.push(name);
      changed = true;
    }
  });
  if (changed) SpreadsheetApp.flush();
  return headers;
}

// 作型DBを保存する関数
function saveCroptypeDB(params) {
  try {
    const ss = TENANT_SS;
    let sheet = ss.getSheetByName('作型DB');
    if (!sheet) {
      sheet = ss.insertSheet('作型DB');
      sheet.appendRow(['作物', '品種', 'まき時期', '産地', '播種', '定植', '収穫', '特性(タグ)', 'メーカー', '粒数', '年度', '拠点', '圃場条件']);
    }
    const headers = ensureCroptypeSheetHeaders_(sheet);
    
    const data = sheet.getDataRange().getValues();
    const tagsColIndex = headers.indexOf('特性(タグ)') + 1; // 1-based index
    const makerColIndex = headers.indexOf('メーカー') + 1;
    const grainColIndex = headers.indexOf('粒数') + 1;
    const yearColIndex = headers.indexOf('年度') + 1;
    const locationColIndex = headers.indexOf('拠点') + 1;
    const fieldCondColIndex = headers.indexOf('圃場条件') + 1;

    const crop = String(params.crop || '').trim();
    const variety = String(params.variety || '').trim();
    const season = String(params.season || '').trim();
    const climate = String(params.climate || '').trim();
    const sowKey = normalizeCroptypeScheduleKey_(params.sowing || []);
    const plantKey = normalizeCroptypeScheduleKey_(params.planting || []);
    const harvestKey = normalizeCroptypeScheduleKey_(params.harvesting || []);
    const yearVal = String(params.year == null ? '' : params.year).trim();
    const locationVal = String(params.location == null ? '' : params.location).trim();
    const fieldCondVal = String(params.fieldCondition == null ? '' : params.fieldCondition).trim();
    
    let updated = false;
    let matchRow = -1;

    // 1) 同一作物・品種・産地で、播種/定植/収穫時期が同じ行を優先して更新（年度実績を蓄積）
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== crop) continue;
      if (String(data[i][1] || '').trim() !== variety) continue;
      if (String(data[i][3] || '').trim() !== climate) continue;
      const rowSow = normalizeCroptypeScheduleKey_(data[i][4]);
      const rowPlant = normalizeCroptypeScheduleKey_(data[i][5]);
      const rowHarvest = normalizeCroptypeScheduleKey_(data[i][6]);
      if (rowSow === sowKey && rowPlant === plantKey && rowHarvest === harvestKey) {
        matchRow = i;
        break;
      }
    }

    // 2) 旧キー（作物+品種+まき時期+産地）
    if (matchRow < 0) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === crop &&
            String(data[i][1] || '').trim() === variety &&
            String(data[i][2] || '').trim() === season &&
            String(data[i][3] || '').trim() === climate) {
          matchRow = i;
          break;
        }
      }
    }

    if (matchRow >= 0) {
      const i = matchRow;
      sheet.getRange(i + 1, 5).setValue(JSON.stringify(params.sowing || []));
      sheet.getRange(i + 1, 6).setValue(JSON.stringify(params.planting || []));
      sheet.getRange(i + 1, 7).setValue(JSON.stringify(params.harvesting || []));
      if (tagsColIndex > 0) {
        sheet.getRange(i + 1, tagsColIndex).setValue(params.characteristics || data[i][tagsColIndex - 1] || '');
      }
      if (makerColIndex > 0 && params.maker !== undefined && params.maker !== null && String(params.maker) !== '') {
        sheet.getRange(i + 1, makerColIndex).setValue(params.maker);
      }
      if (grainColIndex > 0 && params.grainCount !== undefined && params.grainCount !== null && String(params.grainCount) !== '') {
        sheet.getRange(i + 1, grainColIndex).setValue(params.grainCount);
      }
      if (yearColIndex > 0) {
        const mergedYears = mergeCroptypeHistoryCsv_(data[i][yearColIndex - 1], yearVal);
        sheet.getRange(i + 1, yearColIndex).setValue(mergedYears);
      }
      if (locationColIndex > 0) {
        const mergedLoc = mergeCroptypeHistoryCsv_(data[i][locationColIndex - 1], locationVal);
        sheet.getRange(i + 1, locationColIndex).setValue(mergedLoc);
      }
      if (fieldCondColIndex > 0) {
        const mergedFc = mergeCroptypeHistoryCsv_(data[i][fieldCondColIndex - 1], fieldCondVal);
        sheet.getRange(i + 1, fieldCondColIndex).setValue(mergedFc);
      }
      updated = true;
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
      if (grainColIndex > 0) {
        newRow[grainColIndex - 1] = (params.grainCount !== undefined && params.grainCount !== null) ? params.grainCount : '';
      }
      if (yearColIndex > 0) {
        newRow[yearColIndex - 1] = yearVal;
      }
      if (locationColIndex > 0) {
        newRow[locationColIndex - 1] = locationVal;
      }
      if (fieldCondColIndex > 0) {
        newRow[fieldCondColIndex - 1] = fieldCondVal;
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
    let updatedPlans = 0;

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

    // 保存済み栽培計画: 品種列 ＋ JSON内の variety
    try {
      const planSheet = ss.getSheetByName('栽培計画');
      if (planSheet && planSheet.getLastRow() > 1) {
        const lastRow = planSheet.getLastRow();
        const data = planSheet.getRange(2, 1, lastRow - 1, 6).getValues();
        let changed = false;
        for (let i = 0; i < data.length; i++) {
          const rowCrop = String(data[i][3] || '').trim();
          const rowVariety = String(data[i][4] || '').trim();
          let rowChanged = false;
          if (rowCrop === crop && rowVariety === oldName) {
            data[i][4] = newName;
            rowChanged = true;
          }
          const plan = parseCultivationPlanJson_(data[i][5]);
          if (plan) {
            const pCrop = String(plan.crop || rowCrop || '').trim();
            if (pCrop === crop && String(plan.variety || '').trim() === oldName) {
              plan.variety = newName;
              data[i][4] = newName;
              data[i][5] = JSON.stringify(plan);
              rowChanged = true;
            }
          }
          if (rowChanged) {
            updatedPlans++;
            changed = true;
          }
        }
        if (changed) {
          planSheet.getRange(2, 1, data.length, 6).setValues(data);
        }
      }
    } catch (e) {}

    return {
      success: true,
      message: '品種名を更新しました',
      updatedMaster: updatedMaster,
      updatedCroptype: updatedCroptype,
      updatedPreset: updatedPreset,
      updatedPlans: updatedPlans
    };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

/** 品種に紐づくメーカー・粒数を作型DB上で一括更新（行が無ければ作成） */
function updateVarietyMeta(params) {
  try {
    const crop = String((params && params.crop) || '').trim();
    const variety = String((params && params.variety) || '').trim();
    if (!crop || !variety) {
      return { success: false, message: '作物と品種は必須です' };
    }
    const maker = (params.maker !== undefined && params.maker !== null) ? String(params.maker).trim() : '';
    const grainCount = (params.grainCount !== undefined && params.grainCount !== null) ? String(params.grainCount).trim() : '';
    const diseaseResistance = (params.diseaseResistance !== undefined && params.diseaseResistance !== null) ? String(params.diseaseResistance).trim() : '';
    const climate = String((params && params.climate) || '').trim();
    const season = String((params && params.season) || '').trim();

    const ss = TENANT_SS;
    let sheet = ss.getSheetByName('作型DB');
    if (!sheet) {
      sheet = ss.insertSheet('作型DB');
      sheet.appendRow(['作物', '品種', 'まき時期', '産地', '播種', '定植', '収穫', 'ファイルURL', '特性', 'メーカー', '粒数']);
    }

    let headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0]
      .map(h => String(h || '').trim());
    if (headers.indexOf('メーカー') === -1) {
      sheet.getRange(1, headers.length + 1).setValue('メーカー');
      headers.push('メーカー');
    }
    if (headers.indexOf('粒数') === -1) {
      sheet.getRange(1, headers.length + 1).setValue('粒数');
      headers.push('粒数');
    }
    if (headers.indexOf('耐病性') === -1) {
      sheet.getRange(1, headers.length + 1).setValue('耐病性');
      headers.push('耐病性');
    }
    const makerCol = headers.indexOf('メーカー') + 1;
    const grainCol = headers.indexOf('粒数') + 1;
    const drCol = headers.indexOf('耐病性') + 1;
    const cropCol = headers.indexOf('作物');
    const varietyCol = headers.indexOf('品種');

    const data = sheet.getDataRange().getValues();
    let updated = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][cropCol] || '').trim() !== crop) continue;
      if (String(data[i][varietyCol] || '').trim() !== variety) continue;
      if (climate && String(data[i][3] || '').trim() !== climate) continue;
      if (makerCol > 0) sheet.getRange(i + 1, makerCol).setValue(maker);
      if (grainCol > 0) sheet.getRange(i + 1, grainCol).setValue(grainCount);
      if (drCol > 0 && params.diseaseResistance !== undefined) sheet.getRange(i + 1, drCol).setValue(diseaseResistance);
      updated++;
    }

    // 該当行が無ければメタ情報だけの行を追加
    if (updated === 0) {
      const newRow = new Array(headers.length).fill('');
      newRow[0] = crop;
      newRow[1] = variety;
      newRow[2] = season;
      newRow[3] = climate;
      newRow[4] = '[]';
      newRow[5] = '[]';
      newRow[6] = '[]';
      if (makerCol > 0) newRow[makerCol - 1] = maker;
      if (grainCol > 0) newRow[grainCol - 1] = grainCount;
      if (drCol > 0) newRow[drCol - 1] = diseaseResistance;
      sheet.appendRow(newRow);
      updated = 1;
    }

    try {
      appendCultivationMaster({
        crop: crop,
        variety: variety,
        holes: '',
        rows: '',
        pSpace: '',
        rSpace: '',
        yieldPerSeedling: '',
        itemsPerPack: ''
      });
    } catch (e) {}

    SpreadsheetApp.flush();
    return { success: true, message: '品種情報を保存しました', updated: updated };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

/** 作型DBの1行を削除（作物+品種+まき時期+産地） */
function deleteCroptypeDB(params) {
  try {
    const crop = String((params && params.crop) || '').trim();
    const variety = String((params && params.variety) || '').trim();
    const season = String((params && params.season) || '').trim();
    const climate = String((params && params.climate) || '').trim();
    if (!crop || !variety) {
      return { success: false, message: '作物と品種は必須です' };
    }

    const ss = TENANT_SS;
    const sheet = ss.getSheetByName('作型DB');
    if (!sheet || sheet.getLastRow() < 2) {
      return { success: true, message: '削除対象がありません', deleted: 0 };
    }

    const data = sheet.getDataRange().getValues();
    let deleted = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0] || '').trim() !== crop) continue;
      if (String(data[i][1] || '').trim() !== variety) continue;
      if (String(data[i][2] || '').trim() !== season) continue;
      if (String(data[i][3] || '').trim() !== climate) continue;
      sheet.deleteRow(i + 1);
      deleted++;
    }
    SpreadsheetApp.flush();
    return { success: true, message: deleted ? '作型を削除しました' : '削除対象がありません', deleted: deleted };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

/** 品種をマスタ・作型DBから削除 */
function deleteCultivationVariety(params) {
  try {
    const crop = String((params && params.crop) || '').trim();
    const variety = String((params && params.variety) || '').trim();
    if (!crop || !variety) {
      return { success: false, message: '作物と品種は必須です' };
    }

    const ss = TENANT_SS;
    let deletedMaster = 0;
    let deletedCroptype = 0;

    const masterSheet = ss.getSheetByName('栽培計画マスタ');
    if (masterSheet && masterSheet.getLastRow() > 1) {
      const data = masterSheet.getRange(2, 1, masterSheet.getLastRow(), 2).getValues();
      for (let i = data.length - 1; i >= 0; i--) {
        if (String(data[i][0] || '').trim() === crop && String(data[i][1] || '').trim() === variety) {
          masterSheet.deleteRow(i + 2);
          deletedMaster++;
        }
      }
    }

    const croptypeSheet = ss.getSheetByName('作型DB');
    if (croptypeSheet && croptypeSheet.getLastRow() > 1) {
      const data = croptypeSheet.getDataRange().getValues();
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][0] || '').trim() === crop && String(data[i][1] || '').trim() === variety) {
          croptypeSheet.deleteRow(i + 1);
          deletedCroptype++;
        }
      }
    }

    SpreadsheetApp.flush();
    return {
      success: true,
      message: '品種を削除しました',
      deletedMaster: deletedMaster,
      deletedCroptype: deletedCroptype
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
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      merged.photo = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1000";
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

  let photoUrl = existingPhoto || '';
  if (p.clearPhoto) {
    photoUrl = '';
  } else if (p.photo && !p.photoBase64) {
    photoUrl = p.photo;
  }
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

function vehicle_deleteVehicle(p) {
  const sheet = ensureVehicleMasterSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: true };
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
  const cats = getProdMgmtCategories();
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    let existing = {};
    try { if (data[i][17]) existing = JSON.parse(data[i][17]); } catch (e) {}
    existing = migrateManureDataObject_(existing);
    const catStatuses = {};
    (cats || []).forEach(function(c) {
      if (!c || !c.id) return;
      catStatuses[c.id] = emptyProdCatStatus_();
    });
    // 万一カテゴリ未取得でも堆肥は残す
    if (!catStatuses.compost) catStatuses.compost = emptyProdCatStatus_();
    const resetManure = {
      catStatuses: catStatuses,
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
  writeLog(userName, "生産管理ステータス全リセット", "全圃場", count + "件リセット");
  return { success: true, count: count };
}

/** 生産管理MAP：カテゴリ1件分の空ステータス */
function emptyProdCatStatus_() {
  return {
    status: 'none',
    deadline: '',
    scheduled_date: '',
    cancel_reason: '',
    has_pin: false,
    route_selected: false
  };
}

/**
 * 旧・鶏糞フラット形式 → catStatuses（堆肥散布=compost）へ移行
 * 互換のため manure_* フラット項目も堆肥と同期して残す
 */
function migrateManureDataObject_(raw) {
  const d = (raw && typeof raw === 'object') ? raw : {};
  if (!d.catStatuses || typeof d.catStatuses !== 'object') d.catStatuses = {};

  if (!d.catStatuses.compost) {
    d.catStatuses.compost = {
      status: d.manure_status || 'none',
      deadline: d.manure_deadline || '',
      scheduled_date: d.manure_scheduled_date || '',
      cancel_reason: d.manure_cancel_reason || '',
      has_pin: !!d.manure_has_pin,
      route_selected: !!d.manure_route_selected
    };
  } else {
    const c = d.catStatuses.compost;
    if (c.status == null) c.status = d.manure_status || 'none';
    if (c.deadline == null) c.deadline = d.manure_deadline || '';
    if (c.scheduled_date == null) c.scheduled_date = d.manure_scheduled_date || '';
    if (c.cancel_reason == null) c.cancel_reason = d.manure_cancel_reason || '';
    if (c.has_pin == null) c.has_pin = !!d.manure_has_pin;
    if (c.route_selected == null) c.route_selected = !!d.manure_route_selected;
  }

  // フラット項目は常に堆肥と同期（旧クライアント・ルート設定互換）
  const compost = d.catStatuses.compost;
  d.manure_status = compost.status || 'none';
  d.manure_deadline = compost.deadline || '';
  d.manure_scheduled_date = compost.scheduled_date || '';
  d.manure_cancel_reason = compost.cancel_reason || '';
  d.manure_has_pin = !!compost.has_pin;
  d.manure_route_selected = !!compost.route_selected;
  if (d.transplant_jun == null) d.transplant_jun = '';
  return d;
}

function getDefaultProdMgmtCategories_() {
  return [
    { id: 'ridge_crush', name: '畝つぶし', order: 1 },
    { id: 'compost', name: '堆肥散布', order: 2 },
    { id: 'dolomite', name: '苦土石灰散布', order: 3 },
    { id: 'forward_pull', name: '正転引き', order: 4 },
    { id: 'fertilizer', name: '肥料散布', order: 5 },
    { id: 'forward_pull_finish', name: '正転引き（仕上げ）', order: 6 },
    { id: 'ridge_make', name: '畝立て', order: 7 }
  ];
}

function ensureProdMgmtCategorySheet_() {
  const ss = TENANT_SS || SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('データベースに接続できません');
  let sheet = ss.getSheetByName('生産管理カテゴリ');
  if (!sheet) {
    sheet = ss.insertSheet('生産管理カテゴリ');
    sheet.appendRow(['ID', '名前', '並び順']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e0e0e0');
    const defaults = getDefaultProdMgmtCategories_();
    defaults.forEach(function(c) {
      sheet.appendRow([c.id, c.name, c.order]);
    });
  } else if (sheet.getLastRow() <= 1) {
    const defaults = getDefaultProdMgmtCategories_();
    defaults.forEach(function(c) {
      sheet.appendRow([c.id, c.name, c.order]);
    });
  }
  return sheet;
}

function getProdMgmtCategories() {
  const sheet = ensureProdMgmtCategorySheet_();
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    const name = String(data[i][1] || '').trim();
    if (!id || !name) continue;
    const order = parseInt(data[i][2], 10);
    list.push({
      id: id,
      name: name,
      order: isNaN(order) ? i : order
    });
  }
  list.sort(function(a, b) { return a.order - b.order; });
  if (!list.length) return getDefaultProdMgmtCategories_();
  return list;
}

function saveProdMgmtCategories(categories, userName) {
  if (!checkAdminRole(userName)) throw new Error('管理者権限が必要です');
  if (!Array.isArray(categories) || !categories.length) {
    throw new Error('カテゴリが空です');
  }
  const sheet = ensureProdMgmtCategorySheet_();
  const rows = [['ID', '名前', '並び順']];
  const seen = {};
  categories.forEach(function(c, idx) {
    if (!c) return;
    const id = String(c.id || '').trim();
    const name = String(c.name || '').trim();
    if (!id || !name) return;
    if (seen[id]) throw new Error('カテゴリIDが重複しています: ' + id);
    seen[id] = true;
    const order = parseInt(c.order, 10);
    rows.push([id, name, isNaN(order) ? (idx + 1) : order]);
  });
  if (rows.length <= 1) throw new Error('有効なカテゴリがありません');
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e0e0e0');
  SpreadsheetApp.flush();
  writeLog(userName || '', '生産管理カテゴリ更新', 'カテゴリ', (rows.length - 1) + '件');
  return { success: true, categories: getProdMgmtCategories() };
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
  const ss = TENANT_SS || SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('データベースに接続できません');
  let sheet = ss.getSheetByName('作業一時保存');
  if (!sheet) {
    sheet = ss.insertSheet('作業一時保存');
    sheet.appendRow(['スタッフID', 'ユーザー名', '記録種別', '圃場ID', '圃場名', 'フォームJSON', '作業チップ', '選択圃場IDs', '保存日時', '保存時刻ms']);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#e0e0e0');
  } else {
    // 既存シートに保存時刻ms列が無ければ追加
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    if (headers.length < 10 || String(headers[9] || '').indexOf('保存時刻') < 0) {
      sheet.getRange(1, 10).setValue('保存時刻ms').setFontWeight('bold').setBackground('#e0e0e0');
    }
  }
  return sheet;
}

function saveTempWorkRecord(params) {
  const sheet = ensureTempWorkRecordSheet_();
  const userId = String(params.userId || '').trim();
  const recordType = String(params.type || 'work');
  if (!userId) throw new Error('ユーザーIDが必要です');

  const savedAt = params.savedAt || Utilities.formatDate(new Date(), 'JST', 'M/d HH:mm');
  const savedAtMs = Number(params.savedAtMs) || Date.now();
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
    savedAt,
    savedAtMs
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
  return { success: true, savedAt: savedAt, savedAtMs: savedAtMs };
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
          savedAtMs: Number(data[i][9]) || 0,
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
/** カテゴリ正規化: タスク（旧「最優先」互換） / 留意事項 */
function normalizePersonalScheduleCategory_(category) {
  const c = String(category || '').trim();
  if (c === '留意事項') return '留意事項';
  return 'タスク';
}

function isPersonalTaskCategory_(category) {
  const c = String(category || '').trim();
  return c === 'タスク' || c === '最優先' || (c && c !== '留意事項');
}

function formatPersonalScheduleDateYmd_(val) {
  if (val === null || val === undefined || val === '') return '';
  try {
    if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
      return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
  } catch (e) {}
  return '';
}

function buildWorkScheduleKey_(workName, fieldName, cropName, schedDateRaw, deadlineRaw) {
  return [
    String(workName || '').trim(),
    String(fieldName || '').trim(),
    String(cropName || '').trim(),
    formatPersonalScheduleDateYmd_(schedDateRaw),
    formatPersonalScheduleDateYmd_(deadlineRaw)
  ].join('||');
}

function ensurePersonalScheduleSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('個人スケジュール');
  const headers = ['ID', 'ユーザーID', 'カテゴリ', '内容', '完了', '作成日時', '更新日時', '並び順', '期限', '開始日', '予定キー', 'ユーザー名'];
  if (!sheet) {
    sheet = ss.insertSheet('個人スケジュール');
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    return sheet;
  }
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || '').trim(); });
  for (let i = 0; i < headers.length; i++) {
    if (existing[i] !== headers[i]) {
      sheet.getRange(1, i + 1).setValue(headers[i]);
    }
  }
  return sheet;
}

function getPersonalSchedule(params) {
  const userId = String((params && params.userId) || '').trim();
  if (!userId) return { priority: [], notes: [], tasks: [] };
  const sheet = ensurePersonalScheduleSheet_();
  const data = sheet.getDataRange().getValues();
  const priority = [];
  const notes = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) !== userId) continue;
    const rawCat = String(data[i][2] || '');
    const item = {
      id: String(data[i][0]),
      category: isPersonalTaskCategory_(rawCat) ? 'タスク' : '留意事項',
      text: String(data[i][3] || ''),
      done: String(data[i][4]) === 'TRUE' || data[i][4] === true,
      createdAt: data[i][5] ? Utilities.formatDate(new Date(data[i][5]), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : '',
      sortOrder: (data[i][7] !== '' && data[i][7] != null) ? Number(data[i][7]) : i,
      deadline: formatPersonalScheduleDateYmd_(data[i][8]),
      startDate: formatPersonalScheduleDateYmd_(data[i][9]),
      scheduleKey: String(data[i][10] || ''),
      userName: String(data[i][11] || '')
    };
    if (item.category === '留意事項') notes.push(item);
    else priority.push(item);
  }
  const byOrder = function(a, b) {
    const ao = Number(a.sortOrder);
    const bo = Number(b.sortOrder);
    if (ao !== bo) return ao - bo;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  };
  priority.sort(byOrder);
  notes.sort(byOrder);
  return { priority: priority, notes: notes, tasks: priority };
}

function nextPersonalScheduleSortOrder_(sheet, userId, category) {
  const data = sheet.getDataRange().getValues();
  let max = 0;
  const wantTask = isPersonalTaskCategory_(category);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) !== userId) continue;
    const isTask = isPersonalTaskCategory_(data[i][2]);
    if (wantTask !== isTask) continue;
    const n = Number(data[i][7]);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

function addPersonalScheduleItem(params) {
  const userId = String((params && params.userId) || '').trim();
  const userName = String((params && params.userName) || '').trim();
  const category = String((params && params.category) || 'タスク');
  const text = String((params && params.text) || '').trim();
  const scheduleKey = String((params && params.scheduleKey) || '').trim();
  const deadline = formatPersonalScheduleDateYmd_(params && params.deadline);
  const startDate = formatPersonalScheduleDateYmd_(params && params.startDate);
  if (!userId) throw new Error('ユーザーIDがありません');
  if (!text) throw new Error('内容を入力してください');
  const cat = normalizePersonalScheduleCategory_(category);
  const sheet = ensurePersonalScheduleSheet_();

  // 同じ予定キーを二重登録しない
  if (scheduleKey) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === userId && String(data[i][10] || '') === scheduleKey) {
        return { success: true, id: String(data[i][0]), already: true };
      }
    }
  }

  const id = Utilities.getUuid();
  const now = new Date();
  const sortOrder = nextPersonalScheduleSortOrder_(sheet, userId, cat);
  sheet.appendRow([id, userId, cat, text, false, now, now, sortOrder, deadline || '', startDate || '', scheduleKey || '', userName || '']);
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
      sheet.getRange(i + 1, 3).setValue(normalizePersonalScheduleCategory_(params.category));
    }
    if (params.sortOrder !== undefined) sheet.getRange(i + 1, 8).setValue(Number(params.sortOrder) || 0);
    if (params.deadline !== undefined) sheet.getRange(i + 1, 9).setValue(formatPersonalScheduleDateYmd_(params.deadline) || '');
    if (params.startDate !== undefined) sheet.getRange(i + 1, 10).setValue(formatPersonalScheduleDateYmd_(params.startDate) || '');
    if (params.scheduleKey !== undefined) sheet.getRange(i + 1, 11).setValue(String(params.scheduleKey || ''));
    sheet.getRange(i + 1, 7).setValue(new Date());
    return { success: true };
  }
  throw new Error('対象の予定が見つかりません');
}

function reorderPersonalScheduleItems(params) {
  const userId = String((params && params.userId) || '').trim();
  const category = normalizePersonalScheduleCategory_(params && params.category);
  const orderedIds = (params && params.orderedIds) || [];
  if (!userId) throw new Error('ユーザーIDがありません');
  if (!Array.isArray(orderedIds) || !orderedIds.length) throw new Error('並び順がありません');
  const sheet = ensurePersonalScheduleSheet_();
  const data = sheet.getDataRange().getValues();
  const idToRow = {};
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) !== userId) continue;
    const isTask = isPersonalTaskCategory_(data[i][2]);
    const wantTask = category === 'タスク';
    if (isTask !== wantTask) continue;
    idToRow[String(data[i][0])] = i + 1;
  }
  const now = new Date();
  for (let i = 0; i < orderedIds.length; i++) {
    const row = idToRow[String(orderedIds[i])];
    if (!row) continue;
    sheet.getRange(row, 8).setValue(i + 1);
    sheet.getRange(row, 7).setValue(now);
  }
  return { success: true };
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

/** 予定キー → タスク登録ユーザー一覧 */
function collectScheduleTaskUsersMap_() {
  const map = {};
  try {
    const sheet = ensurePersonalScheduleSheet_();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const key = String(data[i][10] || '').trim();
      if (!key) continue;
      if (!isPersonalTaskCategory_(data[i][2])) continue;
      const userId = String(data[i][1] || '').trim();
      const userName = String(data[i][11] || userId || '').trim();
      if (!userName && !userId) continue;
      if (!map[key]) map[key] = [];
      const exists = map[key].some(function(u) { return u.userId === userId; });
      if (!exists) {
        map[key].push({
          userId: userId,
          userName: userName || userId,
          done: String(data[i][4]) === 'TRUE' || data[i][4] === true
        });
      }
    }
  } catch (e) {}
  return map;
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

/** 名簿に「表示カレンダー」列を確保（カンマ区切りのカレンダーID） */
function ensureMeiboCalendarIdsColumn_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('名簿');
  if (!sheet) throw new Error('名簿シートが見つかりません');
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let col = -1;
  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] || '').trim();
    if (h === '表示カレンダー' || h === 'CalendarIds' || h === 'カレンダーID') {
      col = c;
      break;
    }
  }
  if (col < 0) {
    col = lastCol;
    sheet.getRange(1, col + 1).setValue('表示カレンダー');
  }
  return { sheet: sheet, col: col };
}

function parseCalendarIdsValue_(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    if (s.charAt(0) === '[') {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map(function (v) { return String(v || '').trim(); }).filter(Boolean);
      }
    }
  } catch (e) {}
  return s.split(/[,，\n]/).map(function (v) { return String(v || '').trim(); }).filter(Boolean);
}

function getUserCalendarIds(params) {
  const userId = String((params && params.userId) || '').trim();
  if (!userId) return { ids: [], hasPreference: false };
  const info = ensureMeiboCalendarIdsColumn_();
  const data = info.sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      const ids = parseCalendarIdsValue_(data[i][info.col]);
      return { ids: ids, hasPreference: ids.length > 0 };
    }
  }
  return { ids: [], hasPreference: false };
}

function saveUserCalendarIds(params) {
  const userId = String((params && params.userId) || '').trim();
  if (!userId) throw new Error('ユーザーIDがありません');
  let ids = [];
  if (Array.isArray(params && params.ids)) {
    ids = params.ids.map(function (v) { return String(v || '').trim(); }).filter(Boolean);
  } else {
    ids = parseCalendarIdsValue_(params && params.ids);
  }
  // 重複除去
  const uniq = [];
  const seen = {};
  ids.forEach(function (id) {
    if (seen[id]) return;
    seen[id] = true;
    uniq.push(id);
  });

  const info = ensureMeiboCalendarIdsColumn_();
  const data = info.sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === userId) {
      info.sheet.getRange(i + 1, info.col + 1).setValue(uniq.join(','));
      return { success: true, ids: uniq, hasPreference: uniq.length > 0 };
    }
  }
  throw new Error('名簿にユーザーが見つかりません');
}

/** 実行アカウントから見えるGoogleカレンダー一覧 */
function listGoogleCalendars(params) {
  params = params || {};
  const userId = String(params.userId || '').trim();
  let calendars = [];
  try {
    calendars = CalendarApp.getAllCalendars() || [];
  } catch (e) {
    calendars = [];
  }
  if (!calendars.length) {
    try {
      const gmail = String((getUserGmail({ userId: userId }) || {}).gmail || '').trim();
      if (gmail) {
        const primary = CalendarApp.getCalendarById(gmail);
        if (primary) calendars = [primary];
      }
    } catch (e2) {}
  }

  const list = [];
  calendars.forEach(function (cal) {
    try {
      if (cal.isHidden && cal.isHidden()) return;
      list.push({
        id: cal.getId(),
        name: cal.getName() || cal.getId(),
        isOwned: !!(cal.isOwnedByMe && cal.isOwnedByMe())
      });
    } catch (e3) {}
  });
  list.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name), 'ja');
  });

  const pref = userId ? getUserCalendarIds({ userId: userId }) : { ids: [], hasPreference: false };
  return {
    success: true,
    calendars: list,
    selectedIds: pref.ids || [],
    hasPreference: !!pref.hasPreference,
    message: list.length ? '' : '表示できるカレンダーがありません。実行アカウントにカレンダーを共有してください。'
  };
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
        message: 'カレンダーにアクセスできません。Googleカレンダー（' + gmail + '）を、この Apps Scriptの実行アカウントに「予定の表示」権限で共有してください。',
        calendarUrl: calendarUrl,
        selectedCalendarIds: [],
        hasCalendarPreference: false
      };
    }

    // ユーザーが選択した表示カレンダーで絞り込み（未設定なら全部）
    const pref = getUserCalendarIds({ userId: userId });
    const selectedIds = (pref && pref.ids) ? pref.ids : [];
    const hasPreference = !!(pref && pref.hasPreference && selectedIds.length);
    if (hasPreference) {
      const allow = {};
      selectedIds.forEach(function (id) { allow[String(id)] = true; });
      calendars = calendars.filter(function (cal) {
        try { return !!allow[String(cal.getId())]; } catch (e) { return false; }
      });
    }

    if (!calendars.length) {
      return {
        success: true,
        gmail: gmail,
        days: days,
        events: [],
        message: '表示するカレンダーが選択されていません。マイページまたはスケジュール画面で表示カレンダーを選んでください。',
        calendarUrl: calendarUrl,
        selectedCalendarIds: selectedIds,
        hasCalendarPreference: hasPreference
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
      calendarUrl: calendarUrl,
      selectedCalendarIds: selectedIds,
      hasCalendarPreference: hasPreference
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

/**
 * ユーザーの免許・資格データを保存
 */
function saveUserQualifications(userName, qualifications) {
  try {
    if (!userName) return { success: false, message: 'ユーザー名が指定されていません' };
    const ss = TENANT_SS || SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('ユーザー資格');
    if (!sheet) {
      sheet = ss.insertSheet('ユーザー資格');
      sheet.appendRow(['ユーザー名', '資格データJSON', '更新日時']);
    }
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(userName).trim()) {
        foundRow = i + 1;
        break;
      }
    }
    const jsonStr = JSON.stringify(qualifications || []);
    const nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    if (foundRow > 0) {
      sheet.getRange(foundRow, 2, 1, 2).setValues([[jsonStr, nowStr]]);
    } else {
      sheet.appendRow([userName, jsonStr, nowStr]);
    }
    return { success: true, message: '資格情報を保存しました' };
  } catch (err) {
    return { success: false, message: '保存エラー: ' + String(err) };
  }
}

/**
 * ユーザーの免許・資格データを取得
 */
function getUserQualifications(userName) {
  try {
    if (!userName) return { success: true, qualifications: [] };
    const ss = TENANT_SS || SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('ユーザー資格');
    if (!sheet) return { success: true, qualifications: [] };
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(userName).trim()) {
        const rawJson = data[i][1];
        let parsed = [];
        try { parsed = JSON.parse(rawJson); } catch (e) {}
        return { success: true, qualifications: parsed };
      }
    }
    return { success: true, qualifications: [] };
  } catch (err) {
    return { success: false, message: '取得エラー: ' + String(err), qualifications: [] };
  }
}

/**
 * 服装表示の設定ルールを保存
 */
function saveClothingRules(rules) {
  try {
    const ss = TENANT_SS || SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('服装設定');
    if (!sheet) {
      sheet = ss.insertSheet('服装設定');
      sheet.appendRow(['設定JSON', '更新日時']);
    }
    const jsonStr = JSON.stringify(rules || []);
    const nowStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    sheet.getRange(2, 1, 1, 2).setValues([[jsonStr, nowStr]]);
    return { success: true, message: '服装設定を保存しました' };
  } catch (err) {
    return { success: false, message: '保存エラー: ' + String(err) };
  }
}

/**
 * 服装表示の設定ルールを取得
 */
function getClothingRules() {
  try {
    const ss = TENANT_SS || SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('服装設定');
    if (!sheet) return { success: true, rules: null };
    const data = sheet.getDataRange().getValues();
    if (data.length > 1 && data[1][0]) {
      let parsed = null;
      try { parsed = JSON.parse(data[1][0]); } catch (e) {}
      return { success: true, rules: parsed };
    }
    return { success: true, rules: null };
  } catch (err) {
    return { success: false, message: '取得エラー: ' + String(err), rules: null };
  }
}

/**
 * 管理者が作業予定へ担当者・作業メンバーを割り当て（アサイン）保存する
 */
function assignScheduleMember(rowIndex, assignedUsers, scheduleKey) {
  try {
    const ss = TENANT_SS || SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
    const sheet = ss.getSheetByName('作業予定');
    if (!sheet) return { success: false, message: '作業予定シートが存在しません' };

    const assignedStr = Array.isArray(assignedUsers) ? assignedUsers.join(', ') : String(assignedUsers || '');
    const data = sheet.getDataRange().getValues();

    let targetRow = parseInt(rowIndex, 10);
    // rowIndexが指定されていない場合、scheduleKeyから行を特定
    if (!targetRow || isNaN(targetRow) || targetRow <= 1) {
      if (scheduleKey) {
        for (let i = 1; i < data.length; i++) {
          const wName = data[i][0];
          const fName = data[i][3];
          const cName = data[i][2];
          const sDate = data[i][4];
          const dDate = data[i][5];
          const key = buildWorkScheduleKey_(wName, fName, cName, sDate, dDate);
          if (key === scheduleKey) {
            targetRow = i + 1;
            break;
          }
        }
      }
    }

    if (targetRow && targetRow > 1 && targetRow <= data.length) {
      sheet.getRange(targetRow, 8).setValue(assignedStr); // H列=8 (担当者/人)
      return { success: true, message: '担当メンバーを割り当てました', assignedUsers: assignedStr };
    }
    return { success: false, message: '対象の作業予定が見つかりませんでした' };
  } catch (err) {
    return { success: false, message: 'アサイン保存エラー: ' + String(err) };
  }
}

/**
 * 指定されたユーザーの本日の担当作業予定を取得する
 */
function getUserTodayAssignedSchedules(userName) {
  try {
    if (!userName) return { success: true, schedules: [] };
    const res = getScheduleData();
    if (!res || !res.activeSchedules) return { success: true, schedules: [] };

    const todayStr = Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd');
    const uName = String(userName).trim().toLowerCase();

    const assigned = res.activeSchedules.filter(function(item) {
      const personStr = String(item.person || '').toLowerCase();
      const isAssignedPerson = personStr.includes(uName);
      
      // 個人タスクシートの紐付け（taskUsersMap）も確認
      let isTaskUser = false;
      if (item.taskUsers && Array.isArray(item.taskUsers)) {
        isTaskUser = item.taskUsers.some(function(u) {
          return String(u.userName || u.userId || '').toLowerCase().includes(uName);
        });
      }

      const isForUser = isAssignedPerson || isTaskUser;
      if (!isForUser) return false;

      // 完了済みでないもの
      if (item.compDate) return false;

      return true;
    });

    return { success: true, schedules: assigned };
  } catch (err) {
    return { success: false, message: '本日の担当予定取得エラー: ' + String(err), schedules: [] };
  }
}

/** 📖 作業マニュアルデータのスプレッドシート保存・取得・削除 */
function getManualSheet() {
  const ss = TENANT_SS || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("作業マニュアルマスタ");
  if (!sheet) {
    sheet = ss.insertSheet("作業マニュアルマスタ");
    sheet.appendRow(["ID", "タイトル", "紐付け作業", "注意点", "手順JSON", "写真JSON", "更新日時"]);
  }
  return sheet;
}

function parseManualWorkLink_(raw) {
  const s = String(raw || '').trim();
  if (!s) return { workNames: [], category: '', crops: [] };
  if (s.charAt(0) === '{') {
    try {
      const o = JSON.parse(s);
      const workNames = Array.isArray(o.workNames)
        ? o.workNames.map(function(x) { return String(x || '').trim(); }).filter(Boolean)
        : String(o.workNames || '').split(',').map(function(x) { return x.trim(); }).filter(Boolean);
      const crops = Array.isArray(o.crops)
        ? o.crops.map(function(x) { return String(x || '').trim(); }).filter(Boolean)
        : String(o.crops || o.crop || '').split(/[,、]/).map(function(x) { return x.trim(); }).filter(Boolean);
      return {
        workNames: workNames,
        category: String(o.category || '').trim(),
        crops: crops
      };
    } catch (e) {}
  }
  return {
    workNames: s.split(',').map(function(x) { return x.trim(); }).filter(Boolean),
    category: '',
    crops: []
  };
}

function saveManualData(manual) {
  try {
    if (!manual || !manual.id) return { success: false, message: '無効なデータ' };
    const sheet = getManualSheet();
    const data = sheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(manual.id)) {
        targetRow = i + 1;
        break;
      }
    }

    const crops = Array.isArray(manual.crops)
      ? manual.crops.map(function(x) { return String(x || '').trim(); }).filter(Boolean)
      : String(manual.crop || '').split(/[,、]/).map(function(x) { return x.trim(); }).filter(Boolean);
    const linkJson = JSON.stringify({
      workNames: Array.isArray(manual.workNames) ? manual.workNames : (manual.workNames ? [manual.workNames] : []),
      category: manual.category || '',
      crops: crops
    });

    const rowVals = [
      manual.id,
      manual.title || '',
      linkJson,
      manual.notice || '',
      JSON.stringify(manual.steps || []),
      JSON.stringify(manual.photos || []),
      new Date().toISOString()
    ];

    if (targetRow > 0) {
      sheet.getRange(targetRow, 1, 1, rowVals.length).setValues([rowVals]);
    } else {
      sheet.appendRow(rowVals);
    }
    return { success: true, id: manual.id };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

function getManualList() {
  try {
    const sheet = getManualSheet();
    const data = sheet.getDataRange().getValues();
    const manuals = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;
      let steps = [], photos = [];
      try { steps = JSON.parse(row[4] || '[]'); } catch(e) {}
      try { photos = JSON.parse(row[5] || '[]'); } catch(e) {}

      const link = parseManualWorkLink_(row[2]);
      manuals.push({
        id: String(row[0]),
        title: String(row[1] || ''),
        workNames: link.workNames,
        category: link.category,
        crops: link.crops,
        notice: String(row[3] || ''),
        steps: steps,
        photos: photos,
        updatedAt: String(row[6] || '')
      });
    }

    return { success: true, manuals: manuals };
  } catch(e) {
    return { success: false, manuals: [], message: e.message };
  }
}

function deleteManualData(manualId) {
  try {
    const sheet = getManualSheet();
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(manualId)) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
    return { success: true };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/** ドローン対戦：オンラインロビー（マッチング）→ PeerJS 接続用 */
const DRONE_LOBBY_SHEET = 'ドローン対戦ロビー';
const DRONE_LOBBY_STALE_MS = 90 * 1000;

function droneLobby_getSheet_() {
  const ss = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(DRONE_LOBBY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DRONE_LOBBY_SHEET);
    sheet.appendRow(['code', 'kind', 'mode', 'hostName', 'createdAt', 'lastBeat', 'status']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  return sheet;
}

function droneLobby_normalizeCode_(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function droneLobby_findRow_(sheet, code) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (droneLobby_normalizeCode_(data[i][0]) === code) return i + 1;
  }
  return -1;
}

function droneLobby_purgeStale_(sheet) {
  const data = sheet.getDataRange().getValues();
  const now = Date.now();
  for (let i = data.length - 1; i >= 1; i--) {
    const status = String(data[i][6] || '');
    if (status !== 'waiting') continue;
    const beat = data[i][5] instanceof Date ? data[i][5].getTime() : new Date(data[i][5]).getTime();
    if (!beat || isNaN(beat) || (now - beat) > DRONE_LOBBY_STALE_MS) {
      sheet.getRange(i + 1, 7).setValue('closed');
    }
  }
}

function droneLobby_list(params) {
  const sheet = droneLobby_getSheet_();
  droneLobby_purgeStale_(sheet);
  const kindFilter = params && params.kind ? String(params.kind) : '';
  const data = sheet.getDataRange().getValues();
  const rooms = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][6] || '') !== 'waiting') continue;
    const kind = String(data[i][1] || 'pvp');
    if (kindFilter && kind !== kindFilter) continue;
    rooms.push({
      code: droneLobby_normalizeCode_(data[i][0]),
      kind: kind,
      mode: Number(data[i][2]) === 1 ? 1 : 2,
      hostName: String(data[i][3] || 'Player'),
      createdAt: data[i][4] instanceof Date ? data[i][4].toISOString() : String(data[i][4] || '')
    });
  }
  rooms.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return { rooms: rooms };
}

function droneLobby_create(params) {
  const code = droneLobby_normalizeCode_(params && params.code);
  if (code.length < 4) throw new Error('ルームコードが不正です');
  const kind = (params && params.kind) === 'coop' ? 'coop' : 'pvp';
  const mode = Number(params && params.mode) === 1 ? 1 : 2;
  const hostName = String((params && params.hostName) || 'Player').slice(0, 24);
  const sheet = droneLobby_getSheet_();
  const now = new Date();
  const row = droneLobby_findRow_(sheet, code);
  if (row > 0) {
    sheet.getRange(row, 1, row, 7).setValues([[code, kind, mode, hostName, now, now, 'waiting']]);
  } else {
    sheet.appendRow([code, kind, mode, hostName, now, now, 'waiting']);
  }
  return { ok: true, code: code };
}

function droneLobby_heartbeat(params) {
  const code = droneLobby_normalizeCode_(params && params.code);
  if (code.length < 4) throw new Error('ルームコードが不正です');
  const sheet = droneLobby_getSheet_();
  const row = droneLobby_findRow_(sheet, code);
  if (row < 0) throw new Error('ルームが見つかりません');
  const status = String(sheet.getRange(row, 7).getValue() || '');
  if (status !== 'waiting') throw new Error('このルームは募集終了しています');
  const kind = (params && params.kind) === 'coop' ? 'coop' : ((params && params.kind) === 'pvp' ? 'pvp' : null);
  const mode = params && (params.mode === 1 || params.mode === 2 || params.mode === '1' || params.mode === '2')
    ? (Number(params.mode) === 1 ? 1 : 2) : null;
  sheet.getRange(row, 6).setValue(new Date());
  if (kind) sheet.getRange(row, 2).setValue(kind);
  if (mode) sheet.getRange(row, 3).setValue(mode);
  return { ok: true };
}

function droneLobby_close(params) {
  const code = droneLobby_normalizeCode_(params && params.code);
  if (code.length < 4) return { ok: true };
  const sheet = droneLobby_getSheet_();
  const row = droneLobby_findRow_(sheet, code);
  if (row > 0) sheet.getRange(row, 7).setValue('closed');
  return { ok: true };
}

// ==========================================
// 📅 出勤カレンダー / 休暇・有給
// ==========================================

function attPad2_(n) {
  return String(n).padStart(2, '0');
}

function attFormatYmd_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + attPad2_(d.getMonth() + 1) + '-' + attPad2_(d.getDate());
}

function attParseYmd_(s) {
  const str = String(s || '').trim();
  const m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function attAddMonths_(d, months) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = out.getDate();
  out.setMonth(out.getMonth() + months);
  if (out.getDate() < day) out.setDate(0);
  return out;
}

function attDiffDays_(from, to) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.floor((b - a) / 86400000);
}

function attIsAdminRole_(role) {
  const r = String(role || '');
  return r.indexOf('管理') >= 0 || r === 'admin' || r === 'Admin';
}

function ensureAttendanceLeaveSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('休暇記録');
  if (!sheet) {
    sheet = ss.insertSheet('休暇記録');
    sheet.appendRow(['スタッフID', 'ユーザー名', '日付', '休暇種別', 'メモ', '登録者', '登録日時']);
  }
  return sheet;
}

function ensureAttendanceSettingsSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('出勤カレンダー設定');
  if (!sheet) {
    sheet = ss.insertSheet('出勤カレンダー設定');
    sheet.appendRow(['キー', '値']);
    sheet.appendRow(['monthlyLeaveLimit', '8']);
    sheet.appendRow(['unpaidYearlyLimit', '0']);
  }
  return sheet;
}

function ensureMeiboHireDateColumns_() {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('名簿');
  if (!sheet) throw new Error('名簿シートが見つかりません');
  const lastCol = Math.max(sheet.getLastColumn(), 4);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let hireCol = -1;
  let overrideCol = -1;
  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] || '').trim();
    if (h === '入社日' || h === 'hireDate') hireCol = c;
    if (h === '有給付与上書き' || h === 'paidLeaveOverride') overrideCol = c;
  }
  let nextCol = lastCol;
  if (hireCol < 0) {
    hireCol = nextCol;
    sheet.getRange(1, hireCol + 1).setValue('入社日');
    nextCol++;
  }
  if (overrideCol < 0) {
    overrideCol = Math.max(sheet.getLastColumn(), nextCol);
    sheet.getRange(1, overrideCol + 1).setValue('有給付与上書き');
  }
  return { sheet: sheet, hireCol: hireCol, overrideCol: overrideCol };
}

function getAttendanceSettingsMap_() {
  const sheet = ensureAttendanceSettingsSheet_();
  const data = sheet.getDataRange().getValues();
  const map = { monthlyLeaveLimit: 8, unpaidYearlyLimit: 0 };
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    const val = data[i][1];
    if (!key) continue;
    if (key === 'monthlyLeaveLimit' || key === 'unpaidYearlyLimit') {
      const n = parseInt(val, 10);
      map[key] = isNaN(n) ? map[key] : Math.max(0, n);
    } else {
      map[key] = val;
    }
  }
  return map;
}

function setAttendanceSettingValue_(key, value) {
  const sheet = ensureAttendanceSettingsSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function ensureWeeklyOffSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('週定休設定');
  if (!sheet) {
    sheet = ss.insertSheet('週定休設定');
    sheet.appendRow(['スタッフID', 'ユーザー名', '定休曜日', '出勤例外', '更新者', '更新日時']);
    return sheet;
  }
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let hasEx = false;
  for (let c = 0; c < headers.length; c++) {
    if (String(headers[c] || '').trim() === '出勤例外') hasEx = true;
  }
  if (!hasEx) {
    sheet.getRange(1, lastCol + 1).setValue('出勤例外');
  }
  return sheet;
}

function parseCsvWeekdays_(s) {
  const out = [];
  String(s || '').split(/[,、\s]+/).forEach(function (x) {
    const n = parseInt(x, 10);
    if (!isNaN(n) && n >= 0 && n <= 6 && out.indexOf(n) < 0) out.push(n);
  });
  out.sort(function (a, b) { return a - b; });
  return out;
}

function parseCsvYmdList_(s) {
  const out = [];
  String(s || '').split(/[,、\s]+/).forEach(function (x) {
    const ymd = attFormatYmd_(attParseYmd_(x));
    if (ymd && out.indexOf(ymd) < 0) out.push(ymd);
  });
  return out;
}

function normalizeWeekdayList_(raw) {
  const src = Array.isArray(raw) ? raw : parseCsvWeekdays_(raw);
  const out = [];
  src.forEach(function (x) {
    const n = parseInt(x, 10);
    if (!isNaN(n) && n >= 0 && n <= 6 && out.indexOf(n) < 0) out.push(n);
  });
  out.sort(function (a, b) { return a - b; });
  return out;
}

function loadWeeklyOff_(userId, userName) {
  const sheet = ensureWeeklyOffSheet_();
  const empty = { weeklyOffDays: [], workExceptions: [], sheetRow: 0 };
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return empty;
  const lastCol = Math.max(sheet.getLastColumn(), 6);
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const uid = String(userId || '').trim();
  const uname = String(userName || '').trim();
  for (let i = 0; i < values.length; i++) {
    const rowUid = String(values[i][0] || '').trim();
    const rowName = String(values[i][1] || '').trim();
    let match = false;
    if (uid) {
      if (rowUid) match = (rowUid === uid);
      else if (uname) match = (rowName === uname);
    } else if (uname) {
      match = (rowName === uname);
    }
    if (!match) continue;
    return {
      weeklyOffDays: parseCsvWeekdays_(values[i][2]),
      workExceptions: parseCsvYmdList_(values[i][3]),
      sheetRow: i + 2
    };
  }
  return empty;
}

function writeWeeklyOffRow_(target, weeklyOffDays, workExceptions, actor, sheetRow) {
  const sheet = ensureWeeklyOffSheet_();
  const days = normalizeWeekdayList_(weeklyOffDays);
  const keptEx = [];
  (workExceptions || []).forEach(function (ymd) {
    const d = attParseYmd_(ymd);
    if (!d) return;
    if (days.indexOf(d.getDay()) < 0) return;
    const formatted = attFormatYmd_(d);
    if (keptEx.indexOf(formatted) < 0) keptEx.push(formatted);
  });
  const row = [
    target.userId,
    target.userName,
    days.join(','),
    keptEx.join(','),
    actor,
    new Date()
  ];
  if (sheetRow) {
    sheet.getRange(sheetRow, 1, 1, 6).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { weeklyOffDays: days, workExceptions: keptEx };
}

function resolveAttendanceTarget_(requesterId, targetUserId, targetUserName) {
  const requester = findMeiboUser_(requesterId, '');
  const target = findMeiboUser_(targetUserId, targetUserName);
  if (!target) return { error: { success: false, message: '対象ユーザーが見つかりません' } };
  const isAdmin = requester && attIsAdminRole_(requester.role);
  if (!requester || (requester.userId !== target.userId && !isAdmin)) {
    return { error: { success: false, message: '設定する権限がありません' } };
  }
  return { requester: requester, target: target, isAdmin: isAdmin };
}

/** 労基法の年次有給付与日数（週5日以上想定） */
function calcStatutoryPaidLeaveDays_(hireDate, asOfDate) {
  if (!hireDate || !asOfDate) return 0;
  const firstGrant = attAddMonths_(hireDate, 6);
  if (asOfDate < firstGrant) return 0;
  let grantYears = 0;
  let cursor = firstGrant;
  while (true) {
    const next = attAddMonths_(cursor, 12);
    if (next > asOfDate) break;
    cursor = next;
    grantYears++;
  }
  // grantYears=0 → 勤続0.5年で10日, 1→1.5年で11日 ...
  const table = [10, 11, 12, 14, 16, 18, 20];
  if (grantYears >= table.length - 1) return 20;
  return table[grantYears];
}

function getCurrentGrantPeriod_(hireDate, asOfDate) {
  if (!hireDate) return { start: null, end: null, granted: 0 };
  const firstGrant = attAddMonths_(hireDate, 6);
  if (asOfDate < firstGrant) {
    return { start: null, end: firstGrant, granted: 0 };
  }
  let start = firstGrant;
  while (true) {
    const next = attAddMonths_(start, 12);
    if (next > asOfDate) break;
    start = next;
  }
  const end = attAddMonths_(start, 12);
  const granted = calcStatutoryPaidLeaveDays_(hireDate, asOfDate);
  return { start: start, end: end, granted: granted };
}

function findMeiboUser_(userId, userName) {
  const info = ensureMeiboHireDateColumns_();
  const data = info.sheet.getDataRange().getValues();
  const uid = String(userId || '').trim();
  const uname = String(userName || '').trim();
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    const name = String(data[i][2] || '').trim();
    if ((uid && id === uid) || (uname && name === uname)) {
      let hireRaw = data[i][info.hireCol];
      let hireDate = null;
      if (hireRaw instanceof Date && !isNaN(hireRaw.getTime())) {
        hireDate = new Date(hireRaw.getFullYear(), hireRaw.getMonth(), hireRaw.getDate());
      } else {
        hireDate = attParseYmd_(hireRaw);
      }
      const overrideRaw = data[i][info.overrideCol];
      const overrideNum = (overrideRaw === '' || overrideRaw == null) ? null : parseInt(overrideRaw, 10);
      return {
        row: i + 1,
        userId: id,
        password: String(data[i][1] || ''),
        userName: name,
        role: String(data[i][3] || '作業員'),
        hireDate: hireDate,
        hireDateYmd: hireDate ? attFormatYmd_(hireDate) : '',
        paidLeaveOverride: (overrideNum != null && !isNaN(overrideNum)) ? overrideNum : null,
        sheet: info.sheet,
        hireCol: info.hireCol,
        overrideCol: info.overrideCol
      };
    }
  }
  return null;
}

function getRequesterRole_(requesterId) {
  const u = findMeiboUser_(requesterId, '');
  return u ? u.role : '';
}

function buildTenureInfo_(hireDate, asOfDate) {
  if (!hireDate) {
    return { years: 0, days: 0, totalDays: 0, label: '入社日未登録', hireDateYmd: '' };
  }
  const totalDays = Math.max(0, attDiffDays_(hireDate, asOfDate));
  let years = asOfDate.getFullYear() - hireDate.getFullYear();
  let anniversary = new Date(asOfDate.getFullYear(), hireDate.getMonth(), hireDate.getDate());
  if (anniversary > asOfDate) {
    years--;
    anniversary = new Date(asOfDate.getFullYear() - 1, hireDate.getMonth(), hireDate.getDate());
  }
  if (years < 0) years = 0;
  const days = Math.max(0, attDiffDays_(anniversary, asOfDate));
  return {
    years: years,
    days: days,
    totalDays: totalDays,
    label: years + '年' + days + '日（累計' + totalDays + '日）',
    hireDateYmd: attFormatYmd_(hireDate)
  };
}

function loadLeaveRows_(userId, userName) {
  const sheet = ensureAttendanceLeaveSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const uid = String(userId || '').trim();
  const uname = String(userName || '').trim();
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    const rowUid = String(values[i][0] || '').trim();
    const rowName = String(values[i][1] || '').trim();
    if (uid) {
      if (rowUid) {
        if (rowUid !== uid) continue;
      } else if (uname) {
        if (rowName !== uname) continue;
      } else {
        continue;
      }
    } else if (uname) {
      if (rowName !== uname) continue;
    } else {
      continue;
    }
    let dateYmd = '';
    const raw = values[i][2];
    if (raw instanceof Date && !isNaN(raw.getTime())) dateYmd = attFormatYmd_(raw);
    else dateYmd = attFormatYmd_(attParseYmd_(raw)) || String(raw || '').trim();
    if (!dateYmd) continue;
    rows.push({
      sheetRow: i + 2,
      userId: rowUid,
      userName: rowName,
      date: dateYmd,
      leaveType: String(values[i][3] || 'その他'),
      note: String(values[i][4] || ''),
      createdBy: String(values[i][5] || ''),
      createdAt: values[i][6]
    });
  }
  return rows;
}

function loadAttendanceDaysFromTracking_(userName, year, month) {
  const ss = TENANT_SS;
  const sheet = ss.getSheetByName('トラッキング');
  const days = {};
  if (!sheet || !userName) return days;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return days;
  const startRow = Math.max(2, lastRow - 14999);
  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues();
  const uname = String(userName).replace(/\s+/g, '');
  const y = Number(year);
  const m = Number(month);
  for (let i = 0; i < values.length; i++) {
    const type = String(values[i][4] || '');
    if (type !== '出勤' && type !== 'アプリ起動') continue;
    const rowUser = String(values[i][1] || '').replace(/\s+/g, '');
    if (!rowUser) continue;
    if (rowUser !== uname && uname.indexOf(rowUser) < 0 && rowUser.indexOf(uname) < 0) continue;
    const tObj = new Date(values[i][0]);
    if (isNaN(tObj.getTime())) continue;
    if (tObj.getFullYear() !== y || (tObj.getMonth() + 1) !== m) continue;
    const ymd = attFormatYmd_(tObj);
    if (!days[ymd]) {
      days[ymd] = {
        date: ymd,
        clockInTime: attPad2_(tObj.getHours()) + ':' + attPad2_(tObj.getMinutes()),
        types: [type]
      };
    }
  }
  return days;
}

function countLeavesInMonth_(leaveRows, year, month) {
  const prefix = year + '-' + attPad2_(month);
  let total = 0;
  let unpaid = 0;
  let paid = 0;
  leaveRows.forEach(function (r) {
    if (String(r.date).indexOf(prefix) !== 0) return;
    total++;
    if (r.leaveType === '有給') paid++;
    else unpaid++;
  });
  return { total: total, unpaid: unpaid, paid: paid };
}

function countPaidUsedInPeriod_(leaveRows, start, end) {
  if (!start || !end) return 0;
  const s = attFormatYmd_(start);
  const e = attFormatYmd_(end);
  let n = 0;
  leaveRows.forEach(function (r) {
    if (r.leaveType !== '有給') return;
    if (r.date >= s && r.date < e) n++;
  });
  return n;
}

function countUnpaidInYear_(leaveRows, year) {
  const prefix = String(year) + '-';
  let n = 0;
  leaveRows.forEach(function (r) {
    if (r.leaveType === '有給') return;
    if (String(r.date).indexOf(prefix) === 0) n++;
  });
  return n;
}

function buildPaidLeaveSummary_(user, leaveRows, asOfDate) {
  const tenure = buildTenureInfo_(user.hireDate, asOfDate);
  const period = getCurrentGrantPeriod_(user.hireDate, asOfDate);
  let granted = period.granted;
  if (user.paidLeaveOverride != null) granted = user.paidLeaveOverride;
  const used = countPaidUsedInPeriod_(leaveRows, period.start, period.end);
  const remaining = Math.max(0, granted - used);
  return {
    hireDateYmd: user.hireDateYmd,
    tenure: tenure,
    grantStart: period.start ? attFormatYmd_(period.start) : '',
    grantEnd: period.end ? attFormatYmd_(period.end) : '',
    granted: granted,
    used: used,
    remaining: remaining,
    override: user.paidLeaveOverride,
    autoGranted: period.granted
  };
}

function getAttendanceCalendar(params) {
  const requesterId = String((params && params.requesterId) || (params && params.userId) || '').trim();
  const targetUserId = String((params && params.targetUserId) || requesterId).trim();
  const targetUserName = String((params && params.targetUserName) || '').trim();
  const year = parseInt(params && params.year, 10) || new Date().getFullYear();
  const month = parseInt(params && params.month, 10) || (new Date().getMonth() + 1);
  const requester = findMeiboUser_(requesterId, '');
  const target = findMeiboUser_(targetUserId, targetUserName);
  if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
  if (requester && requester.userId !== target.userId && !attIsAdminRole_(requester.role)) {
    return { success: false, message: '他のスタッフのカレンダーを見る権限がありません' };
  }
  const asOf = new Date();
  const leaveRows = loadLeaveRows_(target.userId, target.userName);
  const weeklyOff = loadWeeklyOff_(target.userId, target.userName);
  const attendanceDays = loadAttendanceDaysFromTracking_(target.userName, year, month);
  const settings = getAttendanceSettingsMap_();
  const monthCounts = countLeavesInMonth_(leaveRows, year, month);
  const paid = buildPaidLeaveSummary_(target, leaveRows, asOf);
  const monthLeaves = leaveRows.filter(function (r) {
    return String(r.date).indexOf(year + '-' + attPad2_(month)) === 0;
  });
  return {
    success: true,
    year: year,
    month: month,
    user: {
      userId: target.userId,
      userName: target.userName,
      role: target.role,
      hireDateYmd: target.hireDateYmd
    },
    isAdmin: requester ? attIsAdminRole_(requester.role) : false,
    settings: settings,
    paidLeave: paid,
    monthLeaveCount: monthCounts.total,
    monthLeaveLimit: settings.monthlyLeaveLimit,
    unpaidYearCount: countUnpaidInYear_(leaveRows, year),
    unpaidYearlyLimit: settings.unpaidYearlyLimit,
    attendanceDays: attendanceDays,
    leaveDays: monthLeaves,
    allLeaveDays: leaveRows,
    weeklyOffDays: weeklyOff.weeklyOffDays,
    workExceptions: weeklyOff.workExceptions
  };
}

function setLeaveDay(params) {
  const requesterId = String((params && params.requesterId) || '').trim();
  const targetUserId = String((params && params.targetUserId) || requesterId).trim();
  const dateYmd = attFormatYmd_(attParseYmd_(params && params.date));
  const leaveType = String((params && params.leaveType) || '有給').trim();
  const note = String((params && params.note) || '').trim();
  const force = !!(params && params.force);
  if (!dateYmd) return { success: false, message: '日付が不正です' };
  if (['有給', '公休', 'その他'].indexOf(leaveType) < 0) {
    return { success: false, message: '休暇種別が不正です' };
  }
  if (leaveType === '有給' && !note) {
    return {
      success: false,
      message: '有給を設定するには理由を入力してください',
      code: 'PAID_LEAVE_REASON_REQUIRED'
    };
  }
  const requester = findMeiboUser_(requesterId, '');
  const target = findMeiboUser_(targetUserId, params && params.targetUserName);
  if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
  const isAdmin = requester && attIsAdminRole_(requester.role);
  if (!requester || (requester.userId !== target.userId && !isAdmin)) {
    return { success: false, message: '休みを設定する権限がありません' };
  }
  const leaveRows = loadLeaveRows_(target.userId, target.userName);
  const existing = leaveRows.filter(function (r) { return r.date === dateYmd; })[0];
  const settings = getAttendanceSettingsMap_();
  const d = attParseYmd_(dateYmd);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const monthCounts = countLeavesInMonth_(leaveRows, year, month);
  const wouldAdd = existing ? 0 : 1;
  if (!force && settings.monthlyLeaveLimit > 0 && (monthCounts.total + wouldAdd) > settings.monthlyLeaveLimit) {
    return {
      success: false,
      message: '月の休み上限（' + settings.monthlyLeaveLimit + '日）を超えます',
      code: 'MONTHLY_LIMIT'
    };
  }
  if (leaveType !== '有給') {
    const unpaidYear = countUnpaidInYear_(leaveRows, year);
    const unpaidAdd = (!existing || existing.leaveType === '有給') ? 1 : 0;
    if (!force && settings.unpaidYearlyLimit > 0 && (unpaidYear + unpaidAdd) > settings.unpaidYearlyLimit) {
      return {
        success: false,
        message: '年間の公休・その他の上限（' + settings.unpaidYearlyLimit + '日）を超えます',
        code: 'YEARLY_UNPAID_LIMIT'
      };
    }
  } else {
    const paid = buildPaidLeaveSummary_(target, leaveRows, new Date());
    const paidAdd = (!existing || existing.leaveType !== '有給') ? 1 : 0;
    if (!force && paid.remaining < paidAdd) {
      return {
        success: false,
        message: '有給残日数（' + paid.remaining + '日）が不足しています',
        code: 'PAID_LEAVE_SHORT'
      };
    }
  }
  const sheet = ensureAttendanceLeaveSheet_();
  const actor = requester.userName || requesterId;
  if (existing) {
    sheet.getRange(existing.sheetRow, 1, 1, 7).setValues([[
      target.userId, target.userName, dateYmd, leaveType, note, actor, new Date()
    ]]);
  } else {
    sheet.appendRow([target.userId, target.userName, dateYmd, leaveType, note, actor, new Date()]);
  }
  writeLog(actor, '休暇設定', target.userName, dateYmd + ' ' + leaveType);
  const weekly = loadWeeklyOff_(target.userId, target.userName);
  if (weekly.workExceptions.indexOf(dateYmd) >= 0) {
    writeWeeklyOffRow_(target, weekly.weeklyOffDays, weekly.workExceptions.filter(function (d) { return d !== dateYmd; }), actor, weekly.sheetRow);
  }
  return { success: true, message: '休みを設定しました' };
}

function clearLeaveDay(params) {
  const requesterId = String((params && params.requesterId) || '').trim();
  const targetUserId = String((params && params.targetUserId) || requesterId).trim();
  const dateYmd = attFormatYmd_(attParseYmd_(params && params.date));
  if (!dateYmd) return { success: false, message: '日付が不正です' };
  const requester = findMeiboUser_(requesterId, '');
  const target = findMeiboUser_(targetUserId, params && params.targetUserName);
  if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
  const isAdmin = requester && attIsAdminRole_(requester.role);
  if (!requester || (requester.userId !== target.userId && !isAdmin)) {
    return { success: false, message: '休みを削除する権限がありません' };
  }
  const leaveRows = loadLeaveRows_(target.userId, target.userName);
  const existing = leaveRows.filter(function (r) { return r.date === dateYmd; })[0];
  if (!existing) return { success: true, message: '該当する休みはありません' };
  ensureAttendanceLeaveSheet_().deleteRow(existing.sheetRow);
  writeLog(requester.userName || requesterId, '休暇削除', target.userName, dateYmd);
  return { success: true, message: '休みを解除しました' };
}

function saveWeeklyOffDays(params) {
  const requesterId = String((params && params.requesterId) || '').trim();
  const targetUserId = String((params && params.targetUserId) || requesterId).trim();
  const resolved = resolveAttendanceTarget_(requesterId, targetUserId, params && params.targetUserName);
  if (resolved.error) return resolved.error;
  const target = resolved.target;
  const actor = resolved.requester.userName || requesterId;
  const rec = loadWeeklyOff_(target.userId, target.userName);
  const saved = writeWeeklyOffRow_(target, params && params.weeklyOffDays, rec.workExceptions, actor, rec.sheetRow);
  writeLog(actor, '週定休設定', target.userName, (saved.weeklyOffDays || []).join(',') || '(なし)');
  return {
    success: true,
    message: '毎週の定休日を保存しました',
    weeklyOffDays: saved.weeklyOffDays,
    workExceptions: saved.workExceptions
  };
}

function setWorkDayException(params) {
  const requesterId = String((params && params.requesterId) || '').trim();
  const targetUserId = String((params && params.targetUserId) || requesterId).trim();
  const dateYmd = attFormatYmd_(attParseYmd_(params && params.date));
  if (!dateYmd) return { success: false, message: '日付が不正です' };
  const resolved = resolveAttendanceTarget_(requesterId, targetUserId, params && params.targetUserName);
  if (resolved.error) return resolved.error;
  const target = resolved.target;
  const actor = resolved.requester.userName || requesterId;
  const rec = loadWeeklyOff_(target.userId, target.userName);
  const d = attParseYmd_(dateYmd);
  const rawWork = params && params.isWork;
  const isWork = rawWork === true || rawWork === 'true' || rawWork === 1 || rawWork === '1';
  if (isWork && rec.weeklyOffDays.indexOf(d.getDay()) < 0) {
    return { success: false, message: '定休日ではないため出勤例外は不要です' };
  }
  const leaveRows = loadLeaveRows_(target.userId, target.userName);
  const existingLeave = leaveRows.filter(function (r) { return r.date === dateYmd; })[0];
  if (isWork && existingLeave) {
    ensureAttendanceLeaveSheet_().deleteRow(existingLeave.sheetRow);
  }
  let ex = rec.workExceptions.slice();
  const idx = ex.indexOf(dateYmd);
  if (isWork) {
    if (idx < 0) ex.push(dateYmd);
  } else if (idx >= 0) {
    ex.splice(idx, 1);
  }
  const saved = writeWeeklyOffRow_(target, rec.weeklyOffDays, ex, actor, rec.sheetRow);
  writeLog(actor, isWork ? '定休出勤' : '定休復帰', target.userName, dateYmd);
  return {
    success: true,
    message: isWork ? 'この日を出勤日にしました' : 'この日を定休に戻しました',
    weeklyOffDays: saved.weeklyOffDays,
    workExceptions: saved.workExceptions
  };
}

function getAttendanceSettings(params) {
  const requesterId = String((params && params.requesterId) || '').trim();
  const requester = findMeiboUser_(requesterId, '');
  if (!requester || !attIsAdminRole_(requester.role)) {
    return { success: false, message: '管理者のみ閲覧できます' };
  }
  return { success: true, settings: getAttendanceSettingsMap_() };
}

function saveAttendanceSettings(params) {
  const requesterId = String((params && params.requesterId) || '').trim();
  const requester = findMeiboUser_(requesterId, '');
  if (!requester || !attIsAdminRole_(requester.role)) {
    return { success: false, message: '管理者のみ変更できます' };
  }
  const monthly = parseInt(params && params.monthlyLeaveLimit, 10);
  const unpaid = parseInt(params && params.unpaidYearlyLimit, 10);
  if (!isNaN(monthly) && monthly >= 0) setAttendanceSettingValue_('monthlyLeaveLimit', monthly);
  if (!isNaN(unpaid) && unpaid >= 0) setAttendanceSettingValue_('unpaidYearlyLimit', unpaid);
  writeLog(requester.userName || requesterId, '出勤カレンダー設定', 'システム',
    '月上限=' + monthly + ' 年公休上限=' + unpaid);
  return { success: true, settings: getAttendanceSettingsMap_(), message: '設定を保存しました' };
}

function updateStaffHireDate(params) {
  const requesterId = String((params && params.requesterId) || '').trim();
  const requester = findMeiboUser_(requesterId, '');
  if (!requester || !attIsAdminRole_(requester.role)) {
    return { success: false, message: '管理者のみ変更できます' };
  }
  const targetUserId = String((params && params.targetUserId) || '').trim();
  const target = findMeiboUser_(targetUserId, params && params.targetUserName);
  if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
  const hireYmd = String((params && params.hireDate) || '').trim();
  const hireDate = hireYmd ? attParseYmd_(hireYmd) : null;
  if (hireYmd && !hireDate) return { success: false, message: '入社日が不正です' };
  target.sheet.getRange(target.row, target.hireCol + 1).setValue(hireDate ? attFormatYmd_(hireDate) : '');
  if (params && params.paidLeaveOverride !== undefined) {
    const ov = String(params.paidLeaveOverride).trim();
    if (ov === '') {
      target.sheet.getRange(target.row, target.overrideCol + 1).setValue('');
    } else {
      const n = parseInt(ov, 10);
      if (isNaN(n) || n < 0) return { success: false, message: '有給付与上書きが不正です' };
      target.sheet.getRange(target.row, target.overrideCol + 1).setValue(n);
    }
  }
  const updated = findMeiboUser_(target.userId, '');
  const leaveRows = loadLeaveRows_(updated.userId, updated.userName);
  const paid = buildPaidLeaveSummary_(updated, leaveRows, new Date());
  writeLog(requester.userName || requesterId, '入社日更新', updated.userName, updated.hireDateYmd || '(クリア)');
  return { success: true, message: '入社日を更新しました', paidLeave: paid, user: {
    userId: updated.userId,
    userName: updated.userName,
    hireDateYmd: updated.hireDateYmd,
    paidLeaveOverride: updated.paidLeaveOverride
  }};
}

function getAttendanceStaffList(params) {
  const requesterId = String((params && params.requesterId) || '').trim();
  const requester = findMeiboUser_(requesterId, '');
  if (!requester || !attIsAdminRole_(requester.role)) {
    return { success: false, message: '管理者のみ閲覧できます' };
  }
  const info = ensureMeiboHireDateColumns_();
  const data = info.sheet.getDataRange().getValues();
  const asOf = new Date();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    const name = String(data[i][2] || '').trim();
    if (!id && !name) continue;
    const user = findMeiboUser_(id, name);
    if (!user) continue;
    const leaveRows = loadLeaveRows_(user.userId, user.userName);
    const paid = buildPaidLeaveSummary_(user, leaveRows, asOf);
    list.push({
      userId: user.userId,
      userName: user.userName,
      role: user.role,
      hireDateYmd: user.hireDateYmd,
      paidLeaveOverride: user.paidLeaveOverride,
      tenureLabel: paid.tenure.label,
      granted: paid.granted,
      remaining: paid.remaining,
      used: paid.used
    });
  }
  return { success: true, staff: list, settings: getAttendanceSettingsMap_() };
}

// ========== 見積台帳（作成見積・受領見積） ==========
const QUOTATION_HEADERS_ = [
  'ID', '文書種別', '見積番号', '見積日', '有効期限', '取引先名', '件名',
  '状態', '税率', '小計', '消費税', '合計', '添付JSON', '備考',
  '作成者', '作成日時', '更新者', '更新日時'
];
const QUOTATION_LINE_HEADERS_ = [
  '明細ID', '見積ID', '行番号', 'カテゴリ', 'マスタID', '対象機械ID',
  '品名', '規格・型番', '数量', '単位', '単価', '金額', '備考'
];

function ensureQuotationSheets_() {
  const ss = TENANT_SS;
  if (!ss) throw new Error('保存先が設定されていません');
  let quoteSheet = ss.getSheetByName('見積台帳');
  if (!quoteSheet) {
    quoteSheet = ss.insertSheet('見積台帳');
    quoteSheet.appendRow(QUOTATION_HEADERS_.slice());
    quoteSheet.getRange(1, 1, 1, QUOTATION_HEADERS_.length).setFontWeight('bold');
    quoteSheet.setFrozenRows(1);
  }
  let lineSheet = ss.getSheetByName('見積明細');
  if (!lineSheet) {
    lineSheet = ss.insertSheet('見積明細');
    lineSheet.appendRow(QUOTATION_LINE_HEADERS_.slice());
    lineSheet.getRange(1, 1, 1, QUOTATION_LINE_HEADERS_.length).setFontWeight('bold');
    lineSheet.setFrozenRows(1);
  }
  return { quoteSheet: quoteSheet, lineSheet: lineSheet };
}

function quotationGetInit_() {
  const machineData = machine_loadAll({});
  return {
    success: true,
    fertilizers: readFertilizerMasterList_(),
    pesticides: readPesticideMasterList_(),
    machines: (machineData && machineData.machines) || {}
  };
}

function quotationSaveAttachment_(attachment, quotationId) {
  if (!attachment || !attachment.dataUrl) return null;
  const match = String(attachment.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('添付ファイルの形式が正しくありません');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('添付ファイルは5MB以下にしてください');
  const rootName = '情熱MAP_見積書_' + TENANT_SS.getId().slice(-8);
  const roots = DriveApp.getFoldersByName(rootName);
  const root = roots.hasNext() ? roots.next() : DriveApp.createFolder(rootName);
  const quoteFolders = root.getFoldersByName(quotationId);
  const folder = quoteFolders.hasNext() ? quoteFolders.next() : root.createFolder(quotationId);
  const safeName = String(attachment.name || 'quotation-file').replace(/[\\/:*?"<>|]/g, '_');
  const file = folder.createFile(Utilities.newBlob(bytes, match[1], safeName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    fileId: file.getId(), fileName: safeName, mimeType: match[1], size: bytes.length,
    url: 'https://drive.google.com/file/d/' + file.getId() + '/view'
  };
}

function quotationSave_(params) {
  const quote = (params && params.quotation) || {};
  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  if (!String(quote.partner || '').trim()) throw new Error('取引先名を入力してください');
  if (!lines.length) throw new Error('見積明細を1件以上入力してください');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheets = ensureQuotationSheets_();
    const now = new Date();
    const id = String(quote.id || '').trim() || ('QUO-' + Utilities.getUuid().substring(0, 8));
    let attachments = Array.isArray(quote.existingAttachments) ? quote.existingAttachments : [];
    if (quote.attachment && quote.attachment.dataUrl) {
      const saved = quotationSaveAttachment_(quote.attachment, id);
      if (saved) attachments = attachments.concat([saved]);
    }
    let subtotal = 0;
    const normalizedLines = lines.map(function(line, idx) {
      const qty = Math.max(0, Number(line.qty) || 0);
      const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
      const amount = qty * unitPrice;
      subtotal += amount;
      return {
        id: String(line.id || '') || ('QL-' + Utilities.getUuid().substring(0, 8)),
        rowNo: idx + 1, category: String(line.category || 'other'),
        masterId: String(line.masterId || ''), machineId: String(line.machineId || ''),
        name: String(line.name || '').trim(), spec: String(line.spec || '').trim(),
        qty: qty, unit: String(line.unit || '').trim(), unitPrice: unitPrice,
        amount: amount, note: String(line.note || '').trim()
      };
    }).filter(function(line) { return line.name; });
    if (!normalizedLines.length) throw new Error('品名を選択または入力してください');
    const taxRate = Math.max(0, Number(quote.taxRate) || 0);
    const tax = Math.floor(subtotal * taxRate / 100);
    const quoteData = sheets.quoteSheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < quoteData.length; i++) {
      if (String(quoteData[i][0]) === id) { rowIndex = i + 1; break; }
    }
    const existingCreatedAt = rowIndex > 0 ? quoteData[rowIndex - 1][15] : now;
    const values = [[
      id, String(quote.documentType || 'incoming'), String(quote.quoteNo || ''),
      String(quote.quoteDate || ''), String(quote.validUntil || ''), String(quote.partner || ''),
      String(quote.subject || ''), String(quote.status || 'received'), taxRate,
      subtotal, tax, subtotal + tax, JSON.stringify(attachments), String(quote.note || ''),
      rowIndex > 0 ? String(quoteData[rowIndex - 1][14] || params.userName || '') : String(params.userName || ''),
      existingCreatedAt, String(params.userName || ''), now
    ]];
    if (rowIndex > 0) sheets.quoteSheet.getRange(rowIndex, 1, 1, QUOTATION_HEADERS_.length).setValues(values);
    else sheets.quoteSheet.getRange(sheets.quoteSheet.getLastRow() + 1, 1, 1, QUOTATION_HEADERS_.length).setValues(values);
    const lineData = sheets.lineSheet.getDataRange().getValues();
    for (let i = lineData.length - 1; i >= 1; i--) {
      if (String(lineData[i][1]) === id) sheets.lineSheet.deleteRow(i + 1);
    }
    if (normalizedLines.length) {
      const lineValues = normalizedLines.map(function(line) {
        return [line.id, id, line.rowNo, line.category, line.masterId, line.machineId,
          line.name, line.spec, line.qty, line.unit, line.unitPrice, line.amount, line.note];
      });
      sheets.lineSheet.getRange(sheets.lineSheet.getLastRow() + 1, 1, lineValues.length, QUOTATION_LINE_HEADERS_.length).setValues(lineValues);
    }
    SpreadsheetApp.flush();
    return { success: true, id: id, attachments: attachments, total: subtotal + tax };
  } finally {
    lock.releaseLock();
  }
}

function quotationList_(params) {
  const sheets = ensureQuotationSheets_();
  const quoteData = sheets.quoteSheet.getDataRange().getValues();
  const lineData = sheets.lineSheet.getDataRange().getValues();
  const linesByQuote = {};
  for (let i = 1; i < lineData.length; i++) {
    const quoteId = String(lineData[i][1] || '');
    if (!quoteId) continue;
    if (!linesByQuote[quoteId]) linesByQuote[quoteId] = [];
    linesByQuote[quoteId].push({
      id: String(lineData[i][0] || ''), rowNo: Number(lineData[i][2]) || 0,
      category: String(lineData[i][3] || ''), masterId: String(lineData[i][4] || ''),
      machineId: String(lineData[i][5] || ''), name: String(lineData[i][6] || ''),
      spec: String(lineData[i][7] || ''), qty: Number(lineData[i][8]) || 0,
      unit: String(lineData[i][9] || ''), unitPrice: Number(lineData[i][10]) || 0,
      amount: Number(lineData[i][11]) || 0, note: String(lineData[i][12] || '')
    });
  }
  const items = [];
  for (let i = quoteData.length - 1; i >= 1; i--) {
    const row = quoteData[i];
    const status = String(row[7] || '');
    if (status === 'archived' && !(params && params.includeArchived)) continue;
    let attachments = [];
    try { attachments = JSON.parse(String(row[12] || '[]')); } catch (e) {}
    const id = String(row[0] || '');
    items.push({
      id: id, documentType: String(row[1] || ''), quoteNo: String(row[2] || ''),
      quoteDate: String(row[3] || ''), validUntil: String(row[4] || ''),
      partner: String(row[5] || ''), subject: String(row[6] || ''), status: status,
      taxRate: Number(row[8]) || 0, subtotal: Number(row[9]) || 0,
      tax: Number(row[10]) || 0, total: Number(row[11]) || 0,
      attachments: attachments, note: String(row[13] || ''), creator: String(row[14] || ''),
      updatedAt: row[17] instanceof Date ? row[17].toISOString() : String(row[17] || ''),
      lines: linesByQuote[id] || []
    });
  }
  return { success: true, items: items };
}

function quotationArchive_(params) {
  const id = String((params && params.id) || '');
  if (!id) throw new Error('見積IDがありません');
  const sheets = ensureQuotationSheets_();
  const data = sheets.quoteSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== id) continue;
    sheets.quoteSheet.getRange(i + 1, 8).setValue('archived');
    sheets.quoteSheet.getRange(i + 1, 17, 1, 2).setValues([[String(params.userName || ''), new Date()]]);
    return { success: true };
  }
  throw new Error('対象の見積が見つかりません');
}

// ==========================================
// 🔍 操作索引（検索→対象→実行）
// ==========================================
const OPS_INDEX_HEADERS = ['ID', '対象名', 'キーワード', '操作名', 'URL', 'アイコン', '対象キー', '有効', '並び', '更新者', '更新日時', 'メモ'];

function ensureOpsIndexSheet_() {
  const ss = TENANT_SS;
  if (!ss) throw new Error('データベースに接続できません');
  let sheet = ss.getSheetByName('操作索引');
  if (!sheet) {
    sheet = ss.insertSheet('操作索引');
    sheet.getRange(1, 1, 1, OPS_INDEX_HEADERS.length).setValues([OPS_INDEX_HEADERS]);
    try { sheet.getRange(1, 1, 1, OPS_INDEX_HEADERS.length).setFontWeight('bold').setBackground('#e0e0e0'); } catch (e) {}
    return sheet;
  }
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  for (let i = 0; i < OPS_INDEX_HEADERS.length; i++) {
    if (headers[i] !== OPS_INDEX_HEADERS[i]) {
      try { sheet.getRange(1, i + 1).setValue(OPS_INDEX_HEADERS[i]); } catch (e) {}
    }
  }
  return sheet;
}

function isOpsRouteEnabled_(v) {
  if (v === false || v === 0) return false;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return true;
  return !(s === 'false' || s === '0' || s === 'no' || s === '無効' || s === 'off');
}

function readOpsCustomRoutes_() {
  const sheet = ensureOpsIndexSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, OPS_INDEX_HEADERS.length).getValues();
  const list = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const id = String(row[0] || '').trim();
    const targetName = String(row[1] || '').trim();
    const actionName = String(row[3] || '').trim();
    const url = String(row[4] || '').trim();
    if (!id && !targetName && !actionName) continue;
    list.push({
      id: id,
      targetName: targetName,
      keywords: String(row[2] || '').trim(),
      actionName: actionName,
      url: url,
      icon: String(row[5] || '').trim(),
      targetKey: String(row[6] || '').trim(),
      enabled: isOpsRouteEnabled_(row[7]),
      order: row[8] === '' || row[8] == null ? 100 : Number(row[8]),
      userName: String(row[9] || '').trim(),
      updatedAt: row[10] ? String(row[10]) : '',
      note: String(row[11] || '').trim(),
      source: 'custom'
    });
  }
  return list;
}

function getOpsIndex(params) {
  const ss = TENANT_SS;
  if (!ss) throw new Error('データベースに接続できません。ログインしてください。');
  const materials = [];
  const mSh = ss.getSheetByName('資材マスタ');
  if (mSh) {
    const md = mSh.getDataRange().getValues();
    for (let i = 1; i < md.length; i++) {
      const name = String(md[i][1] || '').trim();
      if (!name) continue;
      materials.push({
        id: String(md[i][0] || '').trim(),
        name: name,
        workCategory: String(md[i][2] || '').trim(),
        size: md[i][3] || '',
        volUnit: String(md[i][4] || '').trim(),
        stockUnit: String(md[i][5] || '').trim(),
        signName: String(md[i][8] || '').trim(),
        signId: String(md[i][9] || '').trim(),
        stock: md[i][10] || 0
      });
    }
  }

  const works = [];
  const workSheet = ss.getSheetByName('作業マスタ');
  if (workSheet) {
    try { ensureWorkMasterHeaders_(workSheet); } catch (e) {}
    const data = workSheet.getDataRange().getValues();
    if (data.length > 0) {
      const headers = data[0].map(h => String(h).trim());
      const idxName = headers.indexOf('作業名');
      const idxCategory = findWorkCategoryColumnIndex_(headers);
      const idxAlias = findWorkAliasColumnIndex_(headers);
      for (let i = 1; i < data.length; i++) {
        const name = idxName >= 0 ? String(data[i][idxName] || '').trim() : '';
        if (!name) continue;
        works.push({
          name: name,
          category: idxCategory >= 0 ? String(data[i][idxCategory] || '').trim() : '',
          aliases: idxAlias >= 0 ? String(data[i][idxAlias] || '').trim() : ''
        });
      }
    }
  }

  let pesticides = [];
  try {
    pesticides = (readPesticideMasterList_() || []).map(function (p) {
      return { id: String(p.id || '').trim(), name: String(p.name || '').trim() };
    }).filter(function (p) { return p.name; });
  } catch (e) { pesticides = []; }

  let fertilizers = [];
  try {
    fertilizers = (readFertilizerMasterList_() || []).map(function (f) {
      return { id: String(f.id || '').trim(), name: String(f.name || '').trim() };
    }).filter(function (f) { return f.name; });
  } catch (e) { fertilizers = []; }

  return {
    materials: materials,
    works: works,
    pesticides: pesticides,
    fertilizers: fertilizers,
    customRoutes: readOpsCustomRoutes_()
  };
}

function saveOpsRoute(params) {
  const p = params || {};
  const sheet = ensureOpsIndexSheet_();
  const targetName = String(p.targetName || '').trim();
  const actionName = String(p.actionName || '').trim();
  const url = String(p.url || '').trim();
  if (!targetName) throw new Error('対象名を入力してください');
  if (!actionName) throw new Error('操作名を入力してください');
  if (!url) throw new Error('飛び先URLを入力してください');

  const now = Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss');
  const userName = String(p.userName || '').trim();
  let id = String(p.id || '').trim();
  const rowData = [
    id,
    targetName,
    String(p.keywords || '').trim(),
    actionName,
    url,
    String(p.icon || '').trim(),
    String(p.targetKey || '').trim(),
    p.enabled === false ? 'FALSE' : 'TRUE',
    p.order === '' || p.order == null ? 100 : Number(p.order),
    userName,
    now,
    String(p.note || '').trim()
  ];

  const lastRow = sheet.getLastRow();
  if (id && lastRow >= 2) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || '').trim() === id) {
        sheet.getRange(i + 2, 1, 1, OPS_INDEX_HEADERS.length).setValues([rowData]);
        writeLog(userName, '操作索引更新', targetName, actionName);
        return { success: true, id: id };
      }
    }
  }

  id = id || ('ops_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12));
  rowData[0] = id;
  sheet.appendRow(rowData);
  writeLog(userName, '操作索引登録', targetName, actionName);
  return { success: true, id: id };
}

function deleteOpsRoute(params) {
  const id = String((params && params.id) || '').trim();
  if (!id) throw new Error('削除するIDがありません');
  const sheet = ensureOpsIndexSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('登録がありません');
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === id) {
      const name = String(sheet.getRange(i + 2, 2).getValue() || '');
      sheet.deleteRow(i + 2);
      writeLog(String((params && params.userName) || ''), '操作索引削除', name, id);
      return { success: true };
    }
  }
  throw new Error('対象の登録が見つかりません');
}

// ==========================================
// 💡 アイデアボード
// ==========================================
function ideaBoard_defaultCategories_() {
  return ['機械', '栽培', '運営', '販売'];
}

function ideaBoard_ensureSheets_() {
  const ss = TENANT_SS;
  const headers = ['ID', '登録者', '登録日', 'カテゴリ', '内容', 'ステータス', '廃案理由', 'メモJSON', '履歴JSON', '更新者', '更新日時', '課題'];
  let board = ss.getSheetByName('アイデアボード');
  if (!board) {
    board = ss.insertSheet('アイデアボード');
    board.getRange(1, 1, 1, headers.length).setValues([headers]);
    try { board.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e0e0e0'); } catch (e) {}
  } else {
    const lastCol = Math.max(board.getLastColumn(), 1);
    const existing = board.getRange(1, 1, 1, Math.max(lastCol, headers.length)).getValues()[0];
    for (let i = 0; i < headers.length; i++) {
      if (String(existing[i] || '') !== headers[i]) board.getRange(1, i + 1).setValue(headers[i]);
    }
  }
  let cats = ss.getSheetByName('アイデアカテゴリ');
  if (!cats) {
    cats = ss.insertSheet('アイデアカテゴリ');
    cats.getRange(1, 1).setValue('カテゴリ名');
    ideaBoard_defaultCategories_().forEach(function (c) { cats.appendRow([c]); });
    try { cats.getRange(1, 1).setFontWeight('bold').setBackground('#e0e0e0'); } catch (e) {}
  }
  return { board: board, cats: cats };
}

function ideaBoard_parseJson_(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (Array.isArray(raw) || (typeof raw === 'object' && !(raw instanceof Date))) return raw;
  try {
    const o = JSON.parse(String(raw));
    return o == null ? fallback : o;
  } catch (e) {
    return fallback;
  }
}

function ideaBoard_formatYmd_(d) {
  if (d instanceof Date && !isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'JST', 'yyyy-MM-dd');
  }
  const s = String(d || '').trim();
  const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return s;
}

function ideaBoard_rowToItem_(row) {
  return {
    id: String(row[0] || ''),
    author: String(row[1] || ''),
    date: ideaBoard_formatYmd_(row[2]),
    category: String(row[3] || ''),
    content: String(row[4] || ''),
    status: String(row[5] || 'idea'),
    rejectReason: String(row[6] || ''),
    memos: ideaBoard_parseJson_(row[7], []),
    history: ideaBoard_parseJson_(row[8], []),
    updatedBy: String(row[9] || ''),
    updatedAt: row[10] instanceof Date
      ? Utilities.formatDate(row[10], 'JST', 'yyyy/MM/dd HH:mm')
      : String(row[10] || ''),
    issue: String(row[11] || '')
  };
}

function ideaBoard_listCategories_(sheet) {
  const names = ideaBoard_defaultCategories_().slice();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const n = String(data[i][0] || '').trim();
    if (n && names.indexOf(n) < 0) names.push(n);
  }
  return names;
}

function ideaBoard_list(params) {
  const sheets = ideaBoard_ensureSheets_();
  const data = sheets.board.getDataRange().getValues();
  const items = [];
  for (let i = 1; i < data.length; i++) {
    if (!String(data[i][0] || '').trim()) continue;
    items.push(ideaBoard_rowToItem_(data[i]));
  }
  items.sort(function (a, b) {
    return String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id));
  });
  return {
    success: true,
    items: items,
    categories: ideaBoard_listCategories_(sheets.cats)
  };
}

function ideaBoard_save(params) {
  const sheets = ideaBoard_ensureSheets_();
  const user = String((params && params.userName) || '').trim() || '不明';
  const now = new Date();
  const content = String((params && params.content) || '').trim();
  if (!content) return { success: false, message: '内容を入力してください' };
  const category = String((params && params.category) || '').trim();
  if (!category) return { success: false, message: 'カテゴリを選択してください' };
  const author = String((params && params.author) || user).trim();
  const dateYmd = String((params && params.date) || '').trim() || Utilities.formatDate(now, 'JST', 'yyyy-MM-dd');
  const issue = String((params && params.issue) || '').trim();
  const id = 'IDEA_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 6);
  const history = [{
    at: Utilities.formatDate(now, 'JST', 'yyyy/MM/dd HH:mm'),
    by: author,
    from: '',
    to: 'idea',
    note: '登録'
  }];
  sheets.board.appendRow([
    id, author, dateYmd, category, content, 'idea', '',
    JSON.stringify([]), JSON.stringify(history), author, now, issue
  ]);
  writeLog(author, 'アイデア登録', category, content.slice(0, 80));
  return { success: true, item: ideaBoard_rowToItem_(sheets.board.getRange(sheets.board.getLastRow(), 1, 1, 12).getValues()[0]) };
}

function ideaBoard_findRow_(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function ideaBoard_setStatus(params) {
  const sheets = ideaBoard_ensureSheets_();
  const id = String((params && params.id) || '').trim();
  const to = String((params && params.status) || '').trim();
  const allowed = { idea: 1, review: 1, running: 1, rejected: 1 };
  if (!id || !allowed[to]) return { success: false, message: '対象または進捗が不正です' };
  const row = ideaBoard_findRow_(sheets.board, id);
  if (row < 0) return { success: false, message: 'アイデアが見つかりません' };
  const vals = sheets.board.getRange(row, 1, 1, 11).getValues()[0];
  const from = String(vals[5] || 'idea');
  const user = String((params && params.userName) || '').trim() || '不明';
  const now = new Date();
  let history = ideaBoard_parseJson_(vals[8], []);
  if (!Array.isArray(history)) history = [];
  if (from !== to) {
    history.push({
      at: Utilities.formatDate(now, 'JST', 'yyyy/MM/dd HH:mm'),
      by: user,
      from: from,
      to: to,
      note: to === 'rejected' ? '廃案' : ''
    });
  }
  const rejectReason = (to === 'rejected')
    ? String((params && params.rejectReason) || vals[6] || '')
    : (to === 'review' || to === 'idea' || to === 'running' ? String(vals[6] || '') : '');
  sheets.board.getRange(row, 6, 1, 6).setValues([[
    to,
    rejectReason,
    JSON.stringify(ideaBoard_parseJson_(vals[7], [])),
    JSON.stringify(history),
    user,
    now
  ]]);
  writeLog(user, 'アイデア進捗', id, from + '→' + to);
  const updated = sheets.board.getRange(row, 1, 1, 11).getValues()[0];
  return { success: true, item: ideaBoard_rowToItem_(updated) };
}

function ideaBoard_addMemo(params) {
  const sheets = ideaBoard_ensureSheets_();
  const id = String((params && params.id) || '').trim();
  const text = String((params && params.text) || '').trim();
  if (!id || !text) return { success: false, message: 'メモを入力してください' };
  const row = ideaBoard_findRow_(sheets.board, id);
  if (row < 0) return { success: false, message: 'アイデアが見つかりません' };
  const vals = sheets.board.getRange(row, 1, 1, 11).getValues()[0];
  let memos = ideaBoard_parseJson_(vals[7], []);
  if (!Array.isArray(memos)) memos = [];
  const user = String((params && params.userName) || '').trim() || '不明';
  const now = new Date();
  memos.push({
    at: Utilities.formatDate(now, 'JST', 'yyyy/MM/dd HH:mm'),
    by: user,
    text: text
  });
  sheets.board.getRange(row, 8, 1, 4).setValues([[JSON.stringify(memos), JSON.stringify(ideaBoard_parseJson_(vals[8], [])), user, now]]);
  writeLog(user, 'アイデアメモ', id, text.slice(0, 80));
  const updated = sheets.board.getRange(row, 1, 1, 11).getValues()[0];
  return { success: true, item: ideaBoard_rowToItem_(updated) };
}

function ideaBoard_addCategory(params) {
  const sheets = ideaBoard_ensureSheets_();
  const name = String((params && params.name) || '').trim();
  if (!name) return { success: false, message: 'カテゴリ名を入力してください' };
  const list = ideaBoard_listCategories_(sheets.cats);
  if (list.indexOf(name) >= 0) return { success: true, categories: list };
  sheets.cats.appendRow([name]);
  writeLog(String((params && params.userName) || ''), 'アイデアカテゴリ追加', name, '');
  return { success: true, categories: ideaBoard_listCategories_(sheets.cats) };
}

// ==========================================
// 🗓️ 日次予定（Googleカレンダー風ブロック）
// ==========================================
function dayPlan_ensureSheet_() {
  const ss = TENANT_SS;
  let sheet = ss.getSheetByName('日次予定');
  const headers = ['ID', 'ユーザーID', 'ユーザー名', '日付', '開始', '終了', '分数', '作業名', 'カテゴリ', '推定分数', '推定根拠', '承認済', '備考', '作成日時', '更新日時', 'スケジュールキー'];
  if (!sheet) {
    sheet = ss.insertSheet('日次予定');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    try { sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e0e0e0'); } catch (e) {}
    return sheet;
  }
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (String(existing[i] || '') !== headers[i]) sheet.getRange(1, i + 1).setValue(headers[i]);
  }
  return sheet;
}

function dayPlan_hmToMins_(hm) {
  const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function dayPlan_minsToHm_(mins) {
  let n = Math.max(0, parseInt(mins, 10) || 0) % (24 * 60);
  return ('0' + Math.floor(n / 60)).slice(-2) + ':' + ('0' + (n % 60)).slice(-2);
}

function dayPlan_rowToItem_(row) {
  return {
    id: String(row[0] || ''),
    userId: String(row[1] || ''),
    userName: String(row[2] || ''),
    date: formatPersonalScheduleDateYmd_(row[3]),
    startTime: String(row[4] || ''),
    endTime: String(row[5] || ''),
    durationMins: parseInt(row[6], 10) || 0,
    workName: String(row[7] || ''),
    category: String(row[8] || ''),
    estimateMins: parseInt(row[9], 10) || 0,
    estimateSource: String(row[10] || ''),
    approved: row[11] === true || String(row[11]) === 'TRUE' || String(row[11]) === 'true',
    note: String(row[12] || ''),
    scheduleKey: String(row[15] || '')
  };
}

/** 作業一覧に載せる「誰が・いつ予定済みか」 */
function collectDayPlanBookings_() {
  const byKey = {};
  const byWorkField = {};
  const byWork = {};
  try {
    const sheet = TENANT_SS.getSheetByName('日次予定');
    if (!sheet || sheet.getLastRow() <= 1) return { byKey: byKey, byWorkField: byWorkField, byWork: byWork };
    const data = sheet.getDataRange().getValues();
    const today = formatPersonalScheduleDateYmd_(new Date());
    for (let i = 1; i < data.length; i++) {
      const item = dayPlan_rowToItem_(data[i]);
      if (!item.workName || !item.date) continue;
      if (today && item.date < today) continue;
      const fieldName = String(item.note || '').split('/')[0].trim();
      const booking = {
        userName: item.userName || '',
        userId: item.userId || '',
        date: item.date,
        startTime: item.startTime || '',
        workName: item.workName,
        fieldName: fieldName
      };
      const push = function (map, k) {
        if (!k) return;
        if (!map[k]) map[k] = [];
        map[k].push(booking);
      };
      push(byKey, item.scheduleKey);
      if (fieldName) push(byWorkField, item.workName + '||' + fieldName);
      push(byWork, item.workName);
    }
  } catch (e) {}
  return { byKey: byKey, byWorkField: byWorkField, byWork: byWork };
}

function attachDayPlansToSchedule_(t, maps) {
  if (!t || !maps) return;
  let list = [];
  if (t.scheduleKey && maps.byKey[t.scheduleKey] && maps.byKey[t.scheduleKey].length) {
    list = maps.byKey[t.scheduleKey];
  } else if (t.workName && t.fieldName && maps.byWorkField[t.workName + '||' + t.fieldName]) {
    list = maps.byWorkField[t.workName + '||' + t.fieldName];
  } else if (t.workName && maps.byWork[t.workName]) {
    list = maps.byWork[t.workName];
  }
  const seen = {};
  t.dayPlans = list.filter(function (p) {
    const k = String(p.userId || p.userName || '') + '|' + String(p.date || '');
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

/** 作業一覧ステータス: pending=未実行 / planned=予定中 / running=実行中 */
function resolveWorkScheduleStatus_(t) {
  if (t && t.isMidWork) {
    return { code: 'running', label: '実行中' };
  }
  if (t && t.dayPlans && t.dayPlans.length > 0) {
    return { code: 'planned', label: '予定中' };
  }
  return { code: 'pending', label: '未実行' };
}

function applyWorkScheduleStatus_(schedules) {
  (schedules || []).forEach(function(t) {
    const st = resolveWorkScheduleStatus_(t);
    t.workStatus = st.code;
    t.workStatusLabel = st.label;
  });
}

function dayPlan_workCategoryMap_() {
  const map = {};
  const sheet = TENANT_SS.getSheetByName('作業マスタ');
  if (!sheet) return map;
  const list = readWorkMasterList_(sheet) || [];
  list.forEach(function (w) {
    if (w && w.name) map[String(w.name).trim()] = String(w.category || '圃場作業').trim() || '圃場作業';
  });
  return map;
}

function estimateWorkDuration(params) {
  const workName = String((params && params.workName) || '').trim();
  let category = String((params && params.category) || '').trim();
  const catMap = dayPlan_workCategoryMap_();
  if (!category && workName && catMap[workName]) category = catMap[workName];
  const sheet = TENANT_SS.getSheetByName('作業記録');
  const result = {
    success: true,
    workName: workName,
    category: category,
    source: 'none',
    avgMins: 0,
    count: 0,
    label: '過去データなし。手入力してください'
  };
  if (!sheet || sheet.getLastRow() <= 1) return result;
  const lastRow = sheet.getLastRow();
  const startRow = Math.max(2, lastRow - 7999);
  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, 10).getValues();
  const exact = [];
  const byCat = [];
  for (let i = 0; i < values.length; i++) {
    const wn = String(values[i][4] || '').trim();
    if (!wn) continue;
    const mins = parseWorkRecordMinutes_(values[i][9], values[i][6], values[i][7], 0);
    if (mins < 5 || mins > 12 * 60) continue;
    if (workName && wn === workName) exact.push(mins);
    const recCat = catMap[wn] || '';
    if (category && recCat === category) byCat.push(mins);
  }
  const avg = function (arr) {
    if (!arr.length) return 0;
    const s = arr.reduce(function (a, b) { return a + b; }, 0);
    return Math.max(15, Math.round(s / arr.length / 5) * 5);
  };
  if (exact.length) {
    result.source = 'work';
    result.count = exact.length;
    result.avgMins = avg(exact);
    result.label = '作業名「' + workName + '」の平均（' + exact.length + '件）';
  } else if (byCat.length) {
    result.source = 'category';
    result.count = byCat.length;
    result.avgMins = avg(byCat);
    result.label = 'カテゴリ「' + category + '」の平均（' + byCat.length + '件）';
  }
  return result;
}

function dayPlan_options(params) {
  const cats = Array.from(new Set((TENANT_SS.getSheetByName('作業カテゴリマスタ')
    ? TENANT_SS.getSheetByName('作業カテゴリマスタ').getDataRange().getValues().slice(1).map(function (r) { return String(r[0] || '').trim(); }).filter(Boolean)
    : []).concat(['圃場作業', '圃場農機作業', '事務作業', '保全・整備'])));
  let works = [];
  const ws = TENANT_SS.getSheetByName('作業マスタ');
  if (ws) works = readWorkMasterList_(ws) || [];
  return {
    success: true,
    categories: cats,
    works: works.map(function (w) { return { name: w.name, category: w.category }; })
  };
}

function dayPlan_list(params) {
  const userId = String((params && params.userId) || '').trim();
  if (!userId) return { success: true, items: [] };
  const fromYmd = String((params && params.fromYmd) || '').trim();
  const toYmd = String((params && params.toYmd) || fromYmd || '').trim();
  const sheet = dayPlan_ensureSheet_();
  const data = sheet.getDataRange().getValues();
  const items = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1] || '') !== userId) continue;
    const item = dayPlan_rowToItem_(data[i]);
    if (fromYmd && item.date < fromYmd) continue;
    if (toYmd && item.date > toYmd) continue;
    items.push(item);
  }
  items.sort(function (a, b) {
    return String(a.date).localeCompare(String(b.date)) || String(a.startTime).localeCompare(String(b.startTime));
  });
  return { success: true, items: items };
}

function dayPlan_syncPersonal_(item) {
  try {
    const key = 'dayplan:' + item.id;
    const start = item.startTime || '';
    const end = item.endTime || '';
    const text = (start && end ? (start + '〜' + end + ' ') : '') + (item.workName || '予定') +
      (item.durationMins ? ('（' + item.durationMins + '分）') : '');
    addPersonalScheduleItem({
      userId: item.userId,
      userName: item.userName,
      category: 'タスク',
      text: text,
      startDate: item.date,
      deadline: item.date,
      scheduleKey: key
    });
  } catch (e) {}
}

function dayPlan_save(params) {
  const userId = String((params && params.userId) || '').trim();
  if (!userId) return { success: false, message: 'ログインが必要です' };
  const dateYmd = formatPersonalScheduleDateYmd_(params && params.date);
  const workName = String((params && params.workName) || '').trim();
  if (!dateYmd) return { success: false, message: '日付が必要です' };
  if (!workName) return { success: false, message: '作業名を入力してください' };
  let startTime = String((params && params.startTime) || '').trim();
  let durationMins = parseInt(params && params.durationMins, 10) || 0;
  let endTime = String((params && params.endTime) || '').trim();
  if (!durationMins && startTime && endTime) {
    durationMins = dayPlan_hmToMins_(endTime) - dayPlan_hmToMins_(startTime);
    if (durationMins <= 0) durationMins += 24 * 60;
  }
  if (!durationMins) durationMins = 30;
  if (startTime && !endTime) endTime = dayPlan_minsToHm_(dayPlan_hmToMins_(startTime) + durationMins);
  const id = 'DP_' + new Date().getTime() + '_' + Math.random().toString(36).slice(2, 6);
  const now = new Date();
  const approved = !!(params && params.approved);
  const item = {
    id: id,
    userId: userId,
    userName: String((params && params.userName) || ''),
    date: dateYmd,
    startTime: startTime,
    endTime: endTime,
    durationMins: durationMins,
    workName: workName,
    category: String((params && params.category) || ''),
    estimateMins: parseInt(params && params.estimateMins, 10) || 0,
    estimateSource: String((params && params.estimateSource) || ''),
    approved: approved,
    note: String((params && params.note) || ''),
    scheduleKey: String((params && params.scheduleKey) || '')
  };
  const sheet = dayPlan_ensureSheet_();
  sheet.appendRow([
    item.id, item.userId, item.userName, item.date, item.startTime, item.endTime, item.durationMins,
    item.workName, item.category, item.estimateMins, item.estimateSource, item.approved, item.note, now, now,
    item.scheduleKey
  ]);
  if (approved) dayPlan_syncPersonal_(item);
  writeLog(item.userName, '日次予定登録', item.date, item.workName + ' ' + item.startTime);
  return { success: true, item: item };
}

function dayPlan_update(params) {
  const id = String((params && params.id) || '').trim();
  if (!id) return { success: false, message: 'IDがありません' };
  const sheet = dayPlan_ensureSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== id) continue;
    const item = dayPlan_rowToItem_(data[i]);
    if (params.startTime !== undefined) item.startTime = String(params.startTime || '');
    if (params.endTime !== undefined) item.endTime = String(params.endTime || '');
    if (params.durationMins !== undefined) item.durationMins = parseInt(params.durationMins, 10) || item.durationMins;
    if (params.workName !== undefined) item.workName = String(params.workName || '');
    if (params.category !== undefined) item.category = String(params.category || '');
    if (params.estimateMins !== undefined) item.estimateMins = parseInt(params.estimateMins, 10) || 0;
    if (params.estimateSource !== undefined) item.estimateSource = String(params.estimateSource || '');
    if (params.approved !== undefined) item.approved = !!params.approved;
    if (params.note !== undefined) item.note = String(params.note || '');
    if (params.date !== undefined) item.date = formatPersonalScheduleDateYmd_(params.date) || item.date;
    if (item.startTime && item.durationMins && !params.endTime) {
      item.endTime = dayPlan_minsToHm_(dayPlan_hmToMins_(item.startTime) + item.durationMins);
    }
    if (item.startTime && item.endTime) {
      let d = dayPlan_hmToMins_(item.endTime) - dayPlan_hmToMins_(item.startTime);
      if (d <= 0) d += 24 * 60;
      item.durationMins = d;
    }
    sheet.getRange(i + 1, 4, 1, 10).setValues([[
      item.date, item.startTime, item.endTime, item.durationMins, item.workName, item.category,
      item.estimateMins, item.estimateSource, item.approved, item.note
    ]]);
    sheet.getRange(i + 1, 15).setValue(new Date());
    if (item.approved) dayPlan_syncPersonal_(item);
    return { success: true, item: item };
  }
  return { success: false, message: '予定が見つかりません' };
}

function dayPlan_delete(params) {
  const id = String((params && params.id) || '').trim();
  if (!id) return { success: false, message: 'IDがありません' };
  const sheet = dayPlan_ensureSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: '予定が見つかりません' };
}