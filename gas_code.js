/**
 * SeQA ログ収集用 Google Apps Script
 *
 * 【設置手順】
 * 1. Google Spreadsheet を新規作成
 * 2. 拡張機能 → Apps Script を開く
 * 3. このコードを貼り付けて保存
 * 4. デプロイ → 新しいデプロイ → ウェブアプリ
 *    - 実行するユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 5. 発行されたURLをコピーして game.js の GAS_URL に設定
 * 6. ログはスプレッドシート内のシート「Latest」に追記（無ければ自動作成）
 */

var LOG_SHEET_NAME = "Latest";

var TOP_LEVEL_ALLOWED_KEYS = {
  agent: true,
  difficulty: true,
  score: true,
  result: true,
  token: true,
  timestamp: true,
  questions: true
};

var QUESTION_ALLOWED_KEYS = {
  id: true,
  category: true,
  correct: true,
  choice: true
};

var ALLOWED_RESULTS = {
  "MISSION FAILED": true,
  "MISSION COMPLETED": true
};

/* Easy: E01–E45 / Normal: N01–N40 / Hard: H01–H40 / Expert: X01–X40 + 旧ログ用 */
var ALLOWED_QUESTION_IDS = {
  E01: true, E02: true, E03: true, E04: true, E05: true, E06: true, E07: true, E08: true, E09: true,
  E10: true, E11: true, E12: true, E13: true, E14: true, E15: true, E16: true, E17: true, E18: true,
  E19: true, E20: true, E21: true, E22: true, E23: true, E24: true, E25: true, E26: true, E27: true,
  E28: true, E29: true, E30: true, E31: true, E32: true, E33: true, E34: true, E35: true, E36: true, E37: true, E38: true,
  E39: true, E40: true, E41: true, E42: true, E43: true, E44: true, E45: true,
  N01: true, N02: true, N03: true, N04: true, N05: true, N06: true, N07: true, N08: true, N09: true,
  N10: true, N11: true, N12: true, N13: true, N14: true, N15: true, N16: true, N17: true, N18: true,
  N19: true, N20: true, N21: true, N22: true, N23: true, N24: true, N25: true, N26: true, N27: true,
  N28: true, N29: true, N30: true, N31: true, N32: true, N33: true, N34: true, N35: true, N36: true, N37: true, N38: true,
  N39: true, N40: true,
  H01: true, H02: true, H03: true, H04: true, H05: true, H06: true, H07: true, H08: true, H09: true,
  H10: true, H11: true, H12: true, H13: true, H14: true, H15: true, H16: true, H17: true, H18: true,
  H19: true, H20: true, H21: true, H22: true, H23: true, H24: true, H25: true, H26: true, H27: true, H28: true, H29: true,
  H30: true, H31: true, H32: true, H33: true, H34: true, H35: true, H36: true, H37: true, H38: true, H39: true, H40: true,
  H41: true, H42: true, H43: true, H44: true,
  X01: true, X02: true, X03: true, X04: true, X05: true, X06: true, X07: true, X08: true, X09: true,
  X10: true, X11: true, X12: true, X13: true, X14: true, X15: true, X16: true, X17: true, X18: true, X19: true, X20: true,
  X21: true, X22: true, X23: true, X24: true, X25: true, X26: true, X27: true, X28: true, X29: true, X30: true, X31: true,
  X32: true, X33: true, X34: true, X35: true, X36: true, X37: true, X38: true, X39: true, X40: true,
  X41: true, X42: true, X43: true, X44: true, X45: true, X46: true, X47: true, X48: true, X49: true, X50: true, X51: true,
  X52: true, X53: true, X54: true, X55: true, X56: true, X57: true, X58: true, X59: true
};

function getLogHeaders() {
  return [
    "タイムスタンプ", "名前", "難易度", "スコア",
    "Q1_ID", "Q1_Category", "Q1_正誤", "Q1_選択",
    "Q2_ID", "Q2_Category", "Q2_正誤", "Q2_選択",
    "Q3_ID", "Q3_Category", "Q3_正誤", "Q3_選択",
    "Q4_ID", "Q4_Category", "Q4_正誤", "Q4_選択",
    "Q5_ID", "Q5_Category", "Q5_正誤", "Q5_選択",
    "Q6_ID", "Q6_Category", "Q6_正誤", "Q6_選択",
    "Q7_ID", "Q7_Category", "Q7_正誤", "Q7_選択",
    "Q8_ID", "Q8_Category", "Q8_正誤", "Q8_選択",
    "Q9_ID", "Q9_Category", "Q9_正誤", "Q9_選択",
    "Q10_ID", "Q10_Category", "Q10_正誤", "Q10_選択"
  ];
}

function ensureLogHeaders(sheet) {
  var headers = getLogHeaders();
  var width = headers.length;
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
    return;
  }
  var firstCell = String(sheet.getRange(1, 1).getValue() || "");
  if (firstCell !== "タイムスタンプ") {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
  }
}

function getLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET_NAME);
  }
  return sheet;
}

function doPost(e) {
  try {
    var sheet = getLogSheet();
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Invalid request body");
    }

    var data = JSON.parse(e.postData.contents);
    validatePayload(data);

    ensureLogHeaders(sheet);

    var row = [
      sanitizeCell(resolveTimestamp(data)),
      sanitizeCell(data.agent),
      sanitizeCell(data.difficulty),
      sanitizeCell(data.score)
    ];

    var questions = data.questions || [];
    for (var i = 0; i < 10; i++) {
      if (i < questions.length) {
        row.push(sanitizeCell(questions[i].id));
        row.push(sanitizeCell(questions[i].category));
        row.push(sanitizeCell(questions[i].correct ? "O" : "X"));
        row.push(sanitizeCell(questions[i].choice));
      } else {
        row.push("");
        row.push("");
        row.push("");
        row.push("");
      }
    }

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getExpectedToken() {
  // Set this in Apps Script: Project Settings -> Script properties
  // Key: GAME_API_TOKEN, Value: same as GAS_TOKEN in game.js
  var configured = PropertiesService.getScriptProperties().getProperty("GAME_API_TOKEN");
  return configured || "";
}

function sanitizeCell(value) {
  var text = value == null ? "" : String(value);
  // Prevent spreadsheet formula injection.
  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }
  return text;
}

function getServerTimestamp() {
  var tz = Session.getScriptTimeZone();
  if (!tz) {
    tz = "Asia/Tokyo";
  }
  return Utilities.formatDate(new Date(), tz, "yyyy/MM/dd HH:mm:ss");
}

function resolveTimestamp(data) {
  if (data && typeof data.timestamp === "string" && data.timestamp.length > 0) {
    var parsed = new Date(data.timestamp);
    if (!isNaN(parsed.getTime())) {
      var tz = Session.getScriptTimeZone();
      if (!tz) {
        tz = "Asia/Tokyo";
      }
      return Utilities.formatDate(parsed, tz, "yyyy/MM/dd HH:mm:ss");
    }
  }
  return getServerTimestamp();
}

function toHalfWidthAscii(value) {
  return String(value == null ? "" : value)
    .replace(/[\uFF01-\uFF5E]/g, function(ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    })
    .replace(/\u3000/g, " ");
}

function normalizeAgent(value) {
  return toHalfWidthAscii(value)
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 9);
}

function assertAllowedKeys(obj, allowedKeys, label) {
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    if (!allowedKeys[keys[i]]) {
      throw new Error("Unexpected " + label + " field");
    }
  }
}

function validatePayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Payload must be an object");
  }

  assertAllowedKeys(data, TOP_LEVEL_ALLOWED_KEYS, "payload");

  var allowedDifficulty = { Easy: true, Normal: true, Hard: true, Expert: true };
  if (!allowedDifficulty[data.difficulty]) {
    throw new Error("Invalid difficulty");
  }

  data.agent = normalizeAgent(data.agent);
  if (!/^[A-Za-z0-9_-]{1,9}$/.test(data.agent)) {
    throw new Error("Invalid agent");
  }

  if (typeof data.result !== "string" || !ALLOWED_RESULTS[data.result]) {
    throw new Error("Invalid result");
  }

  if (typeof data.score !== "number" || !isFinite(data.score) || Math.floor(data.score) !== data.score || data.score < 0 || data.score > 100 || data.score % 10 !== 0) {
    throw new Error("Invalid score");
  }

  var expectedToken = getExpectedToken();
  if (!expectedToken) {
    throw new Error("Server token is not configured");
  }
  if (typeof data.token !== "string" || data.token !== expectedToken) {
    throw new Error("Invalid token");
  }

  if (data.timestamp != null) {
    if (typeof data.timestamp !== "string" || data.timestamp.length > 40) {
      throw new Error("Invalid timestamp");
    }
  }

  if (!Array.isArray(data.questions) || data.questions.length > 10) {
    throw new Error("Invalid questions");
  }

  var correctCount = 0;
  var seenIds = {};
  for (var i = 0; i < data.questions.length; i++) {
    var q = data.questions[i];
    if (!q || typeof q !== "object") {
      throw new Error("Invalid question item");
    }
    assertAllowedKeys(q, QUESTION_ALLOWED_KEYS, "question item");
    if (typeof q.id !== "string" || !ALLOWED_QUESTION_IDS[q.id]) {
      throw new Error("Invalid question id");
    }
    if (seenIds[q.id]) {
      throw new Error("Duplicate question id");
    }
    seenIds[q.id] = true;
    if (typeof q.correct !== "boolean") {
      throw new Error("Invalid question correctness");
    }
    if (q.category == null) {
      q.category = "";
    }
    if (typeof q.category !== "string" || q.category.length > 80) {
      throw new Error("Invalid question category");
    }
    if (q.choice == null) {
      q.choice = "";
    }
    if (typeof q.choice !== "string" || q.choice.length > 200) {
      throw new Error("Invalid question choice");
    }
    q.category = String(q.category);
    q.choice = String(q.choice);
    if (q.correct) {
      correctCount++;
    }
  }

  if (data.score !== correctCount * 10) {
    throw new Error("Score does not match answers");
  }
}
