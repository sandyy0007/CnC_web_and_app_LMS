import tkinter as tk
from tkinter import messagebox
import random

# ============================================================
# GAME CONFIGURATION
# ============================================================

WINDOW_WIDTH = 1050
WINDOW_HEIGHT = 750

BOARD_SIZE = 600
CELL_SIZE = 60

# Snakes
SNAKES = {
    99: 78,
    95: 75,
    92: 88,
    89: 68,
    74: 53,
    64: 60,
    62: 19,
    56: 48,
    49: 11,
    47: 26,
    16: 6
}

# Ladders
LADDERS = {
    2: 38,
    7: 14,
    8: 31,
    15: 26,
    21: 42,
    28: 84,
    36: 44,
    51: 67,
    71: 91,
    80: 99
}

# ============================================================
# SOFT SKILLS QUESTION BANK
# ============================================================

QUESTIONS = [

    {
        "type": "Vocabulary",
        "question": "What is the meaning of 'Eloquent'?",
        "options": [
            "Fluent and persuasive",
            "Very angry",
            "Extremely tired",
            "Unable to speak"
        ],
        "answer": 0
    },

    {
        "type": "Vocabulary",
        "question": "Choose the synonym of 'Rapid'.",
        "options": [
            "Slow",
            "Fast",
            "Weak",
            "Late"
        ],
        "answer": 1
    },

    {
        "type": "Vocabulary",
        "question": "What does 'Abundant' mean?",
        "options": [
            "Very little",
            "Very expensive",
            "Available in large quantities",
            "Difficult to find"
        ],
        "answer": 2
    },

    {
        "type": "Vocabulary",
        "question": "Choose the antonym of 'Generous'.",
        "options": [
            "Kind",
            "Helpful",
            "Selfish",
            "Friendly"
        ],
        "answer": 2
    },

    {
        "type": "Vocabulary",
        "question": "What does 'Confident' mean?",
        "options": [
            "Having belief in yourself",
            "Being afraid",
            "Being confused",
            "Being careless"
        ],
        "answer": 0
    },

    {
        "type": "Vocabulary",
        "question": "Choose the synonym of 'Brief'.",
        "options": [
            "Long",
            "Short",
            "Heavy",
            "Difficult"
        ],
        "answer": 1
    },

    {
        "type": "Pronunciation",
        "question": "Which pronunciation is closest to 'Entrepreneur'?",
        "options": [
            "On-truh-pruh-NUR",
            "En-ter-pren-er",
            "En-tri-pron-or",
            "Enter-pri-nor"
        ],
        "answer": 0
    },

    {
        "type": "Pronunciation",
        "question": "Which pronunciation is closest to 'Communication'?",
        "options": [
            "Ko-mu-ni-ka-shun",
            "Com-mun-i-cay-tion",
            "Com-yoo-nick-a-shun",
            "Kom-mu-nay-shun"
        ],
        "answer": 0
    }
]


# ============================================================
# MAIN APPLICATION
# ============================================================

class SnakeLadderGame:

    def __init__(self, root):

        self.root = root

        self.root.title(
            "Soft Skills LMS - Snake & Ladder"
        )

        self.root.geometry(
            f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}"
        )

        self.root.resizable(False, False)

        # -------------------------------
        # GAME VARIABLES
        # -------------------------------

        self.players = [
            {
                "name": "Player 1",
                "position": 1,
                "color": "#e53935"
            },
            {
                "name": "Player 2",
                "position": 1,
                "color": "#1e88e5"
            }
        ]

        self.current_player = 0

        self.dice_value = 1

        self.game_over = False

        self.question_window = None

        self.current_question = None

        # -------------------------------
        # TITLE
        # -------------------------------

        title = tk.Label(
            root,
            text="🐍 Snake & Ladder - Soft Skills LMS",
            font=("Arial", 24, "bold"),
            fg="#14532d"
        )

        title.pack(pady=12)

        # -------------------------------
        # MAIN FRAME
        # -------------------------------

        self.main_frame = tk.Frame(root)

        self.main_frame.pack()

        # -------------------------------
        # BOARD
        # -------------------------------

        self.canvas = tk.Canvas(
            self.main_frame,
            width=BOARD_SIZE,
            height=BOARD_SIZE,
            bg="white",
            highlightthickness=0
        )

        self.canvas.grid(
            row=0,
            column=0,
            padx=15
        )

        # -------------------------------
        # SIDE PANEL
        # -------------------------------

        self.side_frame = tk.Frame(
            self.main_frame,
            width=300,
            height=BOARD_SIZE,
            bg="#f8fafc",
            relief="ridge",
            bd=2
        )

        self.side_frame.grid(
            row=0,
            column=1,
            sticky="ns"
        )

        self.create_side_panel()

        # Draw board
        self.draw_board()

        self.update_players()

    # ========================================================
    # SIDE PANEL
    # ========================================================

    def create_side_panel(self):

        tk.Label(
            self.side_frame,
            text="🎓 Soft Skills LMS",
            font=("Arial", 20, "bold"),
            fg="#14532d",
            bg="#f8fafc"
        ).pack(pady=(25, 5))

        tk.Label(
            self.side_frame,
            text="Gamified Learning",
            font=("Arial", 12),
            fg="#64748b",
            bg="#f8fafc"
        ).pack()

        # Player 1
        self.p1_label = tk.Label(
            self.side_frame,
            text="🔴 Player 1\nPosition: 1",
            font=("Arial", 14, "bold"),
            fg="#e53935",
            bg="#f8fafc"
        )

        self.p1_label.pack(pady=25)

        # Player 2
        self.p2_label = tk.Label(
            self.side_frame,
            text="🔵 Player 2\nPosition: 1",
            font=("Arial", 14, "bold"),
            fg="#1e88e5",
            bg="#f8fafc"
        )

        self.p2_label.pack(pady=10)

        # Divider
        tk.Frame(
            self.side_frame,
            height=2,
            bg="#cbd5e1"
        ).pack(
            fill="x",
            padx=25,
            pady=20
        )

        # Turn
        self.turn_label = tk.Label(
            self.side_frame,
            text="Player 1's Turn",
            font=("Arial", 18, "bold"),
            fg="#14532d",
            bg="#f8fafc"
        )

        self.turn_label.pack(pady=10)

        # Dice
        self.dice_label = tk.Label(
            self.side_frame,
            text="🎲",
            font=("Arial", 50),
            bg="#f8fafc"
        )

        self.dice_label.pack(pady=15)

        self.dice_number = tk.Label(
            self.side_frame,
            text="Dice: -",
            font=("Arial", 14),
            bg="#f8fafc"
        )

        self.dice_number.pack()

        # Roll Button
        self.roll_button = tk.Button(
            self.side_frame,
            text="🎲 ROLL DICE",
            font=("Arial", 14, "bold"),
            bg="#14532d",
            fg="white",
            activebackground="#166534",
            activeforeground="white",
            width=18,
            height=2,
            command=self.roll_dice
        )

        self.roll_button.pack(pady=30)

        # Restart
        tk.Button(
            self.side_frame,
            text="🔄 New Game",
            font=("Arial", 11),
            width=18,
            command=self.reset_game
        ).pack()

    # ========================================================
    # DRAW BOARD
    # ========================================================

    def draw_board(self):

        self.canvas.delete("all")

        for position in range(1, 101):

            row = (position - 1) // 10
            col = (position - 1) % 10

            # Zig-zag board
            if row % 2 == 1:
                col = 9 - col

            x1 = col * CELL_SIZE
            y1 = (9 - row) * CELL_SIZE

            x2 = x1 + CELL_SIZE
            y2 = y1 + CELL_SIZE

            # Cell color
            if (row + col) % 2 == 0:
                color = "#fef3c7"
            else:
                color = "#dbeafe"

            # Snake cell
            if position in SNAKES:
                color = "#fee2e2"

            # Ladder cell
            if position in LADDERS:
                color = "#dcfce7"

            self.canvas.create_rectangle(
                x1,
                y1,
                x2,
                y2,
                fill=color,
                outline="#64748b",
                width=1
            )

            # Number
            self.canvas.create_text(
                x1 + 8,
                y1 + 8,
                text=str(position),
                anchor="nw",
                font=("Arial", 9, "bold"),
                fill="#334155"
            )

        # Draw ladders
        self.draw_ladders()

        # Draw snakes
        self.draw_snakes()

    # ========================================================
    # DRAW LADDERS
    # ========================================================

    def draw_ladders(self):

        for start, end in LADDERS.items():

            x1, y1 = self.get_center(start)
            x2, y2 = self.get_center(end)

            self.canvas.create_line(
                x1 - 7,
                y1,
                x2 - 7,
                y2,
                fill="#16a34a",
                width=5
            )

            self.canvas.create_line(
                x1 + 7,
                y1,
                x2 + 7,
                y2,
                fill="#16a34a",
                width=5
            )

            # Ladder steps
            for i in range(1, 6):

                t = i / 6

                x = x1 + (x2 - x1) * t
                y = y1 + (y2 - y1) * t

                self.canvas.create_line(
                    x - 8,
                    y,
                    x + 8,
                    y,
                    fill="#16a34a",
                    width=3
                )

    # ========================================================
    # DRAW SNAKES
    # ========================================================

    def draw_snakes(self):

        for start, end in SNAKES.items():

            x1, y1 = self.get_center(start)
            x2, y2 = self.get_center(end)

            # Snake body
            self.canvas.create_line(
                x1,
                y1,
                x2,
                y2,
                fill="#dc2626",
                width=7,
                smooth=True
            )

            # Head
            self.canvas.create_oval(
                x1 - 10,
                y1 - 10,
                x1 + 10,
                y1 + 10,
                fill="#dc2626",
                outline="#991b1b",
                width=2
            )

            # Eyes
            self.canvas.create_oval(
                x1 - 5,
                y1 - 5,
                x1 - 2,
                y1 - 2,
                fill="white"
            )

            self.canvas.create_oval(
                x1 + 2,
                y1 - 5,
                x1 + 5,
                y1 - 2,
                fill="white"
            )

    # ========================================================
    # GET CELL CENTER
    # ========================================================

    def get_center(self, position):

        row = (position - 1) // 10
        col = (position - 1) % 10

        if row % 2 == 1:
            col = 9 - col

        x = col * CELL_SIZE + CELL_SIZE // 2

        y = (
            (9 - row) * CELL_SIZE
            + CELL_SIZE // 2
        )

        return x, y

    # ========================================================
    # DRAW PLAYERS
    # ========================================================

    def update_players(self):

        # Redraw board
        self.draw_board()

        positions = {}

        for i, player in enumerate(self.players):

            pos = player["position"]

            if pos not in positions:
                positions[pos] = []

            positions[pos].append(i)

        for pos, player_indexes in positions.items():

            for offset, index in enumerate(player_indexes):

                x, y = self.get_center(pos)

                if len(player_indexes) > 1:

                    if offset == 0:
                        x -= 10
                        y -= 10
                    else:
                        x += 10
                        y += 10

                self.canvas.create_oval(
                    x - 16,
                    y - 16,
                    x + 16,
                    y + 16,
                    fill=self.players[index]["color"],
                    outline="white",
                    width=3
                )

                self.canvas.create_text(
                    x,
                    y,
                    text=str(index + 1),
                    fill="white",
                    font=("Arial", 12, "bold")
                )

        # Update labels
        self.p1_label.config(
            text=(
                f"🔴 Player 1\n"
                f"Position: {self.players[0]['position']}"
            )
        )

        self.p2_label.config(
            text=(
                f"🔵 Player 2\n"
                f"Position: {self.players[1]['position']}"
            )
        )

    # ========================================================
    # ROLL DICE
    # ========================================================

    def roll_dice(self):

        if self.game_over:
            return

        self.roll_button.config(
            state="disabled"
        )

        self.dice_value = random.randint(1, 6)

        self.dice_label.config(
            text=f"🎲\n{self.dice_value}"
        )

        self.dice_number.config(
            text=f"Dice: {self.dice_value}"
        )

        player = self.players[
            self.current_player
        ]

        new_position = (
            player["position"]
            + self.dice_value
        )

        # Cannot cross 100
        if new_position > 100:

            messagebox.showinfo(
                "Invalid Move",
                "You need an exact dice number to reach 100."
            )

            self.next_turn()

            return

        player["position"] = new_position

        self.update_players()

        # Winner
        if new_position == 100:

            self.game_over = True

            self.turn_label.config(
                text=f"🏆 {player['name']} Wins!"
            )

            messagebox.showinfo(
                "Congratulations!",
                f"🏆 {player['name']} has won the game!"
            )

            return

        # Snake
        if new_position in SNAKES:

            self.root.after(
                500,
                self.snake_challenge
            )

            return

        # Ladder
        if new_position in LADDERS:

            new_position = LADDERS[
                new_position
            ]

            player["position"] = new_position

            self.update_players()

            messagebox.showinfo(
                "🪜 Ladder!",
                f"Great! You climbed to position {new_position}."
            )

        self.next_turn()

    # ========================================================
    # SNAKE CHALLENGE
    # ========================================================

    def snake_challenge(self):

        self.current_question = random.choice(
            QUESTIONS
        )

        question = self.current_question

        # Question Window
        self.question_window = tk.Toplevel(
            self.root
        )

        self.question_window.title(
            "🐍 Soft Skills Challenge"
        )

        self.question_window.geometry(
            "650x520"
        )

        self.question_window.resizable(
            False,
            False
        )

        self.question_window.transient(
            self.root
        )

        self.question_window.grab_set()

        # Header
        tk.Label(
            self.question_window,
            text="🐍 SNAKE CHALLENGE!",
            font=("Arial", 24, "bold"),
            fg="#dc2626"
        ).pack(pady=(25, 5))

        tk.Label(
            self.question_window,
            text="❤️ You have one LIFE chance!",
            font=("Arial", 14, "bold"),
            fg="#14532d"
        ).pack()

        tk.Label(
            self.question_window,
            text=f"Category: {question['type']}",
            font=("Arial", 12),
            fg="#64748b"
        ).pack(pady=15)

        # Question
        tk.Label(
            self.question_window,
            text=question["question"],
            font=("Arial", 17, "bold"),
            wraplength=560,
            justify="center"
        ).pack(pady=15)

        # Options
        for i, option in enumerate(
            question["options"]
        ):

            tk.Button(
                self.question_window,
                text=(
                    f"{chr(65 + i)}. {option}"
                ),
                font=("Arial", 12),
                width=55,
                anchor="w",
                command=lambda idx=i:
                    self.check_answer(idx)
            ).pack(
                pady=5
            )

        tk.Label(
            self.question_window,
            text=(
                "Correct answer → Snake avoided ❤️\n"
                "Wrong answer → Position resets to 1 ❌"
            ),
            font=("Arial", 11),
            fg="#475569"
        ).pack(pady=15)

    # ========================================================
    # CHECK ANSWER
    # ========================================================

    def check_answer(self, selected):

        correct_answer = (
            self.current_question["answer"]
        )

        player = self.players[
            self.current_player
        ]

        if selected == correct_answer:

            messagebox.showinfo(
                "❤️ Life Saved!",
                "Correct answer!\n\n"
                "You used your LIFE and survived "
                "the snake.\n\n"
                "Your position remains safe!"
            )

            self.question_window.destroy()

            self.next_turn()

        else:

            player["position"] = 1

            self.update_players()

            messagebox.showerror(
                "❌ Wrong Answer",
                "Incorrect answer!\n\n"
                "Your LIFE was lost.\n\n"
                "You return to position 1."
            )

            self.question_window.destroy()

            self.next_turn()

    # ========================================================
    # NEXT TURN
    # ========================================================

    def next_turn(self):

        self.current_player = (
            1 - self.current_player
        )

        player = self.players[
            self.current_player
        ]

        self.turn_label.config(
            text=f"{player['name']}'s Turn"
        )

        self.roll_button.config(
            state="normal"
        )

        self.update_players()

    # ========================================================
    # RESET GAME
    # ========================================================

    def reset_game(self):

        self.players[0]["position"] = 1
        self.players[1]["position"] = 1

        self.current_player = 0

        self.dice_value = 1

        self.game_over = False

        self.dice_label.config(
            text="🎲"
        )

        self.dice_number.config(
            text="Dice: -"
        )

        self.turn_label.config(
            text="Player 1's Turn"
        )

        self.roll_button.config(
            state="normal"
        )

        self.update_players()


# ============================================================
# START APPLICATION
# ============================================================

if __name__ == "__main__":

    root = tk.Tk()

    game = SnakeLadderGame(root)

    root.mainloop()