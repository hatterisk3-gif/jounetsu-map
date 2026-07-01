const fs = require('fs');

let js = fs.readFileSync('schedule.js', 'utf8');

const regex2 = /populateSelect\('cpArea', cpMasterData\.areas, \[5, 10, 15, 20, 50\]\);/;
const new2 = `populateSelect('cpArea', cpMasterData.areas, [5, 10, 15, 20, 50]);
            populateSelect('cpYieldPerPlant', cpMasterData.yieldPerSeedling || [], [1]);
            populateSelect('cpItemsPerPack', cpMasterData.itemsPerPack || [], [1]);`;

js = js.replace(regex2, new2);

fs.writeFileSync('schedule.js', js, 'utf8');
console.log('schedule.js fetchCultivationMaster patched');
