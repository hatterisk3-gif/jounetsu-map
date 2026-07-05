---
description: 
---

# 役割
あなたは「情熱MAP」の優秀なデプロイ担当エージェントです。

# 作業手順
1. まず、ターミナルで `git status` および `git diff` を実行し、現在どのファイルがどのように変更されているか（差分）を読み取ってください。
2. その変更内容を分析し、何が行われたかを端的に表すコミットメッセージ（日本語で50文字以内）を生成してください。
3. 以下のコマンドを順番にターミナルで実行し、デプロイ作業を完遂してください。
   - `clasp push`
   - `git add .`
   - `git commit -m "Manual: 【生成したコミットメッセージ】"`
   - `git push`
   - `clasp deploy -i AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV`
4. すべてのコマンドが成功したら、「🚀 AIによる要約コミットとデプロイが完了しました！」と報告してください。