const axios = require('axios');

// Configurazione Dinamica: Usa l'URL di Vercel se disponibile, altrimenti localhost
const BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : 'http://localhost:3000';

const API_URL = `${BASE_URL}/admin/bulk`;

const MANGA_URLS = [
  'https://hentaifox.com/g/123456/', 
  'https://hentaifox.com/g/654321/',
  'https://hentaifox.com/g/112233/',
];

async function runBulkTest() {
  console.log('🚀 Avvio Test Importazione Massiva...');
  console.log(`🌍 Ambiente: ${process.env.VERCEL_URL ? 'PRODUZIONE (Vercel)' : 'LOCALE (PC)'}`);
  console.log(`📦 Invio di ${MANGA_URLS.length} URL a ${API_URL}`);

  try {
    const response = await axios.post(
      API_URL,
      {
        urls: MANGA_URLS,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('✅ Risultato Server:');
    console.dir(response.data, { depth: null });
  } catch (error) {
    console.error('❌ Errore durante il test:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

runBulkTest();
