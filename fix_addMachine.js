const fs = require('fs');
let content = fs.readFileSync('コード.js', 'utf8');

let appendStart = content.indexOf('  sheet.appendRow([');
let appendEnd = content.indexOf('  writeLog(params.userName');

if (appendStart !== -1 && appendEnd !== -1) {
    let oldBlock = content.substring(appendStart, appendEnd);
    let newBlock = "  // A:ID, B:農機名, C:型式, D:作業分類, E:写真, F:写真2, G:看板名, H:看板id, I:空, J:購入年月日, K:登録者, L:部品名, M:現在地名, N:現在地id, O:症状, P:対象機, Q:燃料, R:機械番号\n" +
"  sheet.appendRow([\n" +
"    newId,                     // A(0): id\n" +
"    params.name,               // B(1): name\n" +
"    params.model || \"\",        // C(2): model\n" +
"    params.workCategory || \"\", // D(3): workCategory\n" +
"    photo1Url,                 // E(4): photo1Url\n" +
"    photo2Url,                 // F(5): photo2Url\n" +
"    params.signName,           // G(6): signName\n" +
"    params.signId,             // H(7): signId\n" +
"    \"\",                        // I(8): category\n" +
"    params.purchaseDate || \"\", // J(9): purchaseDate\n" +
"    params.userName,           // K(10): userName\n" +
"    params.parts || \"\",        // L(11): parts\n" +
"    params.signName,           // M(12): currentLocName (初期値)\n" +
"    params.signId,             // N(13): currentLocId (初期値)\n" +
"    \"\",                        // O(14): symptoms\n" +
"    \"\",                        // P(15): targetMachineIds\n" +
"    \"\",                        // Q(16): fuel\n" +
"    params.machineNumber || \"\" // R(17): machineNumber\n" +
"  ]);\n\n";

    content = content.replace(oldBlock, newBlock);

    let returnStart = content.indexOf('  return {\n     id: newId, \n     name: params.name, \n     workCategory');
    if (returnStart !== -1) {
        content = content.replace('  return {\n     id: newId, \n     name: params.name, \n     workCategory', 
        '  return {\n     id: newId, \n     name: params.name, \n     machineNumber: params.machineNumber,\n     workCategory');
        console.log('Return replaced');
    }
    fs.writeFileSync('コード.js', content, 'utf8');
    console.log('Fixed コード.js appendRow');
} else {
    console.log('Could not find block');
}
