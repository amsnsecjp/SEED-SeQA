// ★ GASデプロイURL（デプロイ後にここを書き換える）
const GAS_URL = "https://script.google.com/macros/s/AKfycbyztqcAhYs8P9w5zFHZilV148TNZtiFl2rfkDRKITdXDrO7Fe9V2tzNznlIToCBEKAF4g/exec";
// ★ GAS側の Script Properties に設定したトークンと一致させる
const GAS_TOKEN = "CHANGE_ME_TO_A_STRONG_TOKEN";

function toHalfWidthAscii(value) {
    return String(value || "")
        .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/\u3000/g, " ");
}

function sanitizeAgentInputValue(value) {
    return toHalfWidthAscii(value)
        .replace(/\s+/g, "")
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, 9);
}

function resolveAgentName(value) {
    return sanitizeAgentInputValue(value) || "GUEST";
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getQuestionsByDifficulty(difficulty) {
    if (difficulty === "Easy") return QUESTIONS_EASY;
    if (difficulty === "Normal") return QUESTIONS_NORMAL;
    if (difficulty === "Hard") return QUESTIONS_HARD;
    if (difficulty === "Expert") return QUESTIONS_EXPERT;
    return QUESTIONS_EASY;
}

/** E01 / N10 / X59 などをプレフィックス→番号の昇順で比較 */
function compareQuestionId(idA, idB) {
    const sa = String(idA);
    const sb = String(idB);
    const mA = sa.match(/^([A-Za-z]+)(\d+)$/);
    const mB = sb.match(/^([A-Za-z]+)(\d+)$/);
    if (!mA || !mB) return sa.localeCompare(sb);
    const cmp = mA[1].toUpperCase().localeCompare(mB[1].toUpperCase());
    if (cmp !== 0) return cmp;
    return parseInt(mA[2], 10) - parseInt(mB[2], 10);
}

function lastGameIdsKey(difficulty) {
    return `last_game_question_ids_${difficulty}`;
}

function studySeenKey(difficulty) {
    return `study_seen_${difficulty}`;
}

function loadIdSet(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set();
    }
}

function saveIdSet(key, set) {
    localStorage.setItem(key, JSON.stringify([...set]));
}

function pickQuestionsForGame(allQuestions, difficulty) {
    const excludeKey = lastGameIdsKey(difficulty);
    let exclude = [];
    try {
        exclude = JSON.parse(localStorage.getItem(excludeKey) || "[]");
        if (!Array.isArray(exclude)) exclude = [];
    } catch {
        exclude = [];
    }
    let pool = allQuestions.filter((q) => !exclude.includes(q.id));
    if (pool.length < 10) {
        pool = allQuestions.slice();
    }
    return shuffleArray(pool).slice(0, 10);
}

/**
 * STUDY用の詳細解説（クイズ直後の解説は q.explanation のまま簡易）
 */
function buildStudyDetailText(q) {
    if (typeof STUDY_DETAILS !== "undefined" && STUDY_DETAILS && STUDY_DETAILS[q.id]) {
        return STUDY_DETAILS[q.id];
    }
    const wrong = (q.choices || []).filter((c) => c !== q.answer);
    const wrongPart = wrong.length
        ? wrong.map((w) => `「${w}」はこの設問の状況では不適切になりやすく、情報漏えい・手続き違反・被害拡大などのリスクが高まります。`).join("\n")
        : "";
    return `${q.explanation || ""}

【なぜ正解か】
正解「${q.answer}」は、設問の状況で最もリスクが低く、学校や組織のルール・セキュリティの基本に沿った選択です。

【誤答の見方】
${wrongPart || "（参考）他の選択肢は、確認不足や自己判断で問題が悪化しやすいです。"}

【整理のヒント】
分野は「${q.category || "一般"}」です。似た場面では「確認・報告・許可・最小権限」を意識すると選びやすくなります。`;
}

class SecurityGame {
    constructor() {
        this.questions = [];
        this.allQuestions = [];
        this.currentIndex = 0;
        this.score = 0;
        this.userAnswers = [];
        this.username = resolveAgentName(localStorage.getItem('agent_name')); // Load username
        this.difficulty = "Normal";
        this.timer = null;
        this.remainingTime = 180; // 3 minutes
        this.isPaused = false;
        this.studyDifficulty = "Easy";
        this.seqaLongPressTimer = null;

        // Removed explicit init() call from constructor to control timing
    }

    isHardUnlocked() {
        return localStorage.getItem("unlocked_hard") === "true";
    }

    isExpertChannelArmed() {
        return localStorage.getItem("expert_channel_armed") === "true";
    }

    setUsernameError(visible) {
        const err = document.getElementById("username-error");
        const input = document.getElementById("username-input");
        if (err) err.classList.toggle("hidden", !visible);
        if (input) {
            input.classList.toggle("input-invalid", visible);
            if (visible) {
                input.setAttribute("aria-invalid", "true");
            } else {
                input.removeAttribute("aria-invalid");
            }
        }
    }

    ensureAgentName() {
        const input = document.getElementById("username-input");
        const sanitized = input ? sanitizeAgentInputValue(input.value) : "";
        if (!sanitized) {
            this.setUsernameError(true);
            if (input) input.focus();
            return false;
        }
        this.setUsernameError(false);
        if (input) input.value = sanitized;
        this.username = sanitized;
        localStorage.setItem("agent_name", sanitized);
        return true;
    }

    armExpertChannel() {
        if (!this.isHardUnlocked()) return;
        localStorage.setItem("expert_channel_armed", "true");
        this.updateExpertChannelUI();
    }

    updateExpertChannelUI() {
        const letter = document.getElementById("seqa-trigger-e");
        const expertBtn = document.getElementById("btn-expert");
        const armed = this.isExpertChannelArmed() && this.isHardUnlocked();

        if (letter) {
            letter.classList.toggle("seqa-e-armed", armed);
        }
        if (expertBtn) {
            expertBtn.hidden = !armed;
            expertBtn.classList.toggle("hidden", !armed);
        }
    }

    tryStartExpert() {
        if (!this.isExpertChannelArmed() || !this.isHardUnlocked()) {
            return;
        }
        if (!this.ensureAgentName()) {
            return;
        }
        if (!confirm(
            "警告：ここから先は修羅の道。\n生半可な知識では太刀打ちできない...\n覚悟はいいか？"
        )) {
            return;
        }
        this.start("Expert");
    }

    bindSeqaLongPress() {
        const el = document.getElementById("seqa-trigger-e");
        if (!el) return;

        const LONG_MS = 1000;

        const beginHold = () => {
            if (!this.isHardUnlocked()) return;
            clearTimeout(this.seqaLongPressTimer);
            el.classList.add("seqa-e-holding");
            this.seqaLongPressTimer = setTimeout(() => {
                this.seqaLongPressTimer = null;
                el.classList.remove("seqa-e-holding");
                this.armExpertChannel();
            }, LONG_MS);
        };

        const endHold = () => {
            clearTimeout(this.seqaLongPressTimer);
            this.seqaLongPressTimer = null;
            el.classList.remove("seqa-e-holding");
        };

        el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            beginHold();
        });
        el.addEventListener("mouseup", endHold);
        el.addEventListener("mouseleave", endHold);
        el.addEventListener("touchstart", (e) => {
            beginHold();
        }, { passive: true });
        el.addEventListener("touchend", endHold);
        el.addEventListener("touchcancel", endHold);
        el.addEventListener("contextmenu", (e) => e.preventDefault());
    }

    init() {
        console.log("Initializing Game...");

        // Restore username if exists
        const input = document.getElementById('username-input');
        if (input) {
            input.maxLength = 9;
            input.value = this.username === "GUEST" ? "" : this.username;
        }

        // Load unlock state
        this.checkUnlocks();
        this.refreshStudyExpertTab();
        this.updateExpertChannelUI();

        // Bind Start Screen inputs
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.start('Easy');
                }
            });
            // Save username on change
            input.addEventListener('input', (e) => {
                const sanitized = sanitizeAgentInputValue(e.target.value);
                e.target.value = sanitized;
                if (sanitized) {
                    this.username = sanitized;
                    localStorage.setItem('agent_name', sanitized);
                    this.setUsernameError(false);
                } else {
                    this.username = "GUEST";
                    localStorage.removeItem('agent_name');
                }
            });
        }

        this.bindUiActions();
        this.bindSeqaLongPress();

        // Cheat Code: Click Title 10 times
        let titleClicks = 0;
        const brandTitle = document.querySelector('.brand');
        if (brandTitle) {
            brandTitle.style.cursor = 'pointer';
            brandTitle.addEventListener('click', () => {
                titleClicks++;
                console.log("Debug Click:", titleClicks);
                if (titleClicks >= 10) {
                    localStorage.setItem('unlocked_normal', 'true');
                    localStorage.setItem('unlocked_hard', 'true');
                    console.log("Debug: All unlocked");
                    this.checkUnlocks();
                    alert("DEBUG MODE: ALL LEVELS UNLOCKED");
                    titleClicks = 0;
                }
            });
        }
    }

    bindUiActions() {
        const difficultyButtons = document.querySelectorAll('[data-difficulty]');
        difficultyButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const difficulty = btn.getAttribute('data-difficulty');
                if (!difficulty) return;
                if (difficulty === "Expert") {
                    this.tryStartExpert();
                    return;
                }
                this.start(difficulty);
            });
        });

        const bind = (id, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handler);
        };

        bind('btn-reset-progress', () => this.resetProgress());
        bind('btn-pause', () => this.pauseGame());
        bind('btn-resume', () => this.resumeGame());
        bind('btn-next-case', () => this.nextQuestion());
        bind('btn-download-log', () => this.downloadLog());
        bind('btn-abort', () => location.reload());
        bind('btn-back-top', () => location.reload());
        bind("btn-study", () => this.openStudy());
        bind("btn-study-back", () => this.closeStudy());

        document.querySelectorAll("[data-study-diff]").forEach((tab) => {
            tab.addEventListener("click", () => {
                if (tab.disabled) return;
                const d = tab.getAttribute("data-study-diff");
                if (!d) return;
                this.studyDifficulty = d;
                document.querySelectorAll("[data-study-diff]").forEach((t) => t.classList.remove("active"));
                tab.classList.add("active");
                this.renderStudyList();
            });
        });
    }

    refreshStudyExpertTab() {
        const tab = document.getElementById("study-tab-expert");
        if (!tab) return;
        if (localStorage.getItem("cleared_expert") === "true" && localStorage.getItem("expert_played_once") !== "true") {
            localStorage.setItem("expert_played_once", "true");
        }
        const unlocked = localStorage.getItem("expert_played_once") === "true";
        if (unlocked) {
            tab.hidden = false;
            tab.removeAttribute("aria-hidden");
            tab.classList.remove("study-tab--secret");
            tab.disabled = false;
        } else {
            tab.hidden = true;
            tab.setAttribute("aria-hidden", "true");
            tab.classList.add("study-tab--secret");
        }
    }

    openStudy() {
        this.refreshStudyExpertTab();
        this.studyDifficulty = "Easy";
        document.querySelectorAll("[data-study-diff]").forEach((t) => {
            t.classList.toggle("active", t.getAttribute("data-study-diff") === "Easy");
        });
        this.showScreen("screen-study");
        this.renderStudyList();
    }

    closeStudy() {
        this.showScreen("screen-start");
    }

    renderStudyList() {
        const container = document.getElementById("study-list");
        if (!container) return;

        const diff = this.studyDifficulty;
        if (diff === "Expert" && localStorage.getItem("expert_played_once") !== "true") {
            this.studyDifficulty = "Easy";
            document.querySelectorAll("[data-study-diff]").forEach((t) => {
                t.classList.toggle("active", t.getAttribute("data-study-diff") === "Easy");
            });
        }

        const bank = getQuestionsByDifficulty(this.studyDifficulty);
        const seen = loadIdSet(studySeenKey(this.studyDifficulty));
        const sorted = bank.slice().sort((a, b) => compareQuestionId(a.id, b.id));

        container.textContent = "";

        sorted.forEach((q) => {
            if (!seen.has(q.id)) {
                const card = document.createElement("article");
                card.className = "study-card";

                const head = document.createElement("div");
                head.className = "study-card-head";
                const idSpan = document.createElement("span");
                idSpan.className = "study-id";
                idSpan.textContent = q.id;
                const catSpan = document.createElement("span");
                catSpan.className = "study-cat";
                catSpan.textContent = q.category || "";
                head.appendChild(idSpan);
                head.appendChild(catSpan);
                card.appendChild(head);

                const body = document.createElement("div");
                body.className = "study-card-body study-card-body--locked";
                body.textContent = "？？";
                card.appendChild(body);

                container.appendChild(card);
                return;
            }

            const wrap = document.createElement("article");
            wrap.className = "study-card study-card--unlocked";

            const details = document.createElement("details");
            details.className = "study-card-details";

            const summary = document.createElement("summary");
            summary.className = "study-card-summary";

            const head = document.createElement("div");
            head.className = "study-card-head";
            const idSpan = document.createElement("span");
            idSpan.className = "study-id";
            idSpan.textContent = q.id;
            const catSpan = document.createElement("span");
            catSpan.className = "study-cat";
            catSpan.textContent = q.category || "";
            head.appendChild(idSpan);
            head.appendChild(catSpan);

            const qBlock = document.createElement("p");
            qBlock.className = "study-q study-q--only";
            qBlock.textContent = q.text;

            const hint = document.createElement("p");
            hint.className = "study-open-hint";
            hint.textContent = "クリックで選択肢・正解・解説を表示";

            summary.appendChild(head);
            summary.appendChild(qBlock);
            summary.appendChild(hint);

            const inner = document.createElement("div");
            inner.className = "study-expand-inner";

            const chLabel = document.createElement("div");
            chLabel.className = "study-label";
            chLabel.textContent = "選択肢";
            const ul = document.createElement("ul");
            ul.className = "study-choices";
            (q.choices || []).forEach((c) => {
                const li = document.createElement("li");
                li.textContent = c;
                if (c === q.answer) li.classList.add("study-ans-mark");
                ul.appendChild(li);
            });

            const ansLine = document.createElement("p");
            ansLine.className = "study-answer-line";
            const strong = document.createElement("strong");
            strong.textContent = "正解：";
            ansLine.appendChild(strong);
            ansLine.appendChild(document.createTextNode(q.answer || ""));

            const detLabel = document.createElement("div");
            detLabel.className = "study-label";
            detLabel.textContent = "解説（詳細）";
            const det = document.createElement("div");
            det.className = "study-detail-text";
            det.textContent = buildStudyDetailText(q);

            inner.appendChild(chLabel);
            inner.appendChild(ul);
            inner.appendChild(ansLine);
            inner.appendChild(detLabel);
            inner.appendChild(det);

            details.appendChild(summary);
            details.appendChild(inner);
            wrap.appendChild(details);
            container.appendChild(wrap);
        });
    }

    checkUnlocks() {
        // LocalStorage keys: 'unlocked_normal', 'unlocked_hard'
        const unlockedNormal = localStorage.getItem('unlocked_normal') === 'true';
        const unlockedHard = localStorage.getItem('unlocked_hard') === 'true';
        const clearedExpert = localStorage.getItem('cleared_expert') === 'true';

        console.log("Checking Unlocks:", { unlockedNormal, unlockedHard, clearedExpert });

        const btnNormal = document.getElementById('btn-normal');
        const btnHard = document.getElementById('btn-hard');

        if (unlockedNormal) {
            btnNormal.disabled = false;
            btnNormal.innerHTML = "NORMAL";
            btnNormal.classList.remove('locked');
        } else {
            btnNormal.disabled = true;
            btnNormal.innerHTML = "NORMAL 🔒";
            btnNormal.classList.add('locked');
        }

        if (unlockedHard) {
            btnHard.disabled = false;
            btnHard.innerHTML = "HARD";
            btnHard.classList.remove('locked');
        } else {
            btnHard.disabled = true;
            btnHard.innerHTML = "HARD 🔒";
            btnHard.classList.add('locked');
        }

        this.updateExpertChannelUI();

        // Badge Check
        const brand = document.querySelector('.brand');
        const existingBadge = document.querySelector('.badge');
        if (clearedExpert && !existingBadge && brand) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = "EXPERT AGENT";
            brand.appendChild(badge);
        }
    }

    resetProgress() {
        if (confirm("進行状況をリセットしますか？ (Reset progress?)")) {
            console.log("Resetting data...");
            localStorage.clear();
            location.reload();
        }
    }

    start(difficulty) {
        if (!this.ensureAgentName()) {
            return;
        }
        this.difficulty = difficulty;

        // Reset Theme
        document.body.classList.remove('theme-expert');

        // Select Data based on Difficulty
        if (this.difficulty === 'Easy') {
            this.allQuestions = QUESTIONS_EASY;
            this.remainingTime = 180;
        } else if (this.difficulty === 'Normal') {
            this.allQuestions = QUESTIONS_NORMAL;
            this.remainingTime = 180;
        } else if (this.difficulty === 'Hard') {
            this.allQuestions = QUESTIONS_HARD;
            this.remainingTime = 180;
        } else if (this.difficulty === 'Expert') {
            this.allQuestions = QUESTIONS_EXPERT;
            this.remainingTime = 90; // 1:30
            document.body.classList.add('theme-expert');
            localStorage.setItem("expert_played_once", "true");
        } else {
            this.allQuestions = QUESTIONS_EASY; // Fallback
        }

        document.getElementById('user-display').textContent = `AGENT: ${this.username} | MODE: ${this.difficulty.toUpperCase()}`;
        this.showScreen('screen-game');

        this.currentIndex = 0;
        this.score = 0;
        this.userAnswers = [];

        // Reset Timer (Using remainingTime set above)
        this.startTimer();

        this.questions = pickQuestionsForGame(this.allQuestions, this.difficulty);

        this.showQuestion();
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.remove('hidden');
    }

    startTimer() {
        this.stopTimer();
        this.updateTimerDisplay();
        this.timer = setInterval(() => {
            if (!this.isPaused) {
                this.remainingTime--;
                this.updateTimerDisplay();
                if (this.remainingTime <= 0) {
                    this.stopTimer();
                    this.endGame(true); // Time out
                }
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    updateTimerDisplay() {
        const minutes = Math.floor(this.remainingTime / 60);
        const seconds = this.remainingTime % 60;
        document.getElementById('timer-text').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    pauseGame() {
        this.isPaused = true;
        document.getElementById('pause-overlay').classList.remove('hidden');
    }

    resumeGame() {
        this.isPaused = false;
        document.getElementById('pause-overlay').classList.add('hidden');
    }

    showQuestion() {
        const q = this.questions[this.currentIndex];

        const seenKey = studySeenKey(this.difficulty);
        const seen = loadIdSet(seenKey);
        seen.add(q.id);
        saveIdSet(seenKey, seen);

        // Update Info
        document.getElementById('progress-text').textContent = `CASE: ${String(this.currentIndex + 1).padStart(2, '0')} / ${String(this.questions.length).padStart(2, '0')}`;
        document.getElementById('score-text').textContent = `${this.score}`;
        document.getElementById('category-text').textContent = `CAT: ${q.category || 'GENERAL'}`;
        document.getElementById('question-text').textContent = q.text;

        // Generate Choices
        const container = document.getElementById('choices-container');
        container.innerHTML = ''; // Clear old buttons

        // Reset classes
        container.className = 'choices-grid';
        if (q.choices.length === 2) {
            container.classList.add('grid-2');
        } else {
            container.classList.add('grid-3');
        }

        const displayChoices = shuffleArray(q.choices);
        q._displayChoices = displayChoices;

        const colorClasses2 = ["choice-green", "choice-red"];
        const colorClasses3 = ["choice-green", "choice-yellow", "choice-red"];

        displayChoices.forEach((choiceText, index) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';

            const colorCls =
                displayChoices.length === 2
                    ? colorClasses2[index] || "choice-green"
                    : colorClasses3[index] || "choice-red";
            btn.classList.add(colorCls);

            const choiceSpan = document.createElement('span');
            choiceSpan.className = 'choice-text';
            choiceSpan.textContent = choiceText;
            btn.appendChild(choiceSpan);
            btn.onclick = () => this.submitAnswer(choiceText);

            container.appendChild(btn);
        });

        // Hide feedback
        document.getElementById('feedback-overlay').classList.add('hidden');
    }

    submitAnswer(choice) {
        if (this.isPaused) return;

        const q = this.questions[this.currentIndex];
        const isCorrect = choice === q.answer;

        // Score logic
        const pointsPerQ = Math.floor(100 / this.questions.length);
        if (isCorrect) {
            this.score += pointsPerQ;
        }

        // Record log
        this.userAnswers.push({
            qId: q.id,
            category: q.category,
            question: q.text,
            userChoice: choice,
            correctAnswer: q.answer,
            isCorrect: isCorrect,
            explanation: q.explanation,
            timestamp: new Date().toISOString()
        });

        this.showFeedback(isCorrect, q, choice);
    }

    showFeedback(isCorrect, q, userChoice) {
        const fbOverlay = document.getElementById('feedback-overlay');
        const fbTitle = document.getElementById('fb-title');

        fbOverlay.classList.remove('hidden');
        const fbMark = document.getElementById("fb-mark");
        if (isCorrect) {
            fbTitle.textContent = "CORRECT";
            fbTitle.className = "feedback-title correct";
            if (fbMark) {
                fbMark.textContent = "〇";
                fbMark.className = "feedback-mark feedback-mark--ok";
            }
        } else {
            fbTitle.textContent = "INCORRECT";
            fbTitle.className = "feedback-title incorrect";
            if (fbMark) {
                fbMark.textContent = "×";
                fbMark.className = "feedback-mark feedback-mark--ng";
            }
        }

        const fbQ = document.getElementById("fb-q-text");
        const fbList = document.getElementById("fb-choices-list");
        const fbYours = document.getElementById("fb-your-answer");
        const fbCorrect = document.getElementById("fb-correct-answer");
        const fbShort = document.getElementById("fb-short-exp");

        fbQ.textContent = q.text || "";
        fbList.textContent = "";
        const choiceOrder = q._displayChoices || q.choices;
        choiceOrder.forEach((c) => {
            const li = document.createElement("li");
            li.textContent = c;
            if (c === userChoice) li.classList.add("fb-choice--picked");
            if (c === q.answer) li.classList.add("fb-choice--answer");
            fbList.appendChild(li);
        });

        fbYours.textContent = userChoice || "—";
        fbCorrect.textContent = q.answer || "—";
        fbShort.textContent = q.explanation || "";
    }

    nextQuestion() {
        this.currentIndex++;
        if (this.currentIndex < this.questions.length) {
            this.showQuestion();
        } else {
            this.endGame();
        }
    }

    endGame(isTimeout = false) {
        this.stopTimer();
        try {
            localStorage.setItem(
                lastGameIdsKey(this.difficulty),
                JSON.stringify(this.questions.map((q) => q.id))
            );
        } catch (e) {
            console.warn("last game ids save failed", e);
        }
        document.getElementById('feedback-overlay').classList.add('hidden');
        this.showScreen('screen-result');

        const scoreEl = document.getElementById('final-score');
        const rankEl = document.getElementById('final-rank');
        const msgEl = document.getElementById('final-msg');

        scoreEl.textContent = this.score;

        let rank = 'D';
        let rankClass = 'rank-d';

        // Rank Logic
        if (this.score === 100) {
            rank = 'Ｓ';
            rankClass = 'rank-s';
        } else if (this.score >= 80) {
            rank = 'Ａ';
            rankClass = 'rank-a';
        } else if (this.score >= 60) {
            rank = 'Ｂ';
            rankClass = 'rank-b';
        } else if (this.score >= 40) {
            rank = 'Ｃ';
            rankClass = 'rank-c';
        } else {
            rank = 'Ｄ';
            rankClass = 'rank-d';
        }

        // Apply
        rankEl.textContent = rank;
        rankEl.className = `rank-large ${rankClass}`;
        scoreEl.textContent = this.score;

        // Message Logic
        if (isTimeout || this.score <= 70) {
            msgEl.textContent = "MISSION FAILED";
            msgEl.style.color = "var(--danger)";
        } else {
            msgEl.textContent = "MISSION COMPLETED";
            msgEl.style.color = "var(--secondary)"; // Green/Success
        }

        // UNLOCK HINTS & LOGIC (Updated)
        if (this.difficulty === 'Hard') {
            if (this.score === 100) {
                msgEl.innerHTML = (msgEl.innerHTML || "") + "<br><br><em>タイトルの「e」を長押しすると、別の道が開くかもしれない…</em>";
            } else if (this.score <= 90) {
                msgEl.innerHTML = (msgEl.innerHTML || "") + "<br><br><em>HARD100点を極めし者は新たな道が開かれん...</em>";
            }
        }

        // Unlock Logic
        console.log("Checking Score for Unlock:", this.score);
        if (this.score >= 90) {
            if (this.difficulty === 'Easy') {
                localStorage.setItem('unlocked_normal', 'true');
                console.log("Unlocked Normal!");
                msgEl.textContent += " [NORMAL MODE UNLOCKED]";
            } else if (this.difficulty === 'Normal') {
                localStorage.setItem('unlocked_hard', 'true');
                console.log("Unlocked Hard!");
                msgEl.textContent += " [HARD MODE UNLOCKED]";
            } else if (this.difficulty === 'Expert') {
                localStorage.setItem('cleared_expert', 'true');
                msgEl.textContent += " [EXPERT BADGE ACQUIRED]";
            }
        }

        this.renderReviewList();
        this.sendLog(isTimeout);
    }

    sendLog(isTimeout = false) {
        if (GAS_URL === "YOUR_GAS_DEPLOY_URL_HERE") {
            console.warn("GAS_URL未設定: ログ送信スキップ");
            return;
        }

        const resultText = (isTimeout || this.score <= 70) ? "MISSION FAILED" : "MISSION COMPLETED";

        const payload = {
            agent: this.username,
            difficulty: this.difficulty,
            score: this.score,
            result: resultText,
            token: GAS_TOKEN,
            questions: this.userAnswers.map((ans) => ({
                id: ans.qId,
                category: ans.category || "",
                correct: ans.isCorrect,
                choice: ans.userChoice || ""
            }))
        };

        fetch(GAS_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(() => console.log("ログ送信完了"))
        .catch(err => console.error("ログ送信エラー:", err));
    }

    renderReviewList() {
        const container = document.getElementById('review-list');
        container.textContent = '';
        const title = document.createElement('h3');
        title.textContent = 'MISON DEBRIEFING';
        container.appendChild(title);

        this.userAnswers.forEach((ans, index) => {
            const item = document.createElement('div');
            item.className = 'review-item';
            item.classList.add(ans.isCorrect ? 'review-correct' : 'review-incorrect');

            const header = document.createElement('div');
            header.className = 'review-header';

            const qNum = document.createElement('span');
            qNum.className = 'review-q-num';
            qNum.textContent = `Q${index + 1} [${ans.category}]`;

            const status = document.createElement('span');
            status.className = 'review-status';
            status.textContent = ans.isCorrect ? 'O' : 'X';

            header.appendChild(qNum);
            header.appendChild(status);

            const body = document.createElement('div');
            body.className = 'review-body';

            const reviewText = document.createElement('p');
            reviewText.className = 'review-text';
            reviewText.textContent = ans.question;

            const reviewAns = document.createElement('div');
            reviewAns.className = 'review-ans';

            const yours = document.createElement('span');
            yours.textContent = `YOURS: ${ans.userChoice}`;

            const correct = document.createElement('span');
            correct.textContent = `Orbit: ${ans.correctAnswer}`;

            reviewAns.appendChild(yours);
            reviewAns.appendChild(correct);
            body.appendChild(reviewText);
            body.appendChild(reviewAns);
            item.appendChild(header);
            item.appendChild(body);
            container.appendChild(item);
        });
    }

    downloadLog() {
        const lines = [];
        lines.push(`SECURITY TRAINING LOG`);
        lines.push(`=====================`);
        lines.push(`Date: ${new Date().toLocaleString()}`);
        lines.push(`Agent: ${this.username}`);
        lines.push(`Difficulty: ${this.difficulty}`);
        lines.push(`Score: ${this.score} / 100`);
        lines.push(`Result: ${document.getElementById('final-msg').textContent}`);
        lines.push(`---------------------`);

        this.userAnswers.forEach((ans, idx) => {
            lines.push(`[Q${idx + 1}] ID:${ans.qId} (${ans.category}) - ${ans.isCorrect ? "CORRECT" : "WRONG"}`);
            lines.push(`Question: ${ans.question}`);
            lines.push(`Your Answer: ${ans.userChoice}`);
            lines.push(`Correct Answer: ${ans.correctAnswer}`);
            lines.push(`Explanation: ${ans.explanation}`);
            lines.push(``);
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `security_log_${this.username}_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new SecurityGame();
    window.game.init();
});
