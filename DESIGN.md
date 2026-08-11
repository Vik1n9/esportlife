# DESIGN.md

## Overview
電競人生是單欄、行動優先的 LoL 生涯模擬遊戲介面。視覺語彙取自
tftactics.gg（team-builder 頁計算樣式），目標是「放在該站其中一頁也不突兀」：
全深色 navy 色階、容器髮絲邊框、小控制純填色、平面無陰影。

## Colors
色階（與站方計算樣式一致）：
- `--bg` #0d202b 頁面底／toolbar／行動列／內嵌塊
- `--surface` #102531 卡片／面板／nav 列
- `--raise` #123040 按鈕／輸入／狀態格（hover `--raise-h` #1b455c）
- `--line` #17313a 容器邊框與分隔線（僅容器，不用於小控制）

文字：
- `--ink` rgba(255,255,255,.92)；`--muted` #99b1b8；`--faint` #7c8f92

功能色：
- 動作 `--blue` #227aad（hover #4080b0）：主按鈕、選中、標題底線、focus 環
- 階段底線 `--orange` #d47559：目前階段 nav 底線（同站方 active nav）
- 遊戲狀態 `--gold` #b89d27（文字用 `--gold-text` #d9c05a）：骰子、能力條、品牌資產
- 標題點綴 `--teal` #adf4ed：hero 強調字、隊伍名
- 語意 good #b8edb3／bad #ff7f7f／epic #c45dd6／link #579dd4／steel #6287a7

規則：髮絲線只畫容器與分隔；小控制無邊框靠填色；所有正文對比 ≥ 4.5:1。

## Typography
單一無襯線：`--ui` = Inter＋Noto Sans TC；數值 `--mono` = 系統等寬。
字重 400–700（正文 400、nav/標籤 400–500、標題 600、數字 700）。
- nav 13–15px；卡片標題 12px/600；h1 26px/600；letter-spacing ≈ .015em。

## Components
- toolbar：bg 底＋底髮絲線；品牌＝terracotta 方塊＋白 600 字標；右側 raise 按鈕 3px。
- nav 列：surface 底＋髮絲線；項目 muted；active 白字＋3px #d47559 底線。
- 卡片：surface 底、1px #17313a、radius 4px；標題前 7px 語意圓點。
- 按鈕：無邊框、radius 3px；main＝#227aad 白字 600；ghost＝無底置中。
- 輸入：bg 底、無邊框、radius 3px；focus＝2px 藍環。
- seg 選中＝#227aad 白字；骰子 active＝金底深字；加點＝藍、減點＝raise。
- 能力列：surface 容器；軌道 bg、填充金、潛力刻度 2px 白。
- 狀態格：raise 底 3px，等寬數字 20px/700。
- 標籤：raise 底 3px；epic 紫字深紫底。
- 底部抽屜：surface、4px 上圓角、髮絲線分隔；h3 帶 2px 藍底線。

## Layout
- 單欄 max-width 600px 置中；頂欄與行動列 sticky，皆以髮絲線與內容分層。
- 圓角尺度：控制 3px、容器 4px。無陰影、無漸層、無光暈。

## Motion
- 僅狀態動效：卡片 pop 200ms、抽屜 slideup 200ms、bar 寬 200ms，ease-out；
  `prefers-reduced-motion` 全數關閉。
