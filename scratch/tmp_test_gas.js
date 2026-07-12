const fetch = require('node-fetch');

const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";

async function testApi() {
    const body = {
        action: 'changePassword',
        spreadsheetId: '1234567890abcdef', // fake ID
        userId: 'test',
        currentPassword: 'old',
        newPassword: 'new'
    };

    try {
        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}

testApi();
