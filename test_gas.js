const url = 'https://script.google.com/macros/s/AKfycbw3yW9QsJMR24PP0k3rASCIpxJCTRFfOIDS3JSQ1_o38zF9DJ2mNvDmwOWpyw6-0K_8/exec';

async function run() {
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ action: 'getCultivationMaster' })
    });
    // GASはリダイレクトする可能性があるので、テキストとして取得
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log('JSON SUCCESS:', JSON.stringify(json, null, 2));
    } catch(e) {
      console.log('NOT JSON (probably HTML or Error):', text.substring(0, 500));
    }
  } catch(e) {
    console.error('FETCH ERROR:', e);
  }
}
run();
