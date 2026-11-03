# EngineSoundLab

スマートフォン向けの**加速音・パワートレーン・メーターシミュレーター**。Android Chrome / iPhone Safari を主な対象とする、開発初期のオープンソースプロジェクトです。

> **状態: 設計・基盤構築中。実車相当の精度や完成したエンジン音を提供する段階ではありません。**

## 目指す体験

アクセル・ブレーキをスマートフォンで操作すると、車速・エンジン回転数・モーター駆動・発電制御が変化し、音と車種別メーターが連動する。

- **走行モード優先**。停車中の空ぶかし機能は将来フェーズ。
- **音声**: リアルタイム合成 (Procedural) と、権利を確認した実車録音を加えるハイブリッド方式を切替可能にする。
- **メーター**: プリウス・オーラ等の車種別 *inspired* テーマ + SPORT / ENGINEERING 表示。メーカー公式UIの完全複製ではない。
- **対応**: モバイルファースト PWA。縦・横画面、タッチ操作、必要な音源のみ読み込む設計。

## 初期車種

| 車種 | シミュレーション | エンジン・車輪の関係 |
| --- | --- | --- |
| トヨタ プリウス 60系 2.0L HEV (2WD) | 動力分割型ハイブリッド (THS) | エンジンとモーターを動力分割機構で協調 |
| 日産 オーラ FE13 (2WD) | 第2世代 e-POWER | エンジンは発電用、車輪はモーター駆動 |

スカイライン V37、GR Supra、IS300h、Civic e:HEV、プリウス PHEV、マツダの発電用ロータリーなどは将来候補。

## 開発の順番

1. 車体・電池・パワートレーンの共通型と計算・検証基盤
2. プリウス THS / オーラ e-POWER の状態遷移とエネルギー収支
3. 燃焼・吸排気・モーター音の合成、メーター、スマホ操作
4. ライセンスを確認したサンプル音源によるハイブリッド音声、スマホ実機評価、PWA

詳細は [アーキテクチャ](docs/ARCHITECTURE.md)、[車両制御設計](docs/POWERTRAINS.md)、[品質・受け入れ基準](docs/QUALITY.md) を参照。

## 技術方針

TypeScript、Web Audio API / AudioWorklet、SVG または Canvas、Vite を候補とする。車両シミュレーションと音声・UIは別モジュールとし、共通のテレメトリー型で接続する。実装は設計とテストを確認しながら段階的に進める。

## データと権利

メーカー公表値、実測値、推定値、仮値は区別する。車名は説明用に言及し、メーターデザインは独自に描画する。録音音源・画像・第三者コードの無断転載はしない。開発中の仕様や実装はメーカー非公認のもので、実車での安全操作の代替として使わない。

## 参考プロジェクト

- [Engine Sim](https://github.com/YigitSalihEmecen/Engine_Sim) — 点火順序・排気共鳴・変速
- [engine-audio](https://github.com/markeasting/engine-audio) — Web Audioによるエンジン音
- [Engine-Sound-Simulator](https://github.com/VinZu17/Engine-Sound-Simulator) — 合成・サンプル音声とメーター
- [RevSynth](https://github.com/sanketp60/revsynth) — 音声合成
- [Simscape Hybrid Electric Vehicle Model](https://github.com/mathworks/Simscape-Hybrid-Electric-Vehicle-Model) — 動力分割HEVの構造的参考（コード流用には制限あり）

これらのコードや録音は未取り込み。自作部分のライセンスは別途確定する。
