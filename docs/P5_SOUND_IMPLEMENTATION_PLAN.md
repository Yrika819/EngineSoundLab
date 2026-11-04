# P5 実装計画 — プリウス60系2.0 HEV／オーラFE13 音響再現

**策定日: 2026-11-04**  
**状態: 設計・実装計画のみ。P5音響アルゴリズムはこのPRで変更しない。**  
**対象: プリウスMXWH60 FWD 2.0 HEV/M20A-FXS、第5世代THS；日産オーラFE13 FWD/HR12DE・EM47、第2世代e-POWER。**

## 設計方針と背景

[P5事前音響研究](P5_PRIUS_AURA_SOUND_RESEARCH.md)を根拠に、正しい「音の発生源と作動条件」→「車種ごとの合成音色」→「車室内での聞こえ方」→「実車参照との比較」の順で改善する。

- **SYNTH（リアルタイム合成）を唯一の必須音響経路**とする。ライセンス付き録音のHYBRIDモードは任意で後期。
- エンジン回転数と燃焼状態を分離する。停止、始動、燃焼稼働、**燃焼なしの回転**、停止移行を区別。回転数 > 0 だけで燃焼音を発生させない。
- トヨタTHSではエンジン機械駆動、MG1、MG2を区別。オーラe-POWERではエンジンの**車輪への機械駆動は常にゼロ**、発電機とEM47駆動モーターが独立。
- モーターの電磁音・ギア音、回生音、発電機音、車両接近通報音（AVAS）は別レイヤー。AVASは屋外向けスピーカー音であり、車内の駆動モーター音と同一視しない。
- **車内視点の音を優先**。ロードノイズ・風・遮音によるマスキングを考慮する。エンジンルーム収音を車室内ゲインに直結しない。
- 車種固有の制御閾値、極対数、PWM周波数、減速機歯数、EQカーブが未公開の場合は `estimated/placeholder` と記録し、公式値と偽らない。
- 既存P4のPWA、アクセル・ブレーキ、メーターを回帰テストで守る。実車の運転・整備・安全判断には使わない。

## 現在のコードを踏まえた改修対象

| 現在の実装 | P5の課題 | 対象 |
| --- | --- | --- |
| `DriveState.enginePhase` は STOPPED/STARTING/RUNNING/STOPPING | 「回転するが燃焼しない」を明確に表現できない | `apps/web/src/powertrains.ts` |
| `combustionActive` はRUNNINGに追従 | 始動/停止/モータリングで燃焼音以外の機械音が必要 | powertrains / `audio.ts` |
| バッテリーSOCを直接clamp | 電気的な利用可能出力を制約せず、実際のエネルギー収支との矛盾があり得る | `powertrains.ts` |
| I3/I4の独自燃焼パルス、固定共鳴器 | 車種専用EQ、過渡状態、室内伝達特性が未校正 | `public/synth-core.js` |
| `ElectricDriveSynth` がモーター/発電機/回生を合成 | 車種別の電磁次数・MG1/MG2差・静粛性・車室内マスキングが未校正 | `public/electric-synth.js` |
| Worklet に多くの独立した数値パラメーター | AudioTelemetryの契約が明示的でなく、音源に必要な状態が散在 | `src/audio.ts`, `public/engine-worklet.js` |
| generic/PRIUS/AURAのelectricProfile | 車室内視点と音源個別の音量調整がない | 音響プロファイル・UI（後期） |

## 実装スライスと合格条件

### P5-A：音響用テレメトリーと電動系状態の正確化【最初に実装】

**目的:** 音が鳴る/鳴らない条件を正し、P5-B以降が安全に調整可能な共通基盤を作る。

- `EngineOperation = STOPPED | STARTING | RUNNING_FUELLED | SPINNING_UNFUELLED | STOPPING` を設計。機械回転RPM・燃焼ON・始動機械音・発電状態は独立。
- 車両制御出力から純粋な `toAudioTelemetry(driveState)` を作る。UI/メーターによる変換なしで音響入力を確定。
- 主な入力フィールド例: `vehicleId, engineOperation, engineRpm, combustionGate, engineLoad, tractionShaftRpm, tractionTorqueSigned, regenPowerKw, generatorShaftRpm, generatorElectricalKw, batterySoc, speedMps, audioListenerMode`。
- 将来の温度・暖房・長い下り坂シナリオは**試験用の外部条件**として追加。未確認の実車制御値を数値化しない。
- 電気出力がSOCの上下限や軸トルクと整合するよう「充放電できる最大電力」を適用し、エネルギー保存・発電/駆動分離をテスト。
- オーラの発電機回転数は車輪のRPMと機械的に結びつけない。プリウスのMG1回転数は遊星歯車の関係を保つ（歯数は仮値と表示）。
- 既存音声の互換アダプターを維持し、UIの動作を壊さず漸進的に切替。

**合格条件:** 非燃焼回転で燃焼音ゼロ、EV走行で駆動モーター音あり、発電停止で発電音ゼロ、オーラのエンジン→車輪の機械駆動ゼロ、SOC境界でも電力保存と有限値を満たす。過去の全テストPASS。

### P5-B：プリウス直4／オーラ直3エンジンの専用燃焼音

**目的:** 単なる気筒数の切替を越え、車種ごとの加速・定常・始動時の音色を合成。

- エンジン4ストローク点火周期: PRIUS I4 = 2.0次、AURA I3 = 1.5次。燃焼イベント、吸気、排気、機械/モータリングを別バスで生成。
- Prius: 低域の存在感を保ち、加速時の中高域を抑える**方向性**で車室EQを設計。参考講演の200–600Hzは調整研究の対象帯域であり、確定EQ係数ではない。
- Aura: 3気筒点火周期を表現する一方、バランサー/遮音を考慮して誇張された粗さを避ける。発電負荷に応じた燃焼音・始動の立ち上がりを設計。
- 燃焼停止・非燃焼回転・始動/停止に跨る短いフェード。物理モデルとタイミングを一致。
- 既存I3/I4/I6の汎用合成を残し、車種固有の音響プロファイルを別管理。

**合格条件:** 各RPMの点火周期が理論値に一致し、各場面の燃焼状態と音源が対応する。切替時の異常なインパルス/出力クリップがなく、両車のスペクトル形状が識別可能。

### P5-C：THS・e-POWERの駆動/発電/回生音

**目的:** ハイブリッドらしい「キーン」を実車構造に沿った複数の音源に分解。

- プリウス: MG1の発電・モータリング音、MG2の牽引/回生音、減速ギアを**独立した振幅と軸回転数**で生成。
- オーラ: EM47駆動モーター、発電機、回生音、減速機、インバーター高周波を分離。発電音と駆動音の重なりを制御。
- 電動音は正負トルク・車速・電力から作り、惰行/低負荷/回生時に音色を変える。単純にアクセルだけで電磁音量を決めない。
- ブラウザ44.1/48kHzを前提に高次倍音の**エイリアシングを抑制**し、レイヤー間の位相・音量を平滑化。
- 極数・ギア歯数・PWMなどOEM未確認値は独立した `estimated` テーブルに置き、実測校正が入り次第置換可能にする。

**合格条件:** ICE停止中でもモーター音、発電中に発電機音、回生時は負トルク相当の音の変化。プリウス・オーラで異なる音響設定。単音源ミュート時の独立性が成立。

### P5-D：車室音響・ロードノイズ・AVASの分離

**目的:** エンジンルームからの生音ではなく、車内で認識されるパワートレイン音の組み合わせを再現。

- 標準のリスニング位置を `CABIN` に設定。エンジン吸排気・モーター・発電機・路面/風音を独立ゲイン/EQで混合。
- 速度/推定路面によるロード・風ノイズが他音源を相対的にマスクするようバランスを調整。車両制御にもロードノイズを参照する余地は設けるが、**別車種の数値マップは移植しない**。
- `ENGINE_BAY` は調査用の任意視点。室内と同じEQを使わない。
- AVASは**独立した車外向けチャンネル**。P5の核には含めず後期オプション（録音コピーではなく独自合成音）。車内再生時に過大に重ねない。
- 軽量化: 固定AudioWorklet、不要なオブジェクト生成なし、プロファイル変更は平滑化、メーター更新とDSPを分離。

**合格条件:** CABINでは速度に伴う遮音/環境音の影響が段階的に変わり、ENGINE_BAYとのゲイン/EQ差がある。AVASがデフォルトでモーター音と同一にならない。

### P5-E：音質校正・受け入れ検証

**目的:** 「音が出る」ではなく「誤った音を鳴らさず、車種らしく聞こえる」ことを検証。

- 両車で同条件の試験シナリオを再現: ①EV発進 ②緩加速 ③強加速・ICE始動 ④定常巡航 ⑤回生減速 ⑥SOC低下/発電 ⑦非燃焼エンジン回転（オーラ）。
- `AudioTelemetry` を固定したイベント時系列シナリオを保存し、実装前後の出力波形を比較。
- 自動音響試験: 44.1/48kHz、点火次数/電磁音の追従、ピーク/非有限値、状態遷移の不連続、ステレオ経路、発電OFFの無音性、長時間のリソース・メモリ安定性。
- 音量安全: ヘッドホンでの急激な音量上昇を避け、マスターレベル平滑化とリミッターを維持。高周波合成は帯域とゲインを制限。
- ユーザー実機受け入れ: Android Chrome/iOS Safariで縦横画面、オフライン、バックグラウンド停止、音切れ・CPU/発熱を確認。**10分連続再生、入力→音声の目標100ms以内は測定前の目標であって現時点の実績ではない**。
- 参照動画は合法的な試聴・判断材料に限定。現時点で直接音声解析未実施で、FFTの実測ピークを推定で埋めない。引用・音源の取り込みや再配布は適切なライセンスがない限り行わない。

**合格条件:** CI全件成功、PWAビルド回帰成功、上記場面の音源条件に矛盾なし、ユーザーの聴感レビューで明らかな違和感を修正。計測・聴感で確認できなかった項目をPASSにしない。

## PR分割・管理

| PR | 主な変更ファイル | 後続依存 |
| --- | --- | --- |
| P5-A | `powertrains.ts`, 新 `audio-telemetry.ts`, `audio.ts`, state/energy tests | 必須 |
| P5-B | `synth-core.js`, 車種別ICE profile, firing/spectral tests | A |
| P5-C | `electric-synth.js`, `engine-worklet.js`, `audio.ts`, electric tests | A。Bと部分並行可 |
| P5-D | 新 CabinMixer / noise DSP, UI視点切替, acoustic tests | B/C |
| P5-E | scenario harness, offline spectral diagnostics, device QA notes | 全て |

一つのPRで作動条件、音色、UIを同時に大改修しない。CI PASS→独立レビュー→merge→GitHub Pages反映確認→次のPR。作業中の実機で音を聴ける状態を常に保つ。既存メーター・ペダル・PWA機能を壊さない。

## 今回実装しないもの

- 実測できないメーカー専用ECU/RPMマップの断定、別車種e-POWERの数値流用
- YouTube動画の無許諾音声抽出・再配布・録音サンプル導入
- P5前半での車両接近通報音の厳密再現・公認警報音のコピー
- 空ぶかし、3D運転ゲーム、OBD接続、車種無制限の拡張

## ソース（適用範囲を限定して参照）

- [P5実車音響研究ノート](P5_PRIUS_AURA_SOUND_RESEARCH.md)
- [Toyota Prius 2025 HEV取扱説明書・ハイブリッドの特徴](https://manual.toyota.jp/prius/3063/hev/ja_JP/contents/vhch01se040401.php)
- [Toyota 車両接近通報装置FAQ](https://toyota.jp/faq/show/5363.html)
- [Nissan 第2世代e-POWER公式解説](https://www.nissan-global.com/EN/INNOVATION/TECHNOLOGY/ARCHIVE/E_POWER_GEN2/)
- [日産 オーラの音／エンジン作動のガイド（2022年資料）](https://www2.nissan.co.jp/SP/OM/AURA/2210/manual_t00qg6xl3a.pdf)
- [Nissan Technical Review No.89 (2023) 静粛性技術解説](https://www.nissan-global.com/JP/TECHNICALREVIEW/BOOK/NISSAN_TECHINICAL_REVIEW_89/pageindices/index30.html) — **X-Trail等を含む一般技術であり、FE13の数値校正に流用しない**


## P5-A execution status — initial delivery

- Engine operation/combustion separation, typed audio telemetry, SOC headroom limits, engine motoring sink, and accompanying tests are implemented in PR #23.
- Actual FE13 engine-drag threshold, available battery energy, gear ratio, motor maps and electric sound spectral gains are **not verified against OEM vehicle calibration**.
- P5-B/C will refine combustion/non-combustion mechanical voices, traction & generator frequency profiles and cabin masking.
- P5-A is a functional engineering-model hardening step, not completed real-world fidelity validation.


## P5-B initial delivery (PR — vehicle-specific ICE acoustics)

- Prototype dedicated `ice-acoustics.js` provides two estimated combustion profiles (Prius I4, Aura HR12DE I3) with separate resonators, load-dependent induction noise, combustion pulse edge color and restrained mechanical orders.
- Sound profiles can be switched without reconstructing WebAudio; transitions use smoothed crossfading.
- Adds distinct starter/generator-assisted mechanical rotation audio for unfuelled engine operation; combustion pressure continues to follow P5-A fuelled gate exclusively.
- Adds offline regression at 44.1/48/96kHz; PWA preloads the new module. **These tests prove algorithmic stability, not verified OEM sound similarity.**
- P5-C electric sources, P5-D cabin masking and P5-E listening/real-car comparison remain outstanding.

## P5-B.1 additive refinement and conflict resolution

PR #24 introduced the dedicated Prius/Aura combustion banks and nonfuelled engine motoring audio. An independently produced alternative P5-B PR (#25) was in progress when #24 merged and became conflicting. The alternative engine must **not** be merged over #24; it is superseded. Only complementary improvements are carried forward here: estimated cabin mid-band EQ, improved intake/throttle transient, and fuel-cut/no-false-ignition behavior. Vehicle source architecture, original P5-B tests, battery/drive models, PWA and electric synthesis remain intact.

These changes improve the model's qualitative plausibility; they are not a substitute for P5-E listening and spectral comparison against matched real-car recordings.
