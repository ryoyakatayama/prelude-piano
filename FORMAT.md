# Prélude曲データ v1

拡張子は `.piano.json`。UTF-8 JSONです。完全なサンプルは `docs/tracks/joy.piano.json` を参照してください。

```json
{
  "version": 1,
  "id": "my-piece",
  "title": "曲名",
  "composer": "作曲者",
  "tempo": 80,
  "timeSignature": "4/4",
  "key": "C major",
  "fingerings": "suggested",
  "pages": [],
  "measures": [
    {
      "number": 1,
      "beats": 4,
      "notes": [
        {"id":"r1", "midi":60, "beat":0, "duration":1, "hand":"right", "finger":1},
        {"id":"r2", "midi":62, "beat":1, "duration":1, "hand":"right", "finger":2},
        {"id":"r3", "midi":64, "beat":2, "duration":2, "hand":"right", "finger":3},
        {"id":"l1", "midi":48, "beat":0, "duration":4, "hand":"left", "finger":5}
      ]
    }
  ]
}
```

## 時間軸・音程

- `id`: 半角英数字・ハイフン・アンダースコア1〜100文字。一度公開した曲のIDは維持します。
- `tempo`: 四分音符を1拍とする20〜300 BPM。
- `measures`: 実際に演奏する順の小節。反復記号や1番・2番括弧は必要に応じて小節を展開します。小節番号は取り込み時に1から振り直します。
- `beats`: 小節の四分音符換算の長さ。4/4なら4、6/8なら3、不完全小節なら実際の長さ。
- `beat`: 小節頭を0とする発音位置。四分音符1、八分音符0.5。小数を使えます。
- `duration`: 四分音符換算の音価。小節をまたがない値にします。タイをまたぐ厳密な持続再生はv1未対応なので、読取メモに残してください。
- `midi`: A0=21〜C8=108、中央のドC4=60。休符は `null`。
- `hand`: `right` または `left`。和音は同じbeatに複数の音符を置きます。
- `finger`: 任意、1〜5（親指=1）。印刷された運指があれば優先し、追加提案は `fingerings: "suggested"` とします。無理な手の拡張を前提にしません。
- `velocity`: 任意、0より大きく1以下。音量の強弱。省略時0.65。
- `x`: 任意、写真上の小節矩形の左端0〜右端1。音符の実位置を指定するとシークバーの補間に使います。全体ページ座標ではありません。
- 装飾や表情記号は元の写真で保持します。`transcriptionNotes` 等に読取メモを追加できますが、任意メタデータから動作は実行しません。

## 写真とカーソルの位置

`pages` の各要素:

```json
{"id":"page-1","image":"data:image/jpeg;base64,...","width":1600,"height":2200}
```

実際の有効なPNG/JPEG/WebPのbase64を使用します。SVGや外部URLは受け付けません。アプリで写真を読み込むと長辺2400px以内のJPEGに変換します。

各小節に `region` を付けます:

```json
{"page":"page-1","x":0.1,"y":0.2,"width":0.22,"height":0.15}
```

座標はページの幅・高さに対する0〜1の割合。ピアノ譜の上下の五線と、その小節の幅を含む矩形です。写真の台形歪みが大きい場合は撮り直しや手動調整を行います。小節矩形と音符xは編集画面から修正できます。

シークバーは現在の小節、拍、音符xを使って補間します。同時発音の音符には同じxを推奨します。写真上の運指・ドレミは小節内の上下パートの周辺に配置する補助ラベルです。

## チャットでの読取チェック

1. ページ順・五線・拍子・調号・反復順を確認。
2. 右手と左手を別々に採譜。臨時記号の小節内での有効範囲を反映。
3. 発音位置と音価を確認。和音は同じbeat、各声部の時間を混同しない。
4. 運指は印刷済みを優先し、追加した提案と区別。
5. 写真上の小節範囲と音符xを指定。
6. 曖昧な読み取りは `transcriptionNotes` に記録し、ユーザーに確認。未確認の音を「認識済み」と断言しない。
7. `validateScore`、テスト、音源を確認してから公開。

## 曲を追加

`docs/tracks/<id>.piano.json` を保存後:

```sh
node scripts/prepare.mjs --audio
node --test tests/*.test.mjs
node scripts/check.mjs
```

カタログには曲ごとのSHA-256の短縮リビジョンを含みます。更新された原本はアプリの更新ボタンで取得でき、端末だけの編集を上書きする前に確認します。アプリの保存時に付与される `sourceRevision` と `modifiedAt` は曲本体の採譜情報ではありません。
