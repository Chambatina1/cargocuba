// Test e2e del tracking-server: un chofer emite GPS y un watcher lo recibe.
import { io } from 'socket.io-client';

async function main() {
  // 1) watcher se conecta y escucha
  const watcher = io('http://localhost:3011', { path: '/tracking', transports: ['websocket'] });
  let received = 0;
  let snapshotOk = false;
  watcher.on('drivers-snapshot', (p: any) => {
    snapshotOk = true;
    console.log('[watcher] snapshot:', JSON.stringify(p).slice(0, 80));
  });
  watcher.on('driver-moved', (d: any) => {
    received++;
    console.log('[watcher] driver-moved:', d.phone, d.lat, d.lng);
  });
  watcher.on('connect', () => {
    console.log('[watcher] conectado', watcher.id);
    watcher.emit('join-map', {});
  });

  await new Promise(r => setTimeout(r, 400));

  // 2) chofer emite GPS
  const driver = io('http://localhost:3011', { path: '/tracking', transports: ['websocket'] });
  driver.on('connect', () => {
    console.log('[driver] conectado', driver.id);
    driver.emit('driver-location', { phone: '+13050001', lat: 28.6, lng: -81.3, speed: 35, heading: 90 });
    driver.emit('driver-location', { phone: '+13050001', lat: 28.61, lng: -81.31, speed: 40, heading: 95 });
  });

  await new Promise(r => setTimeout(r, 600));

  console.log('\n=== RESULTADO ===');
  console.log('snapshot recibido:', snapshotOk);
  console.log('driver-moved recibidos:', received);
  watcher.close();
  driver.close();
  process.exit(received >= 1 && snapshotOk ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
