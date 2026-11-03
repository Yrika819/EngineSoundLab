# EngineSoundLab

スマートフォン向けの**加速音・パワートレーン・メーターシミュレーター**。Android Chrome / iPhone Safari を主な対象とする、開発初期のオープンソースプロジェクトです。

> **状態: **公開P1試作版（3・4・6気筒の合成音を切替可能）**。実車相当の精度や各メーカーの音質を再現済みという意味ではありません。**

## 目指す体験

アクセル・ブレーキをスマートフォンで操作すると、車速・エンジン回転数・モーター駆動・発電制御が変化し、音と車種別メーターが連動する。

- **音声は合成方式が主役。** 録音に依存せず、燃焼・吸排気・モーター・走行音をリアルタイム生成する。**ハイブリッド（録音＋合成）は後から追加する任意機能**であり、合成音を完成させる妨げにしない。
- **走行モード優先**。停車中の空ぶかし機能は将来フェーズ。
- **メーター**: プリウス・オーラ等の車種別 *inspired* テーマ + SPORT / ENGINEERING 表示。メーカー公式UIの完全複製ではない。
- **対応**: モバイルファースト PWA。縦・横画面、タッチ操作、音源なしでも使えるオフライン基本機能。

## 初期車種

| 車種 | シミュレーション | エンジン・車輪の関係 |
| --- | --- | --- |
| トヨタ プリウス 60系 2.0L HEV (2WD) | 動力分割型ハイブリッド (THS) | エンジンとモーターを動力分割機構で協調 |
| 日産 オーラ FE13 (2WD) | 第2世代 e-POWER | エンジンは発電用、車輪はモーター駆動 |

プリウス60系THSとオーラFE13 e-POWERは**推定パラメーターによる試作モデル**として動作します。スカイライン V37、GR Supra、IS300h、Civic e:HEV、プリウス PHEVなどは将来候補。

## 現在試せる機能

- [Web版を開く](https://yrika819.github.io/EngineSoundLab/)（GitHub Pages）
- スマホでアクセル・ブレーキを操作、汎用AT、プリウスTHS近似、オーラe-POWER近似のRPM・車速を表示
- **3・4・6気筒の点火間隔・排気共鳴・吸気・走行音を合成**。気筒数は再生中も切替可能（走行物理は共通）。音源サンプル不要、録音音源なし
- [Node上のDSPテスト](tests/synth-core.test.mjs)と[Worklet連携テスト](tests/worklet-bridge.test.mjs)をCIで実行

## P2の車両制御（試作）

車両選択で「汎用ガソリン車」「プリウス60系HEV（近似）」「オーラFE13 e-POWER（近似）」を切替できます。THSにはエンジン機械駆動とモーターの分担、e-POWERには発電専用エンジンと駆動モーターを別々に実装しました。バッテリーSOC、発電量、モーター出力、エンジン状態が確認でき、エンジン停止中は燃焼音が鳴らず、モーター音は残ります。

**注意：メーカー未公開の各制御閾値・バッテリー使用可能容量・ギア比などは推定/仮値です。メーカーの実車の正確な制御再現ではありません。**

## 実装方針

**最初のゴールは、スマホでアクセルを動かすと連続した合成エンジン音が鳴り、速度とRPMが変化する最小限の動作版。** 音質の改善、プリウス・オーラの実車に近い駆動制御、メーカー別メーターを順に実装する。録音を使うハイブリッド音源は最後の任意拡張として扱う。

- [実装計画（v0.6）](docs/IMPLEMENTATION_PLAN.md)
- [開発ロードマップ](docs/ROADMAP.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [車両制御設計](docs/POWERTRAINS.md)
- [音響仕様](docs/AUDIO.md)
- [品質・受け入れ基準](docs/QUALITY.md)

## 技術方針

TypeScript、Web Audio API / AudioWorklet、SVG または Canvas、Vite を想定。車両シミュレーションと音声・UIは別モジュールとし、共通のテレメトリー型で接続する。設計とテストを確認しながら段階的に開発する。

## データと権利

メーカー公表値、実測値、推定値、仮値は区別する。車名は説明用に言及し、メーターデザインは独自に描画する。録音音源・画像・第三者コードの無断転載はしない。開発中の仕様や実装はメーカー非公認で、実車の制御/安全操作を代替しない。

## 参考プロジェクト

- [Engine Sim](https://github.com/YigitSalihEmecen/Engine_Sim) — 点火順序・排気共鳴・変速
- [engine-audio](https://github.com/markeasting/engine-audio) — Web Audioによるエンジン音
- [Engine-Sound-Simulator](https://github.com/VinZu17/Engine-Sound-Simulator) — 合成・サンプル音声とメーター
- [RevSynth](https://github.com/sanketp60/revsynth) — 音声合成
- [Simscape Hybrid Electric Vehicle Model](https://github.com/mathworks/Simscape-Hybrid-Electric-Vehicle-Model) — 動力分割HEVの構造的参考（コード流用には制限あり）

これらのコードや録音は未取り込み。自作部分のライセンスは別途確定する。
