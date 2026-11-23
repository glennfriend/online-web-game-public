# online-web-game-public

可離線玩的網頁小遊戲,純 HTML + JavaScript,不需要安裝或建置。

## 遊戲

**[▶ 開始玩](https://glennfriend.github.io/online-web-game-public/)**

- [數迴 Slitherlink](https://glennfriend.github.io/online-web-game-public/app/slitherlink/) — 3×3 ~ 9×9,簡單 / 中等 / 困難,每題唯一解。
- [造橋 Hashiwokakero](https://glennfriend.github.io/online-web-game-public/app/hashi/) — 5×5 ~ 9×9,簡單 / 中等 / 困難,每題唯一解。
- [猜數字 1A2B](https://glennfriend.github.io/online-web-game-public/app/1a2b/) — 3 ~ 5 位不重複數字。
- [德州撲克 Texas Hold'em](https://glennfriend.github.io/online-web-game-public/app/holdem/) — 對戰 4 個電腦對手,純遊戲籌碼。
- [兩人軍棋](https://glennfriend.github.io/online-web-game-public/app/junqi/) — 陸軍棋布陣暗棋,和電腦對戰。

## 怎麼玩

- 線上:<https://glennfriend.github.io/online-web-game-public/>(點上面的遊戲名稱也會直接開啟)。
- 離線:下載後直接用瀏覽器開 `app/index.html`。

## 軍棋的棋子樣式

每種樣式是一張合成圖(12 欄 × 2 列),放在 `app/junqi/themes/`,遊戲用 CSS 取其中一格。新增樣式:

1. 準備一張透明背景、12 個圖示橫排的 PNG,順序為:司令 軍長 師長 旅長 團長 營長 連長 排長 工兵 炸彈 地雷 軍旗。
2. 執行 `node tools/make-junqi-sprite.js 來源.png app/junqi/themes/名稱.png`(彩色圖示加 `--color`)。
3. 在 `app/junqi/index.html` 的 `THEMES` 加一行。

在遊戲中按鍵盤 `o` 可以切換樣式。Node 只在製作合成圖時需要。
