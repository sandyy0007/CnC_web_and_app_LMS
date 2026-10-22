# 🚪 Read & Escape – Interactive Reading Challenge

An interactive, Python-based reading comprehension and escape room game developed as part of the **Soft Skills LMS** project. The game combines reading challenges with an escape room experience, helping students improve their comprehension, vocabulary, critical thinking, and decision-making skills.

## 📌 Project Overview

**Read & Escape** is a desktop-based educational game built using Python and Tkinter. Players must read a passage, solve three different reading challenges, and unlock three virtual locks to escape the room.

The game introduces a time limit, a lives system, instant feedback, and bonus scoring to make the learning experience engaging and competitive.

## ✨ Features

* 🚪 **Escape Room Experience:** Unlock three virtual locks by solving reading challenges.
* 📖 **Interactive Reading Passage:** Investigate a story and identify important details.
* 🔎 **Multiple Question Types:** Practice detail-based, inference-based, and vocabulary questions.
* ⏱️ **Time Challenge:** Complete the game within a five-minute time limit.
* ❤️ **Lives System:** Start with three lives and lose one for each incorrect answer.
* ⭐ **Dynamic Scoring:** Earn points for correct answers, remaining lives, and unused time.
* ✅ **Instant Feedback:** Receive explanations and see the correct answers immediately.
* 🔓 **Lock Progression:** Unlock the next challenge after answering each question.
* 📊 **Performance Evaluation:** View your final score, accuracy, correct answers, and remaining lives.
* 🎨 **Dark-Themed GUI:** Enjoy a modern interface with separate reading and escape room panels.
* 🔄 **Replay Option:** Restart the game and attempt to achieve a higher score.

## 🧠 Learning Objectives

The game is designed to improve:

* Reading comprehension
* Critical thinking
* Logical reasoning
* Vocabulary development
* Attention to detail
* Problem-solving
* Decision-making
* Time management

## 🛠️ Technologies Used

| Technology             | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| Python                 | Core programming language                 |
| Tkinter                | Graphical user interface                  |
| Time Module            | Timer and time-based scoring              |
| Python Data Structures | Storing game data, questions, and answers |

## 📂 Project Structure

```text
Read-and-Escape/
│
├── read_escape.py       # Main game application
└── README.md            # Project documentation
```

## ⚙️ Installation and Setup

### 1. Clone the Repository

```bash
git clone <your-repository-url>
```

### 2. Navigate to the Project Folder

```bash
cd Read-and-Escape
```

### 3. Check Python Installation

Ensure Python 3 is installed on your system.

```bash
python --version
```

### 4. Run the Application

```bash
python read_escape.py
```

**Note:** Tkinter is included with most standard Python installations. If it is unavailable, install the appropriate Tkinter package for your operating system.

## 🎮 How to Play

1. Launch the Read & Escape application.
2. Read the case file titled **The Missing Project File** in the Reading Room panel.
3. Review the question displayed in the Escape Room panel.
4. Select the correct answer from the four available options.
5. Unlock the current lock by answering correctly.
6. Read the instant feedback and explanation.
7. Continue through all three locks before the five-minute timer expires.
8. Avoid incorrect answers to preserve your three lives.
9. Escape successfully to receive your final score and performance evaluation.
10. Select **Play Again** to restart the challenge.

## 📚 Game Scenario

### The Missing Project File

* **Difficulty:** Medium
* **Time Limit:** 5 minutes
* **Total Locks:** 3
* **Starting Lives:** 3
* **Maximum Base Score:** 300 points

**Storyline:**

Arjun arrives at his college library to complete his final project report. He discovers that his USB drive, containing his latest project version, is missing from his backpack.

Players must carefully analyze the passage and solve three challenges to determine what happened to the missing USB drive.

### Challenge Breakdown

| Lock   | Question Type | Learning Focus                   |
| ------ | ------------- | -------------------------------- |
| Lock 1 | Detail        | Identifying specific information |
| Lock 2 | Vocabulary    | Understanding words in context   |
| Lock 3 | Inference     | Drawing logical conclusions      |

## 🏆 Scoring System

| Action                     |         Points |
| -------------------------- | -------------: |
| Correct answer             |           +100 |
| Incorrect answer           |        -1 life |
| Each remaining life        |      +50 bonus |
| Every 10 seconds remaining | +1 bonus point |

The final score combines the points earned from correct answers with the remaining lives and time bonuses.

### Performance Levels

| Accuracy   | Performance         |
| ---------- | ------------------- |
| 80% – 100% | Excellent Reader 🏆 |
| 60% – 79%  | Good Reader 🔎      |
| Below 60%  | Keep Practicing 📚  |

### Game Outcomes

* **Successful Escape:** Unlock all three locks before running out of time or lives.
* **Game Over:** The game ends if the player loses all three lives or the five-minute timer expires.

## 🖥️ User Interface

The application consists of the following interface components:

* **Header:** Displays the game title and reading challenge label.
* **Status Bar:** Shows the current lock, score, remaining lives, and countdown timer.
* **Reading Room:** Displays the story passage in a scrollable reading panel.
* **Escape Room:** Displays the virtual lock, question type, question, and answer options.
* **Feedback Section:** Provides explanations and indicates correct or incorrect answers.
* **Result Screen:** Displays the final score, accuracy, correct locks, remaining lives, and performance level.

## 🚀 Future Enhancements

* Add multiple escape room stories with different difficulty levels.
* Introduce randomized questions and answer options.
* Add sound effects and animations for unlocking doors.
* Create a leaderboard to compare student performance.
* Integrate the game with the Soft Skills LMS platform.
* Store individual scores and learning progress in a database.
* Develop a teacher dashboard to monitor student performance.
* Add hints and progressive difficulty levels.
* Include additional question formats and reading challenges.

## 👨‍💻 Project Information

**Project:** Read & Escape
**Category:** Educational Game / Interactive Learning
**Domain:** Reading Comprehension and Soft Skills Development
**Language:** Python
**GUI Framework:** Tkinter
**Application Type:** Desktop Application
**Part of:** Soft Skills LMS

---

⭐ **If you find this project useful, consider giving the repository a star!**
