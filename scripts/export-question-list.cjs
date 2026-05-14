const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "exports");

const DIFFICULTIES = [
  { label: "EASY", varName: "QUESTIONS_EASY", file: "questions_easy.js" },
  { label: "NORMAL", varName: "QUESTIONS_NORMAL", file: "questions_normal.js" },
  { label: "HARD", varName: "QUESTIONS_HARD", file: "questions_hard.js" },
  { label: "EXPERT", varName: "QUESTIONS_EXPERT", file: "questions_expert.js" }
];

function loadQuestions(varName, fileName) {
  const filePath = path.join(ROOT, "assets", "js", fileName);
  let code = fs.readFileSync(filePath, "utf8");
  code = code.replace(new RegExp(`^const ${varName}\\s*=`), `${varName} =`);
  const sandbox = {};
  vm.runInNewContext(code, sandbox);
  return sandbox[varName] || [];
}

function csvEscape(value) {
  const text = String(value == null ? "" : value).replace(/\r?\n/g, " ");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function sortById(questions) {
  return questions.slice().sort((a, b) => {
    const pa = String(a.id || "").match(/^([A-Z]+)(\d+)$/);
    const pb = String(b.id || "").match(/^([A-Z]+)(\d+)$/);
    if (!pa || !pb) return String(a.id).localeCompare(String(b.id));
    if (pa[1] !== pb[1]) return pa[1].localeCompare(pb[1]);
    return Number(pa[2]) - Number(pb[2]);
  });
}

function padRight(text, width) {
  const s = String(text);
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

function buildTextTable(difficulty, questions) {
  const lines = [];
  lines.push(`=== ${difficulty} (${questions.length}問) ===`);
  lines.push("");
  lines.push(`${padRight("ID", 6)}${padRight("カテゴリ", 16)}問題文`);
  lines.push("-".repeat(100));
  for (const q of questions) {
    lines.push(`${padRight(q.id, 6)}${padRight(q.category || "", 16)}${q.text || ""}`);
  }
  lines.push("");
  return lines.join("\n");
}

function writeFileWithFallback(filePath, contents) {
  try {
    fs.writeFileSync(filePath, contents, "utf8");
    return filePath;
  } catch (error) {
    if (error.code !== "EBUSY" && error.code !== "EPERM") {
      throw error;
    }
    const parsed = path.parse(filePath);
    const fallbackPath = path.join(parsed.dir, `${parsed.name}_new${parsed.ext}`);
    fs.writeFileSync(fallbackPath, contents, "utf8");
    return fallbackPath;
  }
}

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const allRows = [["難易度", "問題ID", "カテゴリ", "問題文"]];
const textParts = [];

for (const diff of DIFFICULTIES) {
  const questions = sortById(loadQuestions(diff.varName, diff.file));
  const rows = [["問題ID", "カテゴリ", "問題文"]];
  for (const q of questions) {
    rows.push([q.id, q.category || "", q.text || ""]);
    allRows.push([diff.label, q.id, q.category || "", q.text || ""]);
  }

  const csv = "\uFEFF" + toCsv(rows);
  const csvPath = path.join(OUT_DIR, `questions_${diff.label.toLowerCase()}.csv`);
  const writtenCsvPath = writeFileWithFallback(csvPath, csv);

  const text = buildTextTable(diff.label, questions);
  const txtPath = path.join(OUT_DIR, `questions_${diff.label.toLowerCase()}.txt`);
  writeFileWithFallback(txtPath, text);

  textParts.push(text);
  console.log(`${diff.label}: ${questions.length}問 -> ${path.basename(writtenCsvPath)}`);
}

const allCsv = "\uFEFF" + toCsv(allRows);
const allCsvPath = path.join(OUT_DIR, "questions_all.csv");
const writtenAllCsvPath = writeFileWithFallback(allCsvPath, allCsv);

const allTxtPath = path.join(OUT_DIR, "questions_all.txt");
writeFileWithFallback(allTxtPath, textParts.join("\n"));

console.log(`ALL: ${allRows.length - 1}問 -> ${path.basename(writtenAllCsvPath)}`);
