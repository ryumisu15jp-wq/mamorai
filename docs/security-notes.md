# セキュリティの確認結果と残課題（2026-11）

## 対応済み
| 内容 | 対応 |
| --- | --- |
| 旧の会社向け関数（`company_register_staff` / `company_create_site` / 休暇の一覧・承認・却下）が、ロールを確認せず、「会社のアカウントであること」だけで動いた。本社PC・教育センター・支店のアカウントが API を直接呼ぶと、勤務員の登録・現場の作成・休暇の承認ができた | `0418_authz_hardening.sql`: 勤務員の登録・現場の作成は管理者だけ、休暇は管理者と担当現場の支店だけ。`supabase/tests/authz_check.sql` で検証（修正前は10項目中8項目が失敗） |
| 上記と、運営向け（`platform_*`）・`site_staff_pins` がログインなし（anon）にも実行権限があった（中で弾いてはいた） | 0418 で anon から実行権限を外した |
| `express` 配下（`proxy-addr`・`body-parser`・`qs`）の既知の脆弱性（critical 1・high 1・moderate 3） | `express` を 4.22 系へ更新（`server/package.json`、ロックファイル）。サーバは現時点で本番に出していない |
| 印影・署名のSVGに氏名を埋め込む際のエスケープ漏れ（`dangerouslySetInnerHTML` で画面に入る。氏名は DB の値で、今回の「氏名の申請」でも変わりうる＝画面に任意のスクリプトを差し込まれる経路） | `lib/sealSignature.ts` に `escapeXml` を追加し、印影の姓・`aria-label`、署名の氏名・`aria-label` をエスケープ。`sealSignature.test.ts` で検証 |
| 個人情報の表（`staff_profiles` / `staff_credentials` / `staff_images` / `staff_id_docs` / `profile_requests` / `staff_profile_views`）の直接アクセス | anon・authenticated に権限なし、RLS 有効。RPC 経由のみ（0414〜0417） |

## 残課題（要判断）
1. **`xlsx`（SheetJS 0.18.5）に high 2件**（prototype pollution・ReDoS）。npm には修正版がなく、公式の配布元（cdn.sheetjs.com）の 0.20.3 以降が修正版。勤務員の一括取込（`staffParser.ts`）と日報取込（`bhtParser.ts`）が、ブラウザ内で利用者のExcelを読むときに使う。
   更新: `pnpm --filter @mamorai/desktop add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`（その後テスト・ビルド）。
2. **PIN が平文で `staff.pin_current` に保存され、現場PC・本社の画面に表示される**（復旧用の仕様）。現場PCのセッションを使える人は、同じ現場の勤務員のPINを読め、その勤務員として本人登録（端末登録）→ 個人情報の閲覧ができる。対策案: PIN の表示をやめ、「再発行（ランダム）して本人に渡す」だけにする。
3. **初期PINが生年月日の月日（MMDD、366通り）**。未変更のアカウントは、連続失敗のロック（15分で5回）の範囲内でも、日をかけて総当たりされうる。対策案: 初期PINをランダムな6桁にして渡す／未変更のまま期限（例: 7日）を過ぎたら無効にする。
4. **端末シークレット（`jyoban_devices`）に有効期限がなく、PIN を変更しても他の端末は無効にならない**。紛失した端末からの個人情報の閲覧が続く。対策案: PIN変更時に他端末を失効／最終利用から90日で失効。
5. **リポジトリが公開のまま**（`supabase/helpers/seed_bulgari.sql` に実データ）。非公開化と履歴からの削除、現場PINの変更が必要。
6. 申請（`worker_request_submit`）の回数制限がない（本人確認済みの端末からのみ。行が積み上がる程度の影響）。

## 本番DBの確認（最優先・読み取りのみ。SQL Editor で実行して結果を確認）
`staff`（`pin_current`＝平文のPIN・生年月日・電話を含む）と `sites` は、0400 より前に作られた表です。
リポジトリの migration では、`0202_rls_hardening.sql` が RLS を有効にしていますが、本番に 0202 が適用されているか、また Supabase の既定の権限（anon / authenticated に表の権限が付く）が残っていないかは、リポジトリからは分かりません。
**anon キー（画面のコードに含まれ、誰でも取り出せる）で `staff` を直接読めれば、全員のPINと生年月日が漏れます。** 次を実行してください。

```sql
-- 1) anon / authenticated が、RLS なしで表を直接読み書きできる表（空なら安全）
select c.relname as 表, c.relrowsecurity as rls有効,
       has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('anon', c.oid, 'insert,update,delete') as anon_書込,
       has_table_privilege('authenticated', c.oid, 'select') as auth_select
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
   and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert,update,delete'))
 order by c.relrowsecurity, c.relname;

-- 2) 上の表に付いている policy（anon に効くもの）
select tablename, policyname, roles, cmd, qual from pg_policies where schemaname = 'public' order by tablename, policyname;
```
結果の見方: 1) に `staff`・`sites`・`leave_requests` などが出て、`rls有効` が false なら、anon から全件読める状態です（直ちに対処）。`rls有効` が true でも、2) の policy が `true`（誰でも可）なら同じです。

## 確認した範囲
- 依存パッケージ: `pnpm audit`（本番依存）。
- DB: 0400〜0418 の関数の実行権限（anon）、新しい表の権限、RLS（`staff` / `sites` / `app_profiles` / `app_site_credentials` は RLS 無効だが、anon・authenticated に表の権限を付けていない。要再確認）。
- 画面: `dangerouslySetInnerHTML` の使用箇所（講習会・休暇の承認画面の印影。入力由来の文字列を直接入れていないかの確認が必要）、クライアントへの秘密キーの混入（なし）。
