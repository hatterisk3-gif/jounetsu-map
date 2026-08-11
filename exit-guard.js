(function () {
  'use strict';

  const ACTIVE_EDIT_SELECTORS = [
    '#cultivationPlanModal',
    '#varietyRegistrationModal',
    '#croptypeRegistrationModal',
    '#cpCroptypePickModal',
    '#cpPresetSaveModal',
    '#fieldCultivationModeBanner',
    '#fieldMemoOverlay',
    '#adminFieldModal',
    '#waterCadOverlay',
    '#cadOverlay',
    '#cad3dOverlay',
    '#cadEditPolyModal',
    '#masterModal',
    '#feedbackModal',
    '#prodCategoryEditModal',
    '#transplantSettingModal',
    '#sprayRouteModal',
    '#photoEditorModal',
    '[data-exit-guard="true"]'
  ];

  const DIALOG_SELECTORS = [
    '[id$="Modal"]',
    '[id$="Overlay"]',
    '#modal',
    '[role="dialog"]'
  ].join(',');

  const COMMIT_WORDS = /保存|上書き|登録|記録|送信|更新|確定|作成|追加|完了|開始/;

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return element.getClientRects().length > 0;
  }

  function containsEditableWork(element) {
    const editable = element.querySelector(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]'
    );
    if (!editable) return false;

    const actions = Array.from(element.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]'));
    return actions.some(action => COMMIT_WORDS.test(
      String(action.textContent || action.value || action.getAttribute('aria-label') || '').trim()
    ));
  }

  function shouldConfirmAppExit() {
    if (window.appExitGuardActive === true) return true;

    if (ACTIVE_EDIT_SELECTORS.some(selector => {
      const element = document.querySelector(selector);
      return isVisible(element);
    })) {
      return true;
    }

    return Array.from(document.querySelectorAll(DIALOG_SELECTORS))
      .some(element => isVisible(element) && containsEditableWork(element));
  }

  window.shouldConfirmAppExit = shouldConfirmAppExit;
  window.setAppExitGuardActive = function (active) {
    window.appExitGuardActive = !!active;
  };

  window.addEventListener('beforeunload', function (event) {
    if (!shouldConfirmAppExit()) return;
    event.preventDefault();
    event.returnValue = '';
  });
})();
