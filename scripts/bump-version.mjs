#!/usr/bin/env node
/**
 * release-notes.js と HTML キャッシュバスター（?v= / schedule.html の cacheBust）を一括更新するスクリプト。
 * 外部 npm パッケージ不要（標準 Node.js ESM のみ）。
 *
 * 使い方:
 *   node scripts/bump-version.mjs --message="変更内容の要約" --tags="作業画面,マップ・圃場"
 *   node scripts/bump-version.mjs --dry-run
 *   node scripts/bump-version.mjs --keep-id
 *   node scripts/bump-version.mjs --all --message="全アセットのキャッシュを更新"
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const IGNORED_ASSETS = new Set(['sw.js', 'コード.js']);
const RELEASE_NOTES_FILE = 'release-notes.js';
const SCHEDULE_HTML_FILE = 'schedule.html';
const DEFAULT_TAGS = ['お知らせ・システム'];

const SENSITIVE_PATHS = [
  'migration/.env',
  'migration/data/',
  'supabase/.temp/',
];

function printHelp() {
  console.log(`
Usage:
  node scripts/bump-version.mjs [options]

Options:
  -m, --message <text>   release-notes.js に追加する要約メッセージ（"Manual: " は自動除去）
  -t, --tags <csv>       カンマ区切りのタグ（例: "作業画面,マップ・圃場"。省略時は "${DEFAULT_TAGS[0]}"）
      --keep-id          release-notes.js に新規エントリを追加せず、先頭 ID を使って ?v= のみ更新
      --all              変更有無にかかわらず全ルート .js / .css 参照の ?v= を更新
      --dry-run          ファイルを書き換えずに変更予定内容・構文チェック結果を表示
  -h, --help             このヘルプを表示
`.trim());
}

function parseArgs(argv) {
  const opts = {
    message: '',
    tags: [],
    keepId: false,
    all: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--keep-id') {
      opts.keepId = true;
    } else if (arg === '--all') {
      opts.all = true;
    } else if (arg === '-m' || arg === '--message') {
      if (i + 1 >= argv.length) {
        throw new Error(`${arg} には値が必要です`);
      }
      opts.message = argv[++i];
    } else if (arg.startsWith('--message=')) {
      opts.message = arg.slice('--message='.length);
    } else if (arg === '-t' || arg === '--tags') {
      if (i + 1 >= argv.length) {
        throw new Error(`${arg} には値が必要です`);
      }
      opts.tags = splitTags(argv[++i]);
    } else if (arg.startsWith('--tags=')) {
      opts.tags = splitTags(arg.slice('--tags='.length));
    } else {
      throw new Error(`不明なオプションです: ${arg}`);
    }
  }

  return opts;
}

function splitTags(raw) {
  return raw
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function unquoteGitPath(rawPath) {
  let p = rawPath;
  if (p.startsWith('"') && p.endsWith('"')) {
    p = p.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return p.replace(/\\/g, '/');
}

function getGitStatusEntries() {
  const output = runGit(['-c', 'core.quotepath=false', 'status', '--porcelain', '-uall']);
  const entries = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line || line.length < 4) continue;
    const xy = line.slice(0, 2);
    let rawPath = line.slice(3);
    if ((xy[0] === 'R' || xy[0] === 'C') && rawPath.includes(' -> ')) {
      rawPath = rawPath.split(' -> ').pop();
    }
    const relPath = unquoteGitPath(rawPath);
    entries.push({
      status: xy,
      isDeleted: xy[0] === 'D' || xy[1] === 'D',
      file: relPath,
    });
  }
  return entries;
}

function getCurrentBranch() {
  try {
    return runGit(['branch', '--show-current']).trim();
  } catch {
    return '';
  }
}

function checkJsSyntax(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  try {
    execFileSync(process.execPath, ['--check', absPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, mode: 'default' };
  } catch (err) {
    const stderr = (err && err.stderr ? String(err.stderr) : '') || (err && err.message ? String(err.message) : '');
    if (/Cannot use import statement outside a module|Unexpected token ['"]?export['"]?/i.test(stderr)) {
      try {
        execFileSync(process.execPath, ['--experimental-default-type=module', '--check', absPath], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { ok: true, mode: 'esm' };
      } catch (esmErr) {
        const esmStderr = (esmErr && esmErr.stderr ? String(esmErr.stderr) : '') || String(esmErr);
        if (/bad option/i.test(esmStderr)) {
          return { ok: true, mode: 'skipped-esm' };
        }
        return { ok: false, error: esmStderr.trim() };
      }
    }
    return { ok: false, error: stderr.trim() };
  }
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeJsSingleQuote(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

function getTodayJst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function cleanCommitMessage(msg) {
  return msg.replace(/^Manual[:：]\s*/i, '').trim();
}

function readReleaseNotes() {
  const absPath = path.join(REPO_ROOT, RELEASE_NOTES_FILE);
  const content = fs.readFileSync(absPath, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const arrayMatch = /window\.PASSION_MAP_RELEASES\s*=\s*\[/.exec(content);
  if (!arrayMatch) {
    throw new Error(`${RELEASE_NOTES_FILE} 内に window.PASSION_MAP_RELEASES = [ が見つかりません`);
  }
  const idMatch = /window\.PASSION_MAP_RELEASES\s*=\s*\[\s*\{[\s\S]*?\bid\s*:\s*(['"])(\d+)\1/.exec(content);
  if (!idMatch) {
    throw new Error(`${RELEASE_NOTES_FILE} の先頭エントリから数値の id を読み取れませんでした`);
  }
  return {
    absPath,
    content,
    eol,
    insertIndex: arrayMatch.index + arrayMatch[0].length,
    curId: idMatch[2],
  };
}

function buildUpdatedReleaseNotes(info, nextId, dateStr, tags, message) {
  const { content, eol, insertIndex } = info;
  const formattedTags = tags.map((t) => `'${escapeJsSingleQuote(t)}'`).join(', ');
  const entry = [
    `${eol}  {`,
    `    id: '${nextId}',`,
    `    date: '${dateStr}',`,
    `    tags: [${formattedTags}],`,
    `    message: '${escapeJsSingleQuote(message)}'`,
    `  },`,
  ].join(eol);
  return content.slice(0, insertIndex) + entry + content.slice(insertIndex);
}

function listRootFiles(ext) {
  return fs
    .readdirSync(REPO_ROOT, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(ext))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function updateHtmlFile(htmlName, targetAssets, targetId, syncScheduleCacheBust) {
  const absPath = path.join(REPO_ROOT, htmlName);
  const original = fs.readFileSync(absPath, 'utf8');
  let updated = original;
  const matchedAssets = [];

  for (const asset of targetAssets) {
    const escaped = escapeRegExp(asset);
    const re = new RegExp(`(src|href)=(["'])(\\.\\/)?${escaped}(?:\\?v=[^"']*)?\\2`, 'g');
    let count = 0;
    updated = updated.replace(re, (_match, attr, quote, dotSlash = '') => {
      count += 1;
      return `${attr}=${quote}${dotSlash}${asset}?v=${targetId}${quote}`;
    });
    if (count > 0) {
      matchedAssets.push(`${asset} (${count})`);
    }
  }

  let cacheBustUpdated = false;
  if (htmlName === SCHEDULE_HTML_FILE && syncScheduleCacheBust) {
    const cacheBustRe = /(const\s+cacheBust\s*=\s*)(['"])([^'"]*)\2/;
    updated = updated.replace(cacheBustRe, (_match, lhs, quote, oldVal) => {
      if (oldVal !== targetId) {
        cacheBustUpdated = true;
      }
      return `${lhs}${quote}${targetId}${quote}`;
    });
  }

  return {
    absPath,
    changed: updated !== original,
    updatedContent: updated,
    matchedAssets,
    cacheBustUpdated,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const branch = getCurrentBranch();
  if (branch && branch !== 'main') {
    console.warn(`[WARN] 現在のブランチは "${branch}" です（本番公開ブランチは "main" です）。意図しないブランチで作業していないか確認してください。`);
  }

  const cleanedMessage = cleanCommitMessage(opts.message);
  if (!opts.keepId && !opts.dryRun && !cleanedMessage) {
    throw new Error('--message を指定してください（または既存 ID のまま更新する場合は --keep-id / 確認のみは --dry-run を使用）。');
  }

  const gitEntries = getGitStatusEntries();
  const warnings = [];

  for (const entry of gitEntries) {
    if (entry.isDeleted) continue;
    for (const sensitive of SENSITIVE_PATHS) {
      if (entry.file === sensitive || entry.file.startsWith(sensitive)) {
        warnings.push(`秘密情報・除外対象パスが変更対象に含まれています: ${entry.file}`);
      }
    }
  }

  const edgeFnSet = new Set();
  let hasMigrations = false;
  let hasCodeGs = false;
  for (const entry of gitEntries) {
    if (entry.file.startsWith('supabase/functions/')) {
      const parts = entry.file.split('/');
      if (parts[2]) edgeFnSet.add(parts[2]);
    }
    if (entry.file.startsWith('supabase/migrations/')) {
      hasMigrations = true;
    }
    if (entry.file === 'コード.js') {
      hasCodeGs = true;
    }
  }
  if (hasMigrations) {
    warnings.push('supabase/migrations/ に変更があります。本番 DB への適用（SQL Editor / supabase db push）を確認してください。');
  }
  if (edgeFnSet.size > 0) {
    const fns = Array.from(edgeFnSet).sort().join(', ');
    warnings.push(`supabase/functions/ に変更があります（${fns}）。npx supabase functions deploy <関数名> --no-verify-jwt を忘れないでください。`);
  }
  if (hasCodeGs) {
    warnings.push('コード.js に変更があります。本番は Supabase + R2 のため、GAS 残存機能の変更時のみ clasp push / clasp deploy を実行してください。');
  }

  // 構文チェック（変更または新規作成された .js / .mjs）
  const jsFilesToCheck = gitEntries
    .filter((e) => !e.isDeleted && (e.file.endsWith('.js') || e.file.endsWith('.mjs')))
    .map((e) => e.file);

  const syntaxResults = [];
  for (const relPath of jsFilesToCheck) {
    const res = checkJsSyntax(relPath);
    syntaxResults.push({ file: relPath, ...res });
    if (!res.ok) {
      throw new Error(`構文エラー検出 (${relPath}):\n${res.error}`);
    }
  }

  const releaseInfo = readReleaseNotes();
  const curId = releaseInfo.curId;
  const targetId = opts.keepId ? curId : (BigInt(curId) + 1n).toString();
  const todayJst = getTodayJst();
  const tags = opts.tags.length > 0 ? opts.tags : DEFAULT_TAGS;
  const displayMessage = cleanedMessage || '（--dry-run プレビュー用メッセージ）';

  // 更新対象のルート .js / .css アセット一覧を決定
  let targetAssets = [];
  if (opts.all) {
    targetAssets = [...listRootFiles('.js'), ...listRootFiles('.css')]
      .filter((f) => !IGNORED_ASSETS.has(f));
  } else {
    const changedAssetSet = new Set();
    for (const entry of gitEntries) {
      if (entry.isDeleted) continue;
      if (!entry.file.includes('/') && (entry.file.endsWith('.js') || entry.file.endsWith('.css'))) {
        if (!IGNORED_ASSETS.has(entry.file)) {
          changedAssetSet.add(entry.file);
        }
      }
    }
    if (!opts.keepId) {
      changedAssetSet.add(RELEASE_NOTES_FILE);
    }
    targetAssets = Array.from(changedAssetSet).sort((a, b) => a.localeCompare(b, 'en'));
  }

  const shouldBumpReleaseNotes = !opts.keepId;
  const htmlFiles = listRootFiles('.html');
  const syncScheduleCacheBust = shouldBumpReleaseNotes || targetAssets.length > 0 || opts.all;

  const htmlUpdates = [];
  for (const htmlName of htmlFiles) {
    const res = updateHtmlFile(htmlName, targetAssets, targetId, syncScheduleCacheBust);
    if (res.changed) {
      htmlUpdates.push({ htmlName, ...res });
    }
  }

  // 書き込み（--dry-run でなければ）
  if (!opts.dryRun) {
    if (shouldBumpReleaseNotes) {
      const updatedReleaseContent = buildUpdatedReleaseNotes(releaseInfo, targetId, todayJst, tags, displayMessage);
      fs.writeFileSync(releaseInfo.absPath, updatedReleaseContent, 'utf8');
      const postCheck = checkJsSyntax(RELEASE_NOTES_FILE);
      if (!postCheck.ok) {
        fs.writeFileSync(releaseInfo.absPath, releaseInfo.content, 'utf8');
        throw new Error(`${RELEASE_NOTES_FILE} の書き込み後構文チェックに失敗したためロールバックしました:\n${postCheck.error}`);
      }
    }
    for (const item of htmlUpdates) {
      fs.writeFileSync(item.absPath, item.updatedContent, 'utf8');
    }
  }

  // レポート出力
  console.log(opts.dryRun ? '=== DRY RUN（ファイルは未変更） ===' : '=== バージョン・キャッシュバスター更新完了 ===');
  console.log(`ブランチ: ${branch || '(detached)'}`);
  console.log(`バージョン ID: ${curId} -> ${targetId}${opts.keepId ? ' (--keep-id)' : ''}`);

  if (shouldBumpReleaseNotes) {
    console.log(`release-notes.js 追加予定/済み: date=${todayJst}, tags=${JSON.stringify(tags)}, message="${displayMessage}"`);
  } else {
    console.log('release-notes.js: 新規エントリ追加なし (--keep-id)');
  }

  if (syntaxResults.length > 0) {
    console.log('node --check 対象:');
    for (const r of syntaxResults) {
      console.log(`  - OK (${r.mode}): ${r.file}`);
    }
  } else {
    console.log('node --check 対象: 変更された .js/.mjs ファイルなし');
  }

  console.log(`キャッシュバスター対象アセット (${targetAssets.length}件): ${targetAssets.length ? targetAssets.join(', ') : 'なし'}`);

  if (htmlUpdates.length > 0) {
    console.log(`HTML 更新 (${htmlUpdates.length}ファイル):`);
    for (const item of htmlUpdates) {
      const details = [...item.matchedAssets];
      if (item.cacheBustUpdated) details.push(`cacheBust=${targetId}`);
      console.log(`  - ${item.htmlName}: ${details.join(', ')}`);
    }
  } else {
    console.log('HTML 更新: 差分なし（すでに最新または該当タグなし）');
  }

  if (warnings.length > 0) {
    console.log('');
    for (const w of warnings) {
      console.warn(`[WARN] ${w}`);
    }
  }
}

try {
  main();
} catch (err) {
  console.error(`[ERROR] ${err && err.message ? err.message : String(err)}`);
  process.exit(1);
}
