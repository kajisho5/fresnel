# fresnel — 詳細設計書 v0.2

> 状態：**承認済み（2026-10-17）**。v0.2 で MCP サーバー（§16）を追加し、実ファイルで判明したスキーマ（§2.1）と描画方式（§7）を反映した。
> 表記ルール：**[事実]** 一次情報で確認済み / **[推測]** 根拠はあるが未検証 / **[不明]** 確認できていない

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| 名称 | **fresnel** |
| 一言 | Open-source Liquid Glass icon composer |
| 目的 | Apple Icon Composer 相当の「レイヤー型 Liquid Glass アイコン」を編集・プレビュー・書き出しできる OSS アプリ |
| 差別化 | ① **Mac 以外（Windows / Linux / ブラウザ）でも編集できる** ② GUI 編集＋リアルタイム近似プレビュー ③ `.icon` と従来形式（.icns / appiconset / PNG）を 1 本で書き出し ④ CLI 同梱で CI から使える ⑤ **MCP サーバー同梱**：Claude などの AI エージェントがアイコンを作成・編集・検証・書き出しできる |
| ライセンス | MIT |
| リポ | `kajisho5/fresnel` |

### 1.1 既存 OSS との位置付け

| 既存 | 種別 | fresnel との関係 |
|---|---|---|
| digitalby/glassmith | CLI（Python） | `.icon` 生成・actool 検証の先行例。**GUI は無い** |
| rozd/icon-kit | `.icon` 解析 | スキーマの参考元 |
| peterpoliwoda/icon-composer-template | Swift モデル＋属性リファレンス | スキーマの参考元 |
| kylebshr/decant | コンパイル済み → `.icon` 逆変換 | 取り込み機能の参考 |

→ 空いているのは「**クロスプラットフォームで動く GUI エディタ＋ライブプレビュー**」。fresnel はここを狙う。

---

## 2. 前提となる事実（一次情報）

出典：Apple HIG “App icons”（https://developer.apple.com/design/human-interface-guidelines/app-icons 、2026-06-08 改訂）

- **[事実]** iOS / iPadOS / macOS / watchOS のアイコンは「背景レイヤー＋1 枚以上の前景レイヤー」。スペキュラ、屈折、半透明などの Liquid Glass 属性がシステム側で付与される。
- **[事実]** レイアウトサイズ：iOS / iPadOS / macOS は **1024×1024 px**（角丸矩形にマスク）、watchOS は **1088×1088 px**（円形マスク）、visionOS は 1024×1024（円形・3D）、tvOS は 800×480（パララックス）。
- **[事実]** iOS / iPadOS / macOS の外観は **Default / Dark / Clear light / Clear dark / Tinted light / Tinted dark** の 6 種類。用意しなかった外観はシステムが自動生成する。
- **[事実]** レイヤーはマスク前の正方形で渡す（角丸を焼き込むとスペキュラが崩れる）。ベクターは SVG / PDF、メッシュグラデーションやラスターは PNG を推奨。背景は単色かグラデーションを推奨。
- **[事実]** グループ単位でスペキュラ、屈折、半透明を設定できる。
- **[事実]** 色空間：sRGB / Gray Gamma 2.2 / Display P3。

`.icon` の形式（**Apple の公式仕様は未公開**。以下は OSS による解析結果）

- **[事実（解析ベース）]** `.icon` はディレクトリで、`icon.json` と `Assets/`（SVG / PNG）を含む。出典：glassmith README、schema/icon-json.md
- **[事実（解析ベース）]** キーは kebab-case。主なキーは `groups[]`、`fill`、`fill-specializations`、`supported-platforms`。group には `layers`、`shadow`、`translucency`、`blur-material`、`opacity`、`lighting`、`specular`、`blend-mode`。layer には `image-name`、`fill`、`opacity`、`glass`、`position`。外観ごとの上書きは `*-specializations`（`appearance`: light/dark/tinted、`idiom`: square/macOS/iOS/watchOS/visionOS）。
- **[推測]** Xcode のバージョンアップでスキーマが変わる可能性がある → スキーマにバージョンを持たせ、未知のキーは保持したまま書き戻す（§6.4）。
### 2.1 実ファイルで確認したスキーマ（v0.2 追記）

出典：peterpoliwoda/icon-composer-template の `Tests/IconComposerModelTests/Fixtures/sample-0{1,2,3}.json`（Icon Composer が出力した icon.json）

- **[事実]** 値は「素のキー（`shadow`）」と「`<key>-specializations` 配列」のどちらでも書かれる。配列の中の `appearance` なしの要素がベース値になる。
- **[事実]** 実ファイルに出てくるキー：`fill` の形として `linear-gradient`（2 色の配列＋`orientation.start/stop`）と `none`、group の `blur`、`refraction`、shadow の `kind` = `layer-color`（ケバブケース）。glassmith の資料にある `layerColor` は誤り。
- **[事実]** 値 `null` が明示的に書かれることがある（`blur-material: null`）。キーを省略した場合と区別して保持する。
- **[事実]** `extended-gray:1.0,1.0` のように、2 成分の色はグレースケール。
- **[推測]** `groups` と `layers` の配列は**先頭が最前面**。根拠：decant の実装では「.icon lists them front-to-back」としている。glassmith の資料とは矛盾するため、定数 1 か所で切り替えられるようにしておく。
- **[推測]** `translation-in-points` はキャンバス中心からのオフセットで、**y は下向きが正**。キャンバスは 1024pt（decant の実装に準拠）。画像は「取り込んだときのサイズ × scale」で中央に配置する。
- **[推測]** `linear-gradient` の `orientation` はレイヤーのバウンディングボックスを基準にした単位座標（範囲外の値もとる）。省略時は上から下。

- **[事実]** `.icon` → `Assets.car` のコンパイルは Apple の `actool`（Xcode 26 以降）が必要。actool はプロプライエタリで、Mac でしか動かない（出典：wailsapp/wails #4909、glassmith README）。

---

## 3. 要件定義

### 3.1 機能要件（MVP = v0.1）

| ID | 機能 | 詳細 |
|---|---|---|
| F-01 | ドキュメント | 新規作成、`.icon` の読み込みと保存、最近使ったファイル、自動保存（30 秒ごとに復元用スナップショットを取る） |
| F-02 | レイヤー取り込み | SVG / PNG を D&D、またはファイル選択で取り込む。取り込み先はグループ内の新規レイヤー。1024 を超える画像は警告 |
| F-03 | グループ / レイヤー構造 | 追加、削除、複製、並べ替え（D&D）、グループ化と解除、表示 / 非表示、名前の変更。**グループは最大 4**（[推測] Icon Composer の UI 上の上限に合わせる。実装前に要検証） |
| F-04 | 背景 | `fill`：automatic / system-light / system-dark / solid / automatic-gradient。外観ごとの上書き |
| F-05 | グループ属性 | Liquid Glass ON/OFF、specular、translucency（enabled / value）、blur-material、shadow（none / neutral / layerColor、opacity）、opacity、blend-mode、lighting（combined / individual） |
| F-06 | レイヤー属性 | fill（色の置換）、opacity、blend-mode（18 種類）、glass、position（scale / translation-in-points）、hidden |
| F-07 | 外観別の上書き | インスペクタの各値に「すべての外観 / 現在の外観だけ」の切替。上書き済みの値にはマーカーを付ける |
| F-08 | ライブプレビュー | WebGL2 で近似描画。6 外観の切替、ライト角度のドラッグ、背景（壁紙）切替、マスク形状（squircle / circle）切替 |
| F-09 | 比較ビュー | 6 外観 × 主要サイズ（1024 / 128 / 64 / 32 / 16）をグリッド表示。小サイズでの判読性チェック |
| F-10 | 書き出し | `.icon` バンドル / `.icns`（macOS 従来）/ `AppIcon.appiconset` / PNG 一式 / プレビュー画像（6 外観） |
| F-11 | 検証 | 自前の静的チェック（スキーマ、正方形、透明度、角丸の焼き込み疑い、極細線）＋ Mac 上では `xcrun actool` による検証（任意） |
| F-12 | 取り消し | Undo / Redo（無制限、ドキュメント単位） |
| F-13 | CLI | `fresnel build spec.json`、`fresnel validate x.icon`、`fresnel render x.icon --appearance dark` |
| F-14 | i18n | 英語（デフォルト）と日本語 |
| F-15 | **MCP サーバー** | stdio で動く `fresnel-mcp`。作成、検査、レイヤー追加、属性変更、検証、レンダリング（PNG を画像として返す）、書き出し。詳細は §16 |

### 3.2 対象外（v0.1 ではやらない）

- tvOS（パララックス）と visionOS（3D）の編集 → v0.3 以降
- ベクター描画ツール（ペンツールなど）。レイヤーの作成は Figma / Illustrator などで行う前提
- Apple の描画結果との完全一致（原理的に不可。§7 参照）
- `Assets.car` の Mac 以外での生成（actool が必要なため不可）

### 3.3 非機能要件

| 項目 | 目標 |
|---|---|
| 対応 OS | macOS 13+ / Windows 10+ / Linux（x64）/ Web（Chromium・Safari 17+） |
| 描画性能 | 1024² プレビューで 60fps（M1 / Intel Iris Xe 程度） |
| 起動 | コールドスタート 1.5 秒以内（デスクトップ版） |
| 配布サイズ | 15 MB 以下（Tauri を採用する理由） |
| オフライン | 完全オフラインで動作（外部通信なし。テレメトリなし） |
| アクセシビリティ | キーボードだけで全操作可能、VoiceOver / NVDA のラベル付き、WCAG 2.1 AA のコントラスト |
| セキュリティ | SVG を取り込むときにサニタイズ（`<script>`、外部参照、`on*` 属性、`<foreignObject>` を除去）。Tauri の CSP と fs スコープを最小にする |

---

## 4. 技術スタック

| 層 | 採用 | 理由 |
|---|---|---|
| UI | **React 19 + TypeScript 5（strict）** | 方針（React ベース）。コンポーネントを分けやすい |
| スタイル | **Tailwind CSS v4** ＋ CSS 変数のトークン（HIG.md §2） | トークン駆動でライト / ダークを切り替える |
| ビルド | Vite | 速い。Tauri と Web で同じ設定を使える |
| デスクトップ | **Tauri v2**（Rust） | Electron よりはるかに小さい。macOS / Windows / Linux のネイティブメニューとファイルダイアログ |
| 状態管理 | **Zustand ＋ Immer ＋ zundo**（Undo/Redo） | ドキュメントの木構造をイミュータブルに更新し、履歴を自動で取る |
| スキーマ | **Zod** | `icon.json` の検証。型を生成し、未知キーは passthrough で保持 |
| 描画 | **SVG 合成エンジン**（`@fresnel/render`）。ブラウザは `<img>` から Canvas、Node は `@resvg/resvg-js` でラスタライズ | UI・CLI・MCP で同じ見た目を決定的に出せる（§7）。WebGL2 の屈折パスは v0.3 で追加 |
| SVG 処理 | DOMPurify（サニタイズ）＋ resvg-wasm（ラスタライズ） | ブラウザ間の差をなくし、書き出しの結果を決定的にする |
| 書き出し | TS 実装（`.icns` エンコーダを自作、zip は fflate）を全環境で共有。Tauri の Rust 側はファイル I/O とダイアログだけを担当 | ロジックを 1 か所にまとめる |
| MCP | `@modelcontextprotocol/sdk`（stdio トランスポート） | 公式 SDK |
| UI 部品 | ネイティブ要素（input range / checkbox / select）＋ ARIA。v0.2 で Radix から変更 | 依存を減らし、OS 標準のアクセシビリティをそのまま使う |
| アイコン | Lucide（ISC ライセンス） | SF Symbols は再配布できないため使わない |
| テスト | Vitest（ユニット）、Playwright（E2E・スクショ差分）、cargo test | |
| CI / CD | GitHub Actions：lint / test / ビルド（mac / win / linux）、Pages に Web 版をデプロイ | Mac 署名と公証は `kajisho5/runway` の共通ワークフローに乗せる |

> バージョンは実装開始時に公式の最新を確認して固定する（現時点では未確認）。

---

## 5. 画面構成

```
┌──────────────────────────────────────────────────────────────┐
│ Toolbar: [◧] Sample.icon  ▸  [Edit|Compare]  [Appearance ▾] [Export] │
├────────────┬──────────────────────────────────┬──────────────┤
│ Sidebar    │ Canvas                           │ Inspector    │
│ (260px)    │  ・プレビュー（中央）              │ (300px)      │
│ Document   │  ・外観セグメント（下部フロート）   │ [Group|Layer]│
│  ├ Fill    │  ・ライト角度ハンドル              │  Liquid Glass│
│  ├ Group 1 │  ・ズーム / グリッド / マスク切替   │  Shadow      │
│  │ ├ Layer │                                  │  Fill / Blend│
│  │ └ Layer │                                  │  Position    │
│  └ Group 2 │                                  │              │
├────────────┴──────────────────────────────────┴──────────────┤
│ Status: 1024×1024 · Display P3 · ✓ 0 issues · actool: n/a     │
└──────────────────────────────────────────────────────────────┘
```

| 画面 / シート | 内容 | デザイン |
|---|---|---|
| S-01 エディタ（Edit モード） | 3 ペイン構成。メイン作業画面 | `design/01-editor.svg` |
| S-02 比較（Compare モード） | 6 外観 × サイズのグリッド、背景の切替 | `design/02-compare.svg` |
| S-03 書き出しシート | 形式の選択、対象プラットフォーム、検証結果、保存先 | `design/03-export.svg` |
| S-04 ウェルカム | 新規作成 / 開く / 最近使ったファイル / サンプル（v0.1 は簡易版） | HIG.md のルールで実装（SVG は省略） |
| S-05 環境設定 | 言語、外観、自動保存、actool のパス | HIG.md のルールで実装 |

ウィンドウ：最小 1024×680、既定 1440×900。1180px 未満ではインスペクタをオーバーレイ表示にする。

---

## 6. データモデル

### 6.1 内部モデル（TypeScript）

実ファイルでは、どの属性も「素のキー」と「specializations」の両方の形をとりうる（§2.1）。そこで**属性を汎用の `Prop<T>` で保持**し、元の書式を覚えておいて同じ形で書き戻す。

```ts
type AppearanceKey = 'light' | 'dark' | 'tinted';
type Idiom = 'square' | 'macOS' | 'iOS' | 'watchOS' | 'visionOS';

interface Spec<T> { appearance?: AppearanceKey; idiom?: Idiom; value: T; extra?: Record<string, unknown> }
/** form: 元の書式。'plain' = "key": v / 'specs' = "key-specializations": [...] */
interface Prop<T> { form: 'plain' | 'specs'; base?: T; hasBase: boolean; specs: Spec<T>[] }
// 解決順：appearance+idiom 完全一致 > appearance のみ > idiom のみ > base > 既定値

interface IconDocument {
  props: Record<string, Prop<unknown>>;   // fill, color-space-for-untagged-svg-colors, supported-platforms ...
  groups: Group[];                        // 配列順 = icon.json と同じ（先頭が最前面）
  assets: Map<string, Asset>;             // key = image-name
  extra: Record<string, unknown>;         // 未知キー（そのまま往復）
  keyOrder: string[];                     // 書き戻し時のキー順
}
interface Group { id: string; props: Record<string, Prop<unknown>>; layers: Layer[]; extra: Record<string, unknown>; keyOrder: string[] }
interface Layer { id: string; props: Record<string, Prop<unknown>>; extra: Record<string, unknown>; keyOrder: string[] }

// 既知の値型（Zod で検証）
type Fill = 'automatic' | 'system-light' | 'system-dark' | 'none'
  | { solid: ColorString } | { 'automatic-gradient': ColorString }
  | { 'linear-gradient': [ColorString, ColorString]; orientation?: { start: XY; stop: XY } };
type ColorString = string;            // "display-p3:r,g,b,a" / "extended-gray:l,a" など
interface Position { scale: number; 'translation-in-points': [number, number] }
interface Shadow { kind: 'none' | 'neutral' | 'layer-color'; opacity: number }
interface Translucency { enabled: boolean; value: number }
interface Asset { name: string; kind: 'svg' | 'png' | 'jpg'; bytes: Uint8Array; width: number; height: number }
```

既知キーの一覧と既定値は `packages/core/src/schema.ts` に 1 か所でまとめる（未知キーは `extra` に入る）。

### 6.2 外観のマッピング

| UI 上の外観 | `icon.json` の appearance | 描画パラメータ |
|---|---|---|
| Default | （上書きなし） | 壁紙：明 |
| Dark | `dark` | 壁紙：暗 |
| Clear light / Clear dark | **[推測]** 専用のキーは無く、light / dark をもとにシステム側で生成 | プレビュー専用の近似（彩度 0、半透明ガラス） |
| Tinted light / Tinted dark | `tinted` | プレビューでは単色ティント（色相はユーザーが選ぶ） |

### 6.3 ファイル

| 形式 | 用途 |
|---|---|
| `*.icon/`（`icon.json` ＋ `Assets/`） | 正式な保存形式（Icon Composer と相互運用） |
| `*.icon/.fresnel/meta.json` | fresnel 固有のメタデータ（UI 状態、比較設定）。**Icon Composer はこれを無視する前提**（[推測] 要検証。問題があれば外部の sidecar ファイルに切り替える） |
| Web 版 | `.icon` を zip した `.icon.zip` で入出力（ブラウザはディレクトリを扱えないため） |

### 6.4 往復の安全性

- 読み込み時：Zod の `.passthrough()` で未知キーを `unknown` に退避する
- 保存時：既知キーを正規化してシリアライズし、`unknown` をマージして書き戻す
- golden テスト：Icon Composer で作った実ファイル（※自作サンプルのみ使い、他者の著作物は入れない）を読み込み → 保存し、JSON の意味が同じであることを確認する

---

## 7. 描画エンジン（プレビュー）

**[推測]** Apple の実描画は非公開。目標は「判断に使える近似」で、Apple と一致させることはしない。

**方式（v0.2 で変更）**：モデルから**自己完結の SVG を生成**し、各環境でラスタライズする。

- ブラウザ：SVG を Blob URL にし、`<img>` から `<canvas>` に描く（PNG の書き出しも同じ経路）
- Node（CLI / MCP）：`@resvg/resvg-js` でラスタライズする
- 利点：UI・CLI・MCP の見た目が一致する。依存が軽く、テストで出力を比較しやすい
- WebGL2 での真の屈折は v0.3（SVG では背面をスケールさせたブラーで近似する）

合成手順（`@fresnel/render`、キャンバスは 1024pt）

1. **背景**：`fill` を解決し、solid / automatic-gradient / linear-gradient / system-light / system-dark を描く
2. **グループ**：背面から順に描く。各グループでは以下を行う
   - レイヤー：画像を「取り込んだときのサイズ × scale」で、中心＋translation の位置に配置する。`fill` があればアルファを型にして塗り替える。opacity と blend-mode を適用する
   - glass（グループに translucency がある、またはいずれかのレイヤーが glass=true）の場合
     - 背面（それまでに描いたもの）をブラー（blur-material×40px）＋1.03 倍に拡大したものを、グループのアルファでマスクして下に敷く（屈折とすりガラスの近似）
     - グループ本体を `1 − translucency×0.55` の不透明度で重ねる
   - specular：グループのアルファから「光源側に寄せたエッジ」を作り、白で加算する（光源の角度は UI で指定、既定 −45°）
   - shadow：neutral は黒、layer-color はレイヤー自身の色をぼかして下に落とす（opacity を反映）
3. **外観変換**
   - Dark：specializations を解決する。背景が未指定なら system-dark にする
   - Clear：輝度を白（light）またはグレー（dark）のガラスに変換し、背景は半透明のすりガラスにする
   - Tinted：輝度をティント色の濃淡にマップし、背景はティントの暗色にする
4. **マスク**：squircle（superellipse n=4.4 [推測]）または circle
5. **リム**：外周に光源側のハイライトを入れる

## 8. 書き出し

| 形式 | 生成元 | 実行環境 |
|---|---|---|
| `.icon` | 内部モデル → `icon.json` ＋ Assets | 全 OS |
| `.icns` | Default 外観を 16 / 32 / 64 / 128 / 256 / 512 / 1024 でラスタライズ（ガラスを近似適用したもの） | 全 OS |
| `AppIcon.appiconset` | 単一の 1024 ＋ Dark / Tinted バリアント＋ `Contents.json` | 全 OS |
| PNG 一式 | 任意のサイズ × 外観 | 全 OS |
| `Assets.car` | `xcrun actool` | **macOS ＋ Xcode 26 以降のみ**（未インストールなら UI でグレーアウト） |

---

## 9. 検証ルール（F-11）

| ID | 重要度 | 内容 |
|---|---|---|
| V-01 | Error | `icon.json` がスキーマ違反 |
| V-02 | Error | 参照されている画像が Assets に無い |
| V-03 | Warning | レイヤーが正方形でない / 1024 未満 |
| V-04 | Warning | 角丸を焼き込んでいる疑い（四隅 32px の透明率が 90% を超える） |
| V-05 | Warning | 背景画像が full-bleed / 不透明でない |
| V-06 | Info | 極細線の疑い（16px 描画時にエッジの寄与が 1px 未満） |
| V-07 | Info | テキストを含む SVG（`<text>`）。アウトライン化を推奨 |
| V-08 | Warning | Dark / Tinted が未設定（システムの自動生成になる） |
| V-09 | Warning | グループが 4 つを超える |
| V-10 | Error | プレビューできない画像形式（PDF など） |

V-03 から V-07 は Apple HIG の推奨事項をルール化したもの。

---

## 10. コンポーネント分割

```
App
├─ AppShell                      … ウィンドウ枠、ショートカット登録
│  ├─ Toolbar
│  │  ├─ SidebarToggle
│  │  ├─ DocumentTitle            … 名前の変更、未保存マーク
│  │  ├─ ModeSegmented            … Edit / Compare
│  │  ├─ AppearancePicker         … 6 外観
│  │  └─ ExportButton
│  ├─ Sidebar
│  │  ├─ DocumentNode (Fill)
│  │  └─ LayerTree               … 仮想化なし（最大 4 グループ × 数十レイヤー）
│  │     ├─ GroupRow / LayerRow   … サムネイル、表示トグル、D&D
│  │     └─ AddMenu
│  ├─ Workspace
│  │  ├─ EditCanvas
│  │  │  ├─ PreviewViewport      … WebGL2 のレンダラをホスト
│  │  │  ├─ LightHandle
│  │  │  ├─ CanvasHUD            … 外観セグメント、ズーム、マスク、グリッド
│  │  │  └─ DropZone
│  │  └─ CompareGrid
│  │     └─ PreviewTile × n
│  ├─ Inspector
│  │  ├─ InspectorTabs (Group | Layer | Document)
│  │  ├─ Section(LiquidGlass) / Section(Shadow) / Section(Compositing) / Section(Position) / Section(Fill)
│  │  └─ controls: Slider, Stepper, Toggle, ColorWell, Select, SegmentedControl, OverrideScopeToggle
│  └─ StatusBar                   … 解像度、色空間、検証件数、actool の状態
├─ ExportSheet
├─ IssuesPopover
├─ WelcomeWindow
└─ Toaster
```

---

## 11. 状態管理

```ts
// store/document.ts（Zustand + Immer + zundo）
interface DocState {
  doc: IconDocument;
  dirty: boolean;
  filePath: string | null;
  // actions（すべて履歴対象）
  addLayer(groupId: string, asset: Asset): void;
  moveNode(id: string, to: { groupId: string; index: number }): void;
  setProp(target: NodeRef, key: string, v: unknown, scope: Scope): void;   // kebab-case のキー
}
type Scope = { kind: 'all' } | { kind: 'appearance'; appearance: 'dark' | 'tinted' };
type NodeRef = { kind: 'document' } | { kind: 'group'; id: string } | { kind: 'layer'; id: string };

// store/ui.ts（履歴対象外）
interface UIState {
  selection: { kind: 'document' | 'group' | 'layer'; id?: string };
  mode: 'edit' | 'compare';
  appearance: Appearance;
  zoom: number; showGrid: boolean; mask: 'squircle' | 'circle';
  lightAngle: number; wallpaper: 'light' | 'dark' | 'photoA' | 'photoB';
  tint: string; sidebarOpen: boolean; inspectorOpen: boolean;
}
```

- スライダーをドラッグしている間は `zundo` を一時停止し、確定時に 1 回だけ履歴に積む
- 描画は `doc` と `ui` の必要な部分だけを購読し、requestAnimationFrame で 1 フレーム 1 回にまとめる

---

## 12. ディレクトリ構成

```
fresnel/
├─ apps/
│  ├─ desktop/                 # Tauri v2
│  │  ├─ src-tauri/            # Rust: fs, icns, zip, actool 呼び出し, menu
│  │  └─ index.html
│  └─ web/                     # GitHub Pages 用（同じ UI パッケージを使う）
├─ packages/
│  ├─ ui/                      # React コンポーネント（§10）＋トークン
│  ├─ core/                    # モデル, Zod スキーマ, icon.json の読み書き, 検証
│  ├─ render/                  # SVG 合成エンジン（React 非依存、ブラウザ / Node 共通）
│  ├─ cli/                     # Node CLI（core と renderer を利用）
│  └─ mcp/                     # MCP サーバー（stdio）。npm: fresnel-mcp
├─ docs/
│  ├─ DESIGN.md                # 本書
│  ├─ HIG.md                   # fresnel Human Interface Guidelines
│  └─ icon-json.md             # 解析済みスキーマのリファレンス（出典を明記）
├─ design/                     # SVG デザイン（Step 2 の成果物）
├─ fixtures/                   # golden テスト用の自作 .icon
├─ .github/workflows/          # ci.yml / release.yml / pages.yml
├─ package.json / pnpm-workspace.yaml / turbo.json
├─ LICENSE (MIT)
└─ README.md
```

---

## 13. キーボードショートカット（主要なもの）

| 操作 | macOS | Win / Linux |
|---|---|---|
| 新規 / 開く / 保存 | ⌘N / ⌘O / ⌘S | Ctrl+N / O / S |
| 書き出し | ⇧⌘E | Ctrl+Shift+E |
| 取り消し / やり直し | ⌘Z / ⇧⌘Z | Ctrl+Z / Ctrl+Y |
| Edit / Compare | ⌘1 / ⌘2 | Ctrl+1 / 2 |
| 外観の切替 | ⌥1〜⌥6 | Alt+1〜6 |
| サイドバー / インスペクタ | ⌃⌘S / ⌥⌘I | Ctrl+Alt+S / I |
| グループ化 / 解除 | ⌘G / ⇧⌘G | Ctrl+G / Ctrl+Shift+G |
| 表示切替 | ⇧⌘H | Ctrl+Shift+H |
| ズーム | ⌘+ / ⌘− / ⌘0 | Ctrl+ / − / 0 |

---

## 14. リリース計画

| 版 | 内容 |
|---|---|
| v0.1 | F-01〜F-14（Mac / Win / Linux / Web）。`.icon` の往復と従来形式の書き出し |
| v0.2 | decant 方式の取り込み（コンパイル済みアイコン → 編集可能）※Mac のみ。プリセット |
| v0.3 | watchOS の円形最適化、visionOS / tvOS のプレビュー |
| v1.0 | プラグイン API、Figma 連携（レイヤーの書き出し） |

---

## 15. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| `.icon` 仕様の非公開と変更 | 互換が壊れる | スキーマ版の管理、未知キーの保持、Xcode 更新ごとに golden を作り直す |
| 描画が Apple と違う | ユーザーの誤解 | UI に「Approximate preview」を常に表示。Mac では actool 経由の実描画プレビューを v0.2 で検討 |
| Apple の商標 | 法的リスク | 「Icon Composer」「Liquid Glass」は説明文でのみ使い、名称やアイコンには使わない。SF Symbols と Apple のアイコンは同梱しない |
| SVG 経由の XSS | セキュリティ | DOMPurify ＋ resvg でラスタライズしてから描画（DOM に挿入しない） |
| 手元に Mac が無い開発環境 | actool 検証ができない | GitHub Actions の macOS ランナーで actool 検証ジョブを回す |

---

## 16. MCP サーバー（v0.2 追加）

AI エージェント（Claude Desktop / Claude Code など）から、`.icon` の作成・編集・プレビュー・書き出しをできるようにする。

### 16.1 構成

| 項目 | 内容 |
|---|---|
| パッケージ | `packages/mcp`（npm: `fresnel-mcp`、bin: `fresnel-mcp`） |
| トランスポート | stdio |
| 依存 | `@modelcontextprotocol/sdk`、`@fresnel/core`、`@fresnel/render`、`@resvg/resvg-js` |
| 対象 | ローカルの `.icon` ディレクトリ（GUI と同じファイル形式なので、エージェントが作ったものを GUI で開いて仕上げられる） |
| 安全性 | 読み書きは許可ルート配下だけ（起動引数 `--root <dir>`、複数指定可。省略時はカレントディレクトリ）。外部通信なし。取り込む SVG はサニタイズする |

設定例（Claude Desktop / Claude Code）

```json
{ "mcpServers": { "fresnel": { "command": "npx", "args": ["-y", "fresnel-mcp", "--root", "/path/to/icons"] } } }
```

### 16.2 ツール

| ツール | 入力 | 出力 |
|---|---|---|
| `icon_create` | path, background?（色 / グラデーション / system）, platforms? | 作成した .icon のサマリ |
| `icon_inspect` | path | グループ / レイヤー / 属性 / 外観別上書きのツリー（JSON） |
| `icon_add_layer` | path, source（ファイルパス or SVG 文字列）, group?（名前、無ければ作る）, name?, fill?, opacity?, scale?, offset?, glass? | 追加後のサマリ |
| `icon_set` | path, target（`document` / グループ名 / `グループ名/レイヤー名`）, props（kebab-case のキーと値）, appearance?（`dark` / `tinted`。指定時は上書き） | 変更後の対象 |
| `icon_remove` | path, target | 削除後のサマリ |
| `icon_move` | path, target, index, toGroup? | 並べ替え後のサマリ |
| `icon_validate` | path | 検証結果（V-01〜V-08） |
| `icon_render` | path, appearance?, size?, mask?, out? | **PNG を画像コンテンツで返す**（エージェントが見た目を確認できる）。out を指定すれば保存もする |
| `icon_render_sheet` | path, size?, out? | 6 外観を並べたコンタクトシート PNG |
| `icon_export` | path, outDir, formats（`icon` / `icns` / `appiconset` / `png`）, sizes? | 書き出したファイルの一覧 |

### 16.3 リソース / プロンプト

- リソース `fresnel://guide/icon-design`：HIG Part B（アイコン制作ガイド）の本文。エージェントが Apple の推奨を参照できる
- リソース `fresnel://schema/icon-json`：fresnel が扱う icon.json キーの一覧と既定値
- プロンプト `design_app_icon`：アプリの説明からレイヤー SVG を設計 → 追加 → 6 外観を確認 → 書き出し、という手順のテンプレート

### 16.4 GUI 連携

- v0.2：GUI は開いているファイルの外部変更を検知して再読み込みする（MCP で編集した結果が GUI にそのまま反映される）
- 将来：GUI 側に MCP の HTTP トランスポートを持たせ、編集中のドキュメントを直接操作する

---

## 17. 実装状況（v0.2 時点）

| 範囲 | 状態 |
|---|---|
| `@fresnel/core` | 実装済み。実際の Icon Composer 出力 3 ファイルでバイト単位の往復を確認。外観＋プラットフォームのバリアント、`refractivity`・`specular`（inside / outside）、`features` の自動同期に対応 |
| `@fresnel/render` | 実装済み（SVG 合成方式）。屈折の近似、外側スペキュラ、Effects のオフ表示に対応 |
| `fresnel-mcp` | 実装済み。`icon_set` と `icon_render` に `platform` 引数あり |
| `fresnel-icon`（CLI） | 実装済み |
| Web アプリ | Icon Composer に準じた UI（A4 を参照）。IndexedDB への自動保存と、再読み込み時の復元に対応。Playwright E2E 16 本 |
| 書き出し | iOS の appiconset の 1024 は、全面不透明かつアルファなしの RGB PNG。Tinted はグレースケール |
| ブランド | `brand/`（ロゴ・ファビコン・OGP・GitHub social preview）。`pnpm brand` で生成する |
| デスクトップ（Tauri v2） | 実装済み。Linux の .deb ビルドと起動を確認済み。macOS と Windows は CI（release.yml）でビルドする |
| Assets.car | macOS ＋ Xcode 26 以降で actool を呼ぶ。CI の macOS ジョブで検証する（ローカルでは未検証） |
| 安全性 | `.icon` 内のシンボリックリンクは書き込み・削除で辿らない（core / MCP / デスクトップ）。SVG はトークナイザ＋許可リストで無害化 |
| 未対応 | WebGL2 の屈折パス、visionOS / tvOS、最近使ったファイル（F-01） |
