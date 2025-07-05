# Coding Agent

AIコーディングエージェントのVSCode拡張です。
学習目的で作成しました。Clineの劣化版です（笑）

## 対応API

- OpenAI - gpt-4.1, gpt-4.1-miniなどが動作します。設定画面からAPIキーの設定が必要です。
- VSCode Language Model API - Copilotのライセンス経由で、gpt-4.1が動作します。

## インストール方法

1. [Actions](https://github.com/yuto-moriizumi/coding-agent/actions/workflows/build.yml?query=branch%3Amain)ページにアクセスします。
1. 最新のビルドを選択し、`coding-agent-<version>.vsix`をダウンロードします。
1. VSCodeを開き、`Ctrl + Shift + P`でコマンドパレットを開きます。
1. `Extensions: Install from VSIX...`を選択し、ダウンロードした`coding-agent-<version>.vsix`を選択します。
1. インストールが完了したら、VSCodeを再起動します。

## For developers

This extension uses esbuild. You need to install the [esbuild problemMatcher extension](https://marketplace.visualstudio.com/items?itemName=connor4312.esbuild-problem-matchers) to execute debugging without errors.

### Build

NICKNAME is optional

NICKNAME="Volga" npm run compile && vsce package
