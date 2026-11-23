#!/usr/bin/env node
/*
 * 把一張「12 個圖示橫排」的 PNG 做成軍棋用的合成圖(sprite)。
 * 只在開發時用,遊戲本身不需要 Node。沒有任何相依套件。
 *
 * 用法:
 *   node tools/make-junqi-sprite.js <來源.png> <輸出.png> [--color] [--cell=96]
 *
 * 來源圖:透明背景,12 個圖示由左到右排成一列,彼此之間要有空隙。順序固定為
 *   司令 軍長 師長 旅長 團長 營長 連長 排長 工兵 炸彈 地雷 軍旗
 *
 * 輸出圖:12 欄 × 2 列,每格正方形(預設 96px)。
 *   第 1 列 = 自己的棋(淺色棋面)用的圖示,保留來源的顏色
 *   第 2 列 = 對方的棋(深色棋面)用的圖示
 *       預設:同樣的形狀改成白色(適合單色圖示)
 *       --color:直接複製第 1 列(適合彩色圖示)
 */
'use strict';
var fs = require('fs'), zlib = require('zlib');

var args = process.argv.slice(2);
var files = args.filter(function (a) { return a.slice(0, 2) !== '--'; });
var COLOR = args.indexOf('--color') >= 0;
var cellArg = args.filter(function (a) { return a.indexOf('--cell=') === 0; })[0];
var CELL = cellArg ? +cellArg.split('=')[1] : 96;
if (files.length !== 2) {
  console.error('用法: node tools/make-junqi-sprite.js <來源.png> <輸出.png> [--color] [--cell=96]');
  process.exit(1);
}

/* ---------- PNG 讀寫(只支援 8-bit RGBA、非交錯) ---------- */
function decode(buf) {
  var p = 8, W, H, idat = [];
  while (p < buf.length) {
    var len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      W = data.readUInt32BE(0); H = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('只支援 8-bit RGBA、非交錯的 PNG(請存成有透明度的 PNG-24/32)');
    }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  var raw = zlib.inflateSync(Buffer.concat(idat)), stride = W * 4, px = Buffer.alloc(W * H * 4);
  for (var y = 0; y < H; y++) {
    var f = raw[y * (stride + 1)], row = y * (stride + 1) + 1, o = y * stride;
    for (var x = 0; x < stride; x++) {
      var a = x >= 4 ? px[o + x - 4] : 0, b = y ? px[o + x - stride] : 0, c = (x >= 4 && y) ? px[o + x - stride - 4] : 0;
      var v = raw[row + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { var pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      px[o + x] = v & 255;
    }
  }
  return { W: W, H: H, px: px };
}
var crcTable = [];
for (var n = 0; n < 256; n++) { var cc = n; for (var k = 0; k < 8; k++) cc = cc & 1 ? 0xEDB88320 ^ (cc >>> 1) : cc >>> 1; crcTable.push(cc); }
function crc(b) { var c = -1; for (var i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  var b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8);
  b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
function encode(W, H, px) {
  var raw = Buffer.alloc((W * 4 + 1) * H);
  for (var y = 0; y < H; y++) px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  var ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- 找出 12 個圖示 ---------- */
var img = decode(fs.readFileSync(files[0])), W = img.W, H = img.H, px = img.px, i, x, y;
// 清掉幾乎透明的雜點,並把接近不透明的拉到完全不透明
for (i = 3; i < px.length; i += 4) { var al = px[i]; px[i] = al < 16 ? 0 : Math.min(255, Math.round((al - 12) * 255 / 228)); }
function A(xx, yy) { return px[(yy * W + xx) * 4 + 3]; }
var T = 40, runs = [], start = -1;
for (x = 0; x <= W; x++) {
  var count = 0;
  if (x < W) for (y = 0; y < H; y++) if (A(x, y) > T) count++;
  if (count > 1 && start < 0) start = x;
  if (count <= 1 && start >= 0) { if (x - start > 20) runs.push([start, x - 1]); start = -1; }
}
if (runs.length !== 12) {
  console.error('找到 ' + runs.length + ' 個圖示,需要剛好 12 個。請確認背景透明、圖示之間有空隙。');
  process.exit(1);
}
var boxes = runs.map(function (r) {
  var y0 = H, y1 = 0;
  for (var yy = 0; yy < H; yy++) for (var xx = r[0]; xx <= r[1]; xx++) if (A(xx, yy) > T) { if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  return { x0: r[0], x1: r[1], y0: y0, y1: y1, w: r[1] - r[0] + 1, h: y1 - y0 + 1 };
});
// 所有圖示用同一個縮放比例,保持彼此的大小關係
var side = 8 + boxes.reduce(function (m, b) { return Math.max(m, b.w, b.h); }, 0);

/* ---------- 輸出 12 × 2 的合成圖 ---------- */
var OW = CELL * 12, OH = CELL * 2, out = Buffer.alloc(OW * OH * 4), sc = side / CELL;
boxes.forEach(function (b, col) {
  var ox = b.x0 - Math.floor((side - b.w) / 2), oy = b.y0 - Math.floor((side - b.h) / 2);
  for (var Y = 0; Y < CELL; Y++) for (var X = 0; X < CELL; X++) {
    var r = 0, g = 0, bl = 0, a = 0, cnt = 0;
    var sy1 = Math.max(Math.floor(Y * sc) + 1, Math.floor((Y + 1) * sc)), sx1 = Math.max(Math.floor(X * sc) + 1, Math.floor((X + 1) * sc));
    for (var sy = Math.floor(Y * sc); sy < sy1; sy++) for (var sx = Math.floor(X * sc); sx < sx1; sx++) {
      cnt++;
      var xx = ox + sx, yy = oy + sy;
      if (xx < b.x0 || xx > b.x1 || yy < 0 || yy >= H) continue;
      var q = (yy * W + xx) * 4, al = px[q + 3];
      r += px[q] * al; g += px[q + 1] * al; bl += px[q + 2] * al; a += al;
    }
    var alpha = Math.round(a / cnt);
    var top = (Y * OW + col * CELL + X) * 4, bottom = ((Y + CELL) * OW + col * CELL + X) * 4;
    if (a > 0) { out[top] = Math.round(r / a); out[top + 1] = Math.round(g / a); out[top + 2] = Math.round(bl / a); }
    out[top + 3] = alpha;
    if (COLOR) { out[bottom] = out[top]; out[bottom + 1] = out[top + 1]; out[bottom + 2] = out[top + 2]; }
    else { out[bottom] = out[bottom + 1] = out[bottom + 2] = 255; }
    out[bottom + 3] = alpha;
  }
});
fs.writeFileSync(files[1], encode(OW, OH, out));
console.log('完成:' + files[1] + '  ' + OW + '×' + OH + '  ' + fs.statSync(files[1]).size + ' bytes');
