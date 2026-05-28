const http = require('http');
const qrcode = require('qrcode');

let currentQR = null;
let server = null;

function startQRServer(port = 3000) {
  server = http.createServer(async (req, res) => {
    if (req.url === '/qr' && currentQR) {
      const qrImage = await qrcode.toDataURL(currentQR);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>ChapeauNoir QR</title>
  <meta http-equiv="refresh" content="10">
  <style>
    body{background:#000;color:#00ff88;font-family:Arial;text-align:center;padding:40px}
    img{border:3px solid #00ff88;border-radius:12px}
  </style>
</head>
<body>
  <h2>🎩 ChapeauNoir — Scanner le QR Code</h2>
  <p>Ouvre WhatsApp → Appareils connectés → Scanner</p>
  <br/>
  <img src="${qrImage}" width="280"/>
  <br/><br/>
  <p>⏱️ Rafraîchissement auto toutes les 10s</p>
</body>
</html>`);
    } else if (req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'online', bot: 'ChapeauNoir' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="background:#000;color:#00ff88;text-align:center;padding:40px;font-family:Arial">
        <h1>🎩 ChapeauNoir Bot — En ligne</h1>
        <a href="/qr" style="color:#00ff88">→ Scanner QR Code</a>
      </body></html>`);
    }
  });

  server.listen(port, () => {
    console.log(`\n🌐 QR disponible sur : https://TON-APP.onrender.com/qr\n`);
  });
}

function setQR(qr) { currentQR = qr; }
function stopServer() { if (server) server.close(); }

module.exports = { startQRServer, setQR, stopServer };
