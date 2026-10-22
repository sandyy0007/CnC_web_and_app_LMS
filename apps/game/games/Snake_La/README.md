# 🐍 Snake & Ladder – Soft Skills LMS

An interactive, Python-based educational game that combines the classic **Snake & Ladder** board game with soft skills learning. Players move across a 100-cell board by rolling a dice, climbing ladders, avoiding snakes, and answering vocabulary and pronunciation questions.

Developed as part of the **Soft Skills LMS** project, this game makes learning more engaging through gameplay, competition, and knowledge-based challenges.

## 📌 Project Overview

**Snake & Ladder – Soft Skills LMS** is a two-player desktop game built using Python and Tkinter. The game follows traditional Snake & Ladder rules while introducing educational questions whenever a player lands on a snake.

Players must answer a randomly selected question correctly to avoid returning to the starting position. A correct answer allows the player to survive the snake, while an incorrect answer sends them back to position 1.

The first player to reach position 100 with an exact dice roll wins the game.

## ✨ Features

* 🎲 **Interactive Dice:** Roll a virtual dice to determine player movement.
* 🐍 **Snake Challenges:** Answer a soft skills question when landing on a snake.
* 🪜 **Ladders:** Climb ladders to advance quickly across the board.
* 👥 **Two-Player Mode:** Play against another person on the same computer.
* 📚 **Educational Question Bank:** Practice vocabulary and pronunciation.
* 🔀 **Random Questions:** Receive a randomly selected question during snake challenges.
* ❤️ **Life-Saving Challenge:** Correct answers allow players to avoid the snake penalty.
* ❌ **Penalty System:** Incorrect answers reset the player's position to 1.
* 🏆 **Winner Detection:** The first player to reach position 100 wins.
* 🎨 **Visual Game Board:** A colorful 10 × 10 board with numbered cells, snakes, ladders, and player tokens.
* 🔄 **New Game Option:** Reset the board and start a fresh match.

## 🧠 Learning Objectives

The game is designed to support the development of:

* Vocabulary and word knowledge
* Pronunciation awareness
* Quick thinking
* Decision-making
* Knowledge recall
* Competitive learning
* Engagement through gamification

## 🛠️ Technologies Used

| Technology             | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| Python                 | Core programming language                                  |
| Tkinter                | Graphical user interface                                   |
| Random Module          | Dice rolls and random question selection                   |
| Messagebox             | Game notifications and answer feedback                     |
| Python Data Structures | Storing player information, questions, snakes, and ladders |

## 📂 Project Structure

```text
Snake-and-Ladder/
│
├── snake_ladder.py    # Main game application
└── README.md          # Project documentation
```

## ⚙️ Installation and Setup

### 1. Clone the Repository

```bash
git clone <your-repository-url>
```

### 2. Navigate to the Project Folder

```bash
cd Snake-and-Ladder
```

### 3. Check Python Installation

Make sure Python 3 is installed.

```bash
python --version
```

### 4. Run the Application

```bash
python snake_ladder.py
```

**Note:** Tkinter is included with most standard Python installations. If it is unavailable, install the appropriate Tkinter package for your operating system.

## 🎮 How to Play

1. Launch the Snake & Ladder application.
2. Both players begin at position 1.
3. Player 1 rolls the dice using the **ROLL DICE** button.
4. The player moves forward according to the dice result.
5. If the player lands on a ladder, they automatically climb to a higher position.
6. If the player lands on a snake, a soft skills question appears.
7. Select an answer from the available options:

   * **Correct answer:** Avoid the snake and keep the current position.
   * **Wrong answer:** Return to position 1.
8. The turn switches to the other player.
9. Continue taking turns until one player reaches position 100 with an exact dice roll.
10. Use **New Game** to reset the match and play again.

## 🗺️ Game Board

The game features a traditional 10 × 10 board with 100 numbered cells.

### Snakes

| Starting Position | Ending Position |
| ----------------: | --------------: |
|                99 |              78 |
|                95 |              75 |
|                92 |              88 |
|                89 |              68 |
|                74 |              53 |
|                64 |              60 |
|                62 |              19 |
|                56 |              48 |
|                49 |              11 |
|                47 |              26 |
|                16 |               6 |

### Ladders

| Starting Position | Ending Position |
| ----------------: | --------------: |
|                 2 |              38 |
|                 7 |              14 |
|                 8 |              31 |
|                15 |              26 |
|                21 |              42 |
|                28 |              84 |
|                36 |              44 |
|                51 |              67 |
|                71 |              91 |
|                80 |              99 |

## 📚 Soft Skills Question Bank

The game currently includes questions from two categories.

### 1. Vocabulary

Players practice word meanings, synonyms, and antonyms.

Examples:

* What is the meaning of **Eloquent**?
* Choose the synonym of **Rapid**.
* What does **Abundant** mean?
* Choose the antonym of **Generous**.
* What does **Confident** mean?
* Choose the synonym of **Brief**.

### 2. Pronunciation

Players practice recognizing approximate pronunciations of English words.

Examples:

* Which pronunciation is closest to **Entrepreneur**?
* Which pronunciation is closest to **Communication**?

Questions are selected randomly from the available question bank when a snake challenge is triggered.

## 🏆 Winning Conditions and Rules

| Rule              | Description                                |
| ----------------- | ------------------------------------------ |
| Starting Position | Both players start at position 1           |
| Dice Range        | 1 to 6                                     |
| Board Size        | 100 cells                                  |
| Ladder Effect     | Move to the ladder's ending position       |
| Snake Challenge   | Answer a question to avoid the penalty     |
| Correct Answer    | Keep the current position                  |
| Incorrect Answer  | Return to position 1                       |
| Winning Condition | Reach position 100 with an exact dice roll |
| Turn System       | Players take turns automatically           |

If a dice roll would move a player beyond position 100, the move is rejected and the turn passes to the other player.

## 🖥️ User Interface

The application includes the following components:

* **Game Header:** Displays the Snake & Ladder title.
* **Game Board:** Shows all 100 cells, along with the snakes, ladders, and player positions.
* **Player Status Panel:** Displays both players and their current positions.
* **Turn Indicator:** Shows whose turn it is.
* **Dice Display:** Shows the latest dice result.
* **Roll Dice Button:** Allows the current player to roll the dice.
* **New Game Button:** Resets the board and player positions.
* **Snake Challenge Window:** Displays a question, category, and answer options when a player lands on a snake.

## 🚀 Future Enhancements

* Add more question categories, such as communication, interview skills, grammar, and logical reasoning.
* Introduce multiple difficulty levels.
* Add a scoring system and performance tracking.
* Include sound effects and animations for dice rolls, snakes, and ladders.
* Add a single-player mode with a computer opponent.
* Store player scores and progress in a database.
* Integrate the game with the Soft Skills LMS platform.
* Create a leaderboard to compare student performance.
* Add a question timer and difficulty-based challenges.
* Improve the question bank with explanations and learning feedback.

## 👨‍💻 Project Information

**Project:** Snake & Ladder – Soft Skills LMS
**Category:** Educational Game / Gamified Learning
**Domain:** Soft Skills Development
**Language:** Python
**GUI Framework:** Tkinter
**Application Type:** Desktop Application
**Game Mode:** Two Players
**Part of:** Soft Skills LMS

---

⭐ **If you find this project useful, consider giving the repository a star!**
