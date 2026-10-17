# 設計書：SPEC（Self-Producing Execution Contract）の導入（v0.2.0）

状態：**実装済み**（2026-10-17 承認）。画面（UI）の変更はない。

## 1. 目的

ffmpeg-skill で使っている SPEC を fresnel にも入れる。**ツールの定義を 1 か所に置き、そこから MCP・CLI・契約 JSON・README を生成する。** 手で書いた説明と実際の動作がずれる事故を CI で止める。

| 現状（v0.1.1）の問題 | SPEC 後 |
|---|---|
| MCP のツール定義（`tools.ts`）と CLI（`cli.ts`）が別々に書かれ、引数名も既定値も違う（例：render の size は MCP 512 / CLI 1024） | 1 つの登録簿から両方を作る。CLI でも全 12 ツールが同じ引数で動く |
| README のツール表は手書き。`icon_align` を足したときも手で直した | 表は登録簿から生成し、ずれたらテストが落ちる |
| エージェントが「何ができるか」を知るには MCP に接続するしかない | `fresnel contract --json` で、接続なしに機械可読な契約を取れる |
| 出力の形が決まっていない（テキストの JSON だけ） | 各ツールに出力スキーマを持たせ、MCP の `structuredContent` でも返す |

## 2. ffmpeg-skill の SPEC との対応

| ffmpeg-skill | fresnel | 備考 |
|---|---|---|
| argparse のパーサーから `input_schema` を実行時に導出 | zod スキーマから `z.toJSONSchema` で導出 | 元が 1 つなのは同じ |
| `TOOL_META`（role / capabilities / inputs / outputs） | 登録簿 `ToolDef` の `role` / `capabilities` / `verification` / `examples` | |
| `contract --json` | `fresnel contract --json`（MCP では `fresnel://contract` リソース） | |
| `supports_dry_run` / `supports_json` | `supports_dry_run`（編集系は `dry_run` 引数）／ `supports_json` は全ツール true | |
| `mutates_input` / `idempotency_hint` | 同名 | MCP の annotations（readOnlyHint ほか）もここから作る |
| `verification` / `requires_visual_verification` | 同名 | 例：add_layer の後は `icon_render_sheet` で目視 |
| `contract_version` を `skill.version` と別管理 | `contract_version`（"1.0"）を npm の版と別管理 | |
| `tests/test_contract.py`（件数・凍結スナップショット） | `packages/mcp/test/contract.test.ts` | §6 |

fresnel だけの追加：**icon.json の属性表**（`DOCUMENT_ATTRS` / `GROUP_ATTRS` / `LAYER_ATTRS`）も契約に含める。値の JSON Schema・既定値・説明を、コアの zod 定義から生成する。

## 3. 登録簿（単一の元）

`packages/mcp/src/spec.ts` に全ツールを置く。

```ts
interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  id: string;                 // "icon_set"（MCP の名前。変えない）
  cli: string;                // "set"（CLI のサブコマンド名）
  positional?: (keyof S)[];   // CLI で位置引数にするもの（例：["path"]）
  title: string;
  description: string;
  role: 'create' | 'inspect' | 'edit' | 'check' | 'render' | 'export';
  capabilities: string[];     // "layers", "appearance-overrides" など
  input: S;                   // zod の形（入力の唯一の元）
  output: z.ZodType;          // 出力の形（緩い object。キーの追加は互換）
  mutates_input: boolean;
  idempotency_hint: 'idempotent' | 'not-idempotent';
  destructive?: boolean;
  supports_dry_run: boolean;
  verification: string[];     // 結果を確かめる手順
  requires_visual_verification: boolean;
  examples: { args: Record<string, unknown>; note: string }[];
  run(ctx: { ws: Workspace }, args): Promise<{ data: object; image?: Uint8Array }>;
}
```

- `run` は MCP にも CLI にも依存しない。MCP は `data` をテキストと `structuredContent` に、`image` を画像として返す。CLI は `data` を JSON で標準出力に出す。
- エラーは今と同じく `Error` を投げる。MCP は `isError: true`、CLI は終了コード 1。

## 4. 生成されるもの

| 生成物 | 生成方法 | 置き場所 |
|---|---|---|
| MCP `tools/list` | 起動時に登録簿をループして `registerTool` | `createServer()` |
| MCP の annotations | `mutates_input` → `readOnlyHint`、`destructive` → `destructiveHint`、`idempotency_hint` → `idempotentHint` | 同上 |
| 契約 JSON | `buildContract()` | `fresnel contract --json`、MCP リソース `fresnel://contract`、リポジトリの `docs/contract.json` |
| CLI | `fresnel call <id> --引数 …` と、各ツールの短い名前 `fresnel <cli> …`（create, add-layer, set, align…） | `cli.ts` |
| CLI ヘルプ | 登録簿の title / 引数から生成。`fresnel <cli> --help` | 同上 |
| README のツール表 | `<!-- spec:tools -->` と `<!-- /spec:tools -->` の間を生成 | `README.md`、`packages/mcp/README.md` |

### 4.1 CLI の引数の決まり
- 引数名は MCP と同じで、`_` を `-` に変える（`dark_background` → `--dark-background`）。
- 型ごとの渡し方：文字列 `--x v`、数値 `--x 12`、真偽 `--x`（偽は `--no-x`）、配列 `--x a,b`、オブジェクト `--x '{"k":1}'`（JSON）。
- `--args '<JSON>'` で全部を JSON でも渡せる（エージェント向け）。両方あれば個別指定が勝つ。
- 検証は zod で行うので、MCP と CLI のエラー文は同じになる。
- CLI のファイルアクセス：相対パスはカレントディレクトリ基準。CLI は人が自分で叩くものなので、MCP のようなルート制限は付けない（`--root` を付けたときだけ制限する）。

### 4.2 既存の CLI コマンドの扱い（互換）
`build` / `inspect` / `validate` / `render` / `export` / `mcp` は**今の動作のまま残す**（CI で使われている可能性があるため）。このうち `inspect` / `validate` / `render` / `export` はツールの短い名前と重なるので、登録簿のツールは `fresnel call icon_render …` で呼ぶ。重ならない 8 個（create, add-group, add-layer, set, remove, move, align, render-sheet）は短い名前でも呼べる。既存コマンドも契約の `cli_aliases` に載せる。

## 5. 契約 JSON の形

```jsonc
{
  "contract_version": "1.0",
  "name": "fresnel",
  "version": "0.2.0",                 // npm の版
  "tools": [
    {
      "id": "icon_set", "title": "Set attributes", "role": "edit",
      "capabilities": ["attributes", "appearance-overrides", "platform-variants"],
      "description": "…",
      "input_schema": { /* JSON Schema 2020-12 */ },
      "output_schema": { /* 同上 */ },
      "mutates_input": true, "idempotency_hint": "idempotent", "destructive": false,
      "supports_dry_run": true, "supports_json": true,
      "verification": ["icon_render_sheet で見た目を確認", "icon_validate"],
      "requires_visual_verification": true,
      "cli": "fresnel set <path> --target … --props '{…}'",
      "examples": [ { "args": { … }, "note": "…" } ]
    }
  ],
  "capability_map": { "appearance-overrides": ["icon_set", "icon_create"], … },
  "icon_json": {
    "document": { "fill": { "schema": { … }, "default": "automatic", "description": "Background fill" }, … },
    "group": { … }, "layer": { … }
  },
  "cli_aliases": { "build": "…", "inspect": "icon_inspect と同じ内容を出す", … }
}
```

## 6. ずれ検出（CI で落とす）

| テスト | 落ちる条件 |
|---|---|
| 契約の一致 | `docs/contract.json` が `buildContract()` の結果と違う（`pnpm spec` で再生成） |
| README の表 | 2 つの README の生成区間が登録簿と違う（同上） |
| 公開面の凍結 | `packages/mcp/spec/surface.json`（ツール名・引数名・必須かどうか・型）と比べて、ツールや引数が**消えた / 名前が変わった / 任意→必須になった**。追加は OK だがスナップショットの更新が必要 |
| MCP との一致 | stdio で起動したサーバーの `tools/list` の名前と入力スキーマが契約と一致 |
| 例の実行 | 全ツールの `examples` を一時フォルダで順に実行し、すべて成功し、出力が `output_schema` に合う（例が「動く説明書」になる） |
| CLI の一致 | `fresnel --help` に全ツールが出る。`fresnel call` と MCP で同じ入力から同じ結果になる（代表 1 件） |
| 件数 | README の「12 tools」などの数字が登録簿の件数と一致 |

## 7. 安定性の約束（README と契約に書く）

| 変更 | 扱い |
|---|---|
| ツールの追加、任意引数の追加、出力キーの追加 | マイナー版（契約 1.x のまま） |
| ツール・引数の削除や改名、任意→必須、既定値の変更、出力キーの削除 | 契約のメジャー版を上げる（2.0）。凍結テストが止める |
| 説明文、例、verification の文言 | いつでも変えてよい |
| 既存 CLI コマンド（build ほか）の引数 | 1.x の間は変えない |

## 8. 変更するファイル

| ファイル | 変更 |
|---|---|
| `packages/mcp/src/spec.ts`（新規） | 登録簿（12 ツール。今の `tools.ts` の中身を移す） |
| `packages/mcp/src/contract.ts`（新規） | `buildContract()`、README 表の生成、公開面の抽出 |
| `packages/mcp/src/tools.ts` | 登録簿から `registerTool`。リソース `fresnel://contract` を追加 |
| `packages/mcp/src/workspace.ts` | `edit(…, { dryRun })`。CLI 用の制限なしモード |
| `packages/cli/src/cli.ts` | `contract`、`call`、短い名前のコマンド、生成ヘルプ |
| `packages/mcp/spec/surface.json`（新規） | 凍結スナップショット |
| `docs/contract.json`（新規、生成） | 契約 |
| `scripts/spec.ts`（新規） | `pnpm spec`：契約・表・スナップショットを再生成 |
| `packages/mcp/test/contract.test.ts`（新規） | §6 |
| README / USER_GUIDE / CHANGELOG | SPEC の節、CLI の新コマンド |

## 9. やらないこと
- 例外：`icon_move` の結果だけは配列から `{ "groups": [...] }` に変える。MCP の `structuredContent` はオブジェクトしか返せないため（v0.2.0 の CHANGELOG に記載）。
- 既存ツールの引数の改名や既定値の統一（render の size 512 と CLI `render` の 1024 の違いは、既存コマンドの互換として残す）。
- Web アプリ・デスクトップの UI 変更。
