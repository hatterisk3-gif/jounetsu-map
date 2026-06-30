const GAS_URL = "https://script.google.com/macros/s/AKfycbw3yW9QsJMR24PP0k3rASCIpxJCTRFfOIDS3JSQ1_o38zF9DJ2mNvDmwOWpyw6-0K_8/exec";
fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'getDebugInfo' }),
    headers: { 'Content-Type': 'text/plain' }
}).then(res => res.json()).then(data => {
    console.log("Sheet names:", data.data);
}).catch(console.error);
