// Gera um vídeo .y4m com um QR Code, usado como "câmera falsa" no Chrome
import fs from 'node:fs';
import { createRequire } from 'node:module';
const QR = createRequire(import.meta.url)('qrcode');
const [texto, saida] = process.argv.slice(2);
const W = 640, H = 480, ESC = 8, ZONA = 4;
const { size, data } = QR.create(texto, { errorCorrectionLevel: 'M' }).modules;
const lado = (size + ZONA * 2) * ESC, x0 = (W - lado) / 2 | 0, y0 = (H - lado) / 2 | 0;
const Y = Buffer.alloc(W * H, 200);                 // fundo cinza claro
for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) {
  const mx = Math.floor(x / ESC) - ZONA, my = Math.floor(y / ESC) - ZONA;
  const preto = mx >= 0 && my >= 0 && mx < size && my < size && data[my * size + mx];
  Y[(y0 + y) * W + x0 + x] = preto ? 16 : 235;
}
const UV = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
const quadros = [Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`)];
for (let i = 0; i < 15; i++) quadros.push(Buffer.from('FRAME\n'), Y, UV);
fs.writeFileSync(saida, Buffer.concat(quadros));
console.log('QR', size + 'x' + size, '→', saida);
