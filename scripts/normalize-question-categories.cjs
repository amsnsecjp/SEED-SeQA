const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

const FILES = [
  { varName: "QUESTIONS_EASY", file: "questions_easy.js" },
  { varName: "QUESTIONS_NORMAL", file: "questions_normal.js" },
  { varName: "QUESTIONS_HARD", file: "questions_hard.js" },
  { varName: "QUESTIONS_EXPERT", file: "questions_expert.js" }
];

const CATEGORY_MAP = {
  "AI活用": "情報モラル・リテラシー",
  "CIAの応用": "情報管理・個人情報",
  "OSS": "法務・知的財産・ガバナンス",
  "PC・端末管理": "端末・物理セキュリティ",
  "SNS": "メール・フィッシング・SNS",
  "SNSリテラシー": "メール・フィッシング・SNS",
  "USB・外部媒体": "端末・物理セキュリティ",
  "VPN": "ネットワーク・Web・クラウド",
  "Web技術": "ネットワーク・Web・クラウド",
  "Webセキュリティ": "マルウェア・攻撃手法",
  "アカウント管理": "アカウント・認証",
  "インシデント": "インシデント対応・運用",
  "インシデント対応": "インシデント対応・運用",
  "インシデント調査": "インシデント対応・運用",
  "インターネット": "ネットワーク・Web・クラウド",
  "ガバナンス": "法務・知的財産・ガバナンス",
  "クラウド": "ネットワーク・Web・クラウド",
  "クラウド利用": "ネットワーク・Web・クラウド",
  "サービス管理": "インシデント対応・運用",
  "システム運用": "インシデント対応・運用",
  "ストラテジ系": "法務・知的財産・ガバナンス",
  "ストレージ管理": "情報管理・個人情報",
  "スマホ・アプリ": "端末・物理セキュリティ",
  "スマホ・インターネット": "ネットワーク・Web・クラウド",
  "セキュリティ管理": "法務・知的財産・ガバナンス",
  "セキュリティ方針": "法務・知的財産・ガバナンス",
  "ソーシャルエンジニアリング": "メール・フィッシング・SNS",
  "ソフトウェア管理": "マルウェア・攻撃手法",
  "データ消去": "情報管理・個人情報",
  "デジタル署名": "暗号・署名・証明書",
  "テクノロジ系": "情報モラル・リテラシー",
  "トロイの木馬": "マルウェア・攻撃手法",
  "ネットトラブル": "情報モラル・リテラシー",
  "ネットワーク": "ネットワーク・Web・クラウド",
  "ネットワーク利用": "ネットワーク・Web・クラウド",
  "パスワード・認証": "アカウント・認証",
  "パスワード保護": "アカウント・認証",
  "パスワード設計": "アカウント・認証",
  "バックアップ管理": "インシデント対応・運用",
  "ハッシュ関数": "暗号・署名・証明書",
  "ファイアウォール": "ネットワーク・Web・クラウド",
  "フィッシング対策": "メール・フィッシング・SNS",
  "フィッシング詐欺": "メール・フィッシング・SNS",
  "プライバシー保護": "情報管理・個人情報",
  "プロトコル": "ネットワーク・Web・クラウド",
  "ボットネット": "マルウェア・攻撃手法",
  "マネジメント系": "インシデント対応・運用",
  "メール": "メール・フィッシング・SNS",
  "メール・SMS": "メール・フィッシング・SNS",
  "メール・連絡": "メール・フィッシング・SNS",
  "ランサムウェア": "マルウェア・攻撃手法",
  "リスク管理": "法務・知的財産・ガバナンス",
  "ログ管理": "インシデント対応・運用",
  "暗号・認証": "暗号・署名・証明書",
  "暗号の基礎": "暗号・署名・証明書",
  "暗号技術": "暗号・署名・証明書",
  "可用性": "インシデント対応・運用",
  "可用性設計": "インシデント対応・運用",
  "可用性対策": "インシデント対応・運用",
  "共通鍵暗号方式": "暗号・署名・証明書",
  "公開鍵暗号の応用": "暗号・署名・証明書",
  "公開鍵暗号方式": "暗号・署名・証明書",
  "攻撃手法": "マルウェア・攻撃手法",
  "権限管理": "アカウント・認証",
  "個人情報保護": "情報管理・個人情報",
  "情報システム": "インシデント対応・運用",
  "情報セキュリティの3要素": "情報管理・個人情報",
  "情報の特性": "情報管理・個人情報",
  "情報モラル": "情報モラル・リテラシー",
  "情報管理": "情報管理・個人情報",
  "情報資産管理": "情報管理・個人情報",
  "侵入検知": "インシデント対応・運用",
  "脆弱性管理": "マルウェア・攻撃手法",
  "脆弱性攻撃": "マルウェア・攻撃手法",
  "脆弱性対策": "マルウェア・攻撃手法",
  "多要素認証": "アカウント・認証",
  "端末管理": "端末・物理セキュリティ",
  "内部統制": "法務・知的財産・ガバナンス",
  "認証": "アカウント・認証",
  "認証管理": "アカウント・認証",
  "認証基盤": "暗号・署名・証明書",
  "認証局（CA）": "暗号・署名・証明書",
  "知的財産": "法務・知的財産・ガバナンス",
  "知的財産権": "法務・知的財産・ガバナンス",
  "不正アクセス禁止法": "法務・知的財産・ガバナンス",
  "不正ソフトウェア": "マルウェア・攻撃手法",
  "物理セキュリティ": "端末・物理セキュリティ",
  "防御技術": "マルウェア・攻撃手法",
  "無線LAN": "ネットワーク・Web・クラウド"
};

const NORMALIZED_CATEGORIES = new Set([
  "アカウント・認証",
  "情報管理・個人情報",
  "メール・フィッシング・SNS",
  "端末・物理セキュリティ",
  "ネットワーク・Web・クラウド",
  "マルウェア・攻撃手法",
  "暗号・署名・証明書",
  "インシデント対応・運用",
  "法務・知的財産・ガバナンス",
  "情報モラル・リテラシー"
]);

const ID_OVERRIDES = {
  E35: "情報管理・個人情報",
  E37: "マルウェア・攻撃手法",
  N28: "アカウント・認証",
  N32: "法務・知的財産・ガバナンス",
  H33: "情報モラル・リテラシー",
  H34: "ネットワーク・Web・クラウド",
  H35: "情報管理・個人情報",
  H36: "暗号・署名・証明書",
  H40: "ネットワーク・Web・クラウド",
  X07: "暗号・署名・証明書",
  X19: "ネットワーク・Web・クラウド"
};

function loadQuestions(varName, filePath) {
  let code = fs.readFileSync(filePath, "utf8");
  code = code.replace(new RegExp(`^const ${varName}\\s*=`), `${varName} =`);
  const sandbox = {};
  vm.runInNewContext(code, sandbox);
  return sandbox[varName] || [];
}

function normalizeCategory(question) {
  if (ID_OVERRIDES[question.id]) {
    return ID_OVERRIDES[question.id];
  }
  if (NORMALIZED_CATEGORIES.has(question.category)) {
    return question.category;
  }
  const normalized = CATEGORY_MAP[question.category];
  if (!normalized) {
    throw new Error(`No category mapping for ${question.id}: ${question.category}`);
  }
  return normalized;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const target of FILES) {
  const filePath = path.join(ROOT, "assets", "js", target.file);
  const questions = loadQuestions(target.varName, filePath);
  let source = fs.readFileSync(filePath, "utf8");

  for (const question of questions) {
    const category = normalizeCategory(question);
    const pattern = new RegExp(
      `(id:\\s*"${escapeRegExp(question.id)}",\\r?\\n\\s*category:\\s*)"[^"]+"`
    );
    if (!pattern.test(source)) {
      throw new Error(`Could not replace category for ${question.id} in ${target.file}`);
    }
    source = source.replace(pattern, `$1"${category}"`);
  }

  fs.writeFileSync(filePath, source, "utf8");
  console.log(`${target.file}: ${questions.length} categories normalized`);
}
