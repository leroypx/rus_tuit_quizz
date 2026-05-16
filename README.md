# Quiz Platform

Lightweight quiz platform hosted on GitHub Pages. No frameworks, no build step — just HTML, CSS, and JS.

**[Live demo](https://leroypx.github.io/rus_tuit_quizz/index.html)**

---

## Pages

| Page | Description |
|---|---|
| `index.html` | Hub — subject cards with history and quick links |
| `quiz.html` | General quiz (Операционные системы, Экономическая безопасность, Физика 1) |
| `math-quiz.html` | Math quiz with calculus scoring (Математический анализ 1 & 2) |
| `editor.html` | Question viewer, editor, importer, and exporter |

---

## Data format

Questions live in `data/` as JSON arrays. Each subject is registered in `data/manifest.json`.

### Question object

```json
{
  "id": "q001",
  "Вопрос": "Текст вопроса, $формула$, или <img src='url'>",
  "A": "Вариант A",
  "B": "Вариант B",
  "C": "Вариант C",
  "D": "Вариант D",
  "Правильный ответ": "A",
  "Тип вопроса": "1"
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | Short unique key, e.g. `q001`. Used for progress tracking. |
| `Вопрос` | Yes | Question text. Supports plain text, `$LaTeX$`, `$$LaTeX$$`, and `<img>` HTML tags. |
| `A`–`D` | Yes | Answer options. Same content rules as `Вопрос`. |
| `Правильный ответ` | Yes | Correct answer key: `A`, `B`, `C`, or `D`. |
| `Тип вопроса` | No | Question type/category. Used for filtering in editor and score breakdown in math quiz. |

### manifest.json

```json
{
  "subjects": [
    {
      "id": "calculus1",
      "name": "Математический анализ 1",
      "type": "math",
      "file": "data/calculus1.json"
    }
  ]
}
```

`type` must be `"math"` (appears in `math-quiz.html`) or `"general"` (appears in `quiz.html`).

---

## Adding a new subject

1. Create `data/mysubject.json` with the question array.
2. Add an entry to `data/manifest.json`.
3. Done. The subject will appear on the index page and in the corresponding quiz page.

---

## Math scoring (calculus)

| Question type | Points |
|---|---|
| 1 – 6 | 6 points |
| 7 – 14 | 8 points |

Passing threshold in exam mode: **60 points**.

---

## Local development

GitHub Pages requires HTTP for `fetch()` — open `index.html` directly in a browser won't load subjects.

```bash
python -m http.server 8080
# then open http://localhost:8080
```

Or use the VS Code **Live Server** extension.

---

## Rich content in questions

Questions support mixed content in a single field:

```
Найдите предел: $\lim_{x \to 0} \frac{\sin x}{x}$ <img src='https://example.com/hint.png'>
```

- Inline LaTeX: `$...$`
- Display LaTeX: `$$...$$`
- Images: `<img src="url">`

LaTeX is rendered with [KaTeX](https://katex.org/).

---

## localStorage keys

| Key | Content |
|---|---|
| `quizzer_theme` | `"light"` or `"dark"` |
| `quizzer_settings_general` | Quiz settings for general mode |
| `quizzer_settings_math` | Quiz settings for math mode |
| `quizzer_history_[id]` | Last 3 quiz results per subject |
| `quizzer_answered_[id]` | Set of correctly answered question IDs per subject |



