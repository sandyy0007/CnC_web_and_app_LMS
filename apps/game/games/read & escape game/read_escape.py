import tkinter as tk
from tkinter import messagebox
import time


# ============================================================
# COLORS
# ============================================================

BG = "#0f172a"
PANEL = "#1e293b"
CARD = "#334155"

WHITE = "#f8fafc"
MUTED = "#cbd5e1"

BLUE = "#38bdf8"
GREEN = "#22c55e"
RED = "#ef4444"
YELLOW = "#facc15"
PURPLE = "#a78bfa"
ORANGE = "#fb923c"


# ============================================================
# WINDOW
# ============================================================

WINDOW_WIDTH = 1150
WINDOW_HEIGHT = 760


# ============================================================
# GAME DATA
# ============================================================

CASE = {

    "title": "The Missing Project File",

    "difficulty": "Medium",

    "time_limit": 300,

    "passage": """
On Monday morning, Arjun arrived at the college library at
9:00 AM to complete his final project report.

He had saved the latest version of his project on a USB drive.
Before starting his work, he placed the USB drive inside the
front pocket of his black backpack.

At 9:30 AM, Arjun went to the second floor to meet his project
partner, Meera. They discussed their database design for about
twenty minutes.

At 9:55 AM, Arjun returned to his desk and noticed that his
black backpack was still beside his chair, but the USB drive
was missing.

Arjun checked the library desk and then spoke to the librarian.
The librarian remembered seeing Arjun place something inside
the front pocket of his backpack.

A security camera showed that no one had touched Arjun's
backpack while he was on the second floor.

Arjun then remembered that he had taken the USB drive out of
his backpack before going upstairs because he wanted to show
Meera the latest database schema.

He checked the second-floor discussion room and found the USB
drive beside the computer.

Arjun returned to the library and continued working on his
project.
    """,

    "locks": [

        {
            "name": "LOCK 1",
            "type": "DETAIL",

            "question":
                "What time did Arjun arrive at the library?",

            "options": [
                "8:30 AM",
                "9:00 AM",
                "9:30 AM",
                "9:55 AM"
            ],

            "answer": 1,

            "explanation":
                "The passage states that Arjun arrived at 9:00 AM."
        },

        {
            "name": "LOCK 2",
            "type": "VOCABULARY",

            "question":
                "What does 'schema' most likely mean in the passage?",

            "options": [
                "A type of computer virus",
                "A structured design or plan",
                "A library rule",
                "A storage device"
            ],

            "answer": 1,

            "explanation":
                "In this context, schema refers to the structured design of the database."
        },

        {
            "name": "LOCK 3",
            "type": "INFERENCE",

            "question":
                "What is the most reasonable conclusion about the missing USB drive?",

            "options": [
                "Someone stole it from the library.",
                "The librarian accidentally took it.",
                "Arjun had taken it to the second floor.",
                "The security camera was broken."
            ],

            "answer": 2,

            "explanation":
                "Arjun remembered taking the USB drive upstairs to show Meera the database schema."
        }

    ]
}


# ============================================================
# MAIN GAME
# ============================================================

class ReadAndEscape:

    def __init__(self, root):

        self.root = root

        self.root.title(
            "Read & Escape - Soft Skills LMS"
        )

        self.root.geometry(
            f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}"
        )

        self.root.configure(
            bg=BG
        )

        self.root.resizable(
            False,
            False
        )

        # -----------------------------
        # GAME VARIABLES
        # -----------------------------

        self.current_lock = 0

        self.score = 0

        self.lives = 3

        self.correct_answers = 0

        self.game_finished = False

        self.selected_answer = None

        self.option_buttons = []

        self.start_time = time.time()

        # -----------------------------
        # BUILD UI
        # -----------------------------

        self.create_header()

        self.create_status_bar()

        self.create_main_area()

        self.display_passage()

        self.display_lock()

        self.update_timer()


    # ========================================================
    # HEADER
    # ========================================================

    def create_header(self):

        header = tk.Frame(
            self.root,
            bg=BG
        )

        header.pack(
            fill="x",
            padx=25,
            pady=(12, 8)
        )

        tk.Label(
            header,
            text="🚪 READ & ESCAPE",
            font=("Arial", 26, "bold"),
            fg=BLUE,
            bg=BG
        ).pack(
            side="left"
        )

        tk.Label(
            header,
            text="Soft Skills LMS • Reading Challenge",
            font=("Arial", 12),
            fg=MUTED,
            bg=BG
        ).pack(
            side="right"
        )


    # ========================================================
    # STATUS BAR
    # ========================================================

    def create_status_bar(self):

        status = tk.Frame(
            self.root,
            bg=PANEL
        )

        status.pack(
            fill="x",
            padx=25,
            pady=(0, 12)
        )

        self.progress_label = tk.Label(
            status,
            text="🔐 Lock 1 / 3",
            font=("Arial", 12, "bold"),
            fg=WHITE,
            bg=PANEL
        )

        self.progress_label.pack(
            side="left",
            padx=20,
            pady=11
        )

        self.score_label = tk.Label(
            status,
            text="⭐ Score: 0",
            font=("Arial", 12, "bold"),
            fg=YELLOW,
            bg=PANEL
        )

        self.score_label.pack(
            side="left",
            padx=20
        )

        self.lives_label = tk.Label(
            status,
            text="❤️❤️❤️",
            font=("Arial", 13),
            fg=RED,
            bg=PANEL
        )

        self.lives_label.pack(
            side="left",
            padx=20
        )

        self.timer_label = tk.Label(
            status,
            text="⏱ 05:00",
            font=("Arial", 12, "bold"),
            fg=ORANGE,
            bg=PANEL
        )

        self.timer_label.pack(
            side="right",
            padx=20
        )


    # ========================================================
    # MAIN AREA
    # ========================================================

    def create_main_area(self):

        main = tk.Frame(
            self.root,
            bg=BG
        )

        main.pack(
            fill="both",
            expand=True,
            padx=25,
            pady=(0, 15)
        )

        # ====================================================
        # LEFT READING PANEL
        # ====================================================

        left = tk.Frame(
            main,
            bg=PANEL
        )

        left.pack(
            side="left",
            fill="both",
            expand=True,
            padx=(0, 7)
        )

        tk.Label(
            left,
            text="📖 READING ROOM",
            font=("Arial", 18, "bold"),
            fg=BLUE,
            bg=PANEL
        ).pack(
            anchor="w",
            padx=20,
            pady=(18, 4)
        )

        tk.Label(
            left,
            text=CASE["title"],
            font=("Arial", 16, "bold"),
            fg=WHITE,
            bg=PANEL
        ).pack(
            anchor="w",
            padx=20,
            pady=3
        )

        tk.Label(
            left,
            text=(
                f"Difficulty: {CASE['difficulty']}   •   "
                "Read carefully to unlock the room."
            ),
            font=("Arial", 10),
            fg=MUTED,
            bg=PANEL
        ).pack(
            anchor="w",
            padx=20,
            pady=(2, 10)
        )

        # Passage box

        passage_frame = tk.Frame(
            left,
            bg=CARD
        )

        passage_frame.pack(
            fill="both",
            expand=True,
            padx=20,
            pady=(0, 18)
        )

        scrollbar = tk.Scrollbar(
            passage_frame
        )

        scrollbar.pack(
            side="right",
            fill="y"
        )

        self.passage_text = tk.Text(
            passage_frame,
            font=("Arial", 11),
            bg=CARD,
            fg=WHITE,
            wrap="word",
            relief="flat",
            padx=15,
            pady=15,
            yscrollcommand=scrollbar.set
        )

        self.passage_text.pack(
            side="left",
            fill="both",
            expand=True
        )

        scrollbar.config(
            command=self.passage_text.yview
        )

        self.passage_text.insert(
            "1.0",
            CASE["passage"].strip()
        )

        self.passage_text.config(
            state="disabled"
        )


        # ====================================================
        # RIGHT ESCAPE PANEL
        # ====================================================

        right = tk.Frame(
            main,
            bg=PANEL
        )

        right.pack(
            side="right",
            fill="both",
            expand=True,
            padx=(7, 0)
        )


        # ====================================================
        # IMPORTANT:
        # BUTTON AREA IS PACKED FIRST WITH side="bottom"
        # SO IT ALWAYS REMAINS VISIBLE.
        # ====================================================

        bottom_area = tk.Frame(
            right,
            bg=PANEL
        )

        bottom_area.pack(
            side="bottom",
            fill="x",
            padx=20,
            pady=(5, 15)
        )


        self.next_button = tk.Button(
            bottom_area,
            text="🔓 Next Question →",
            font=("Arial", 12, "bold"),
            bg=BLUE,
            fg=BG,
            activebackground="#0ea5e9",
            activeforeground=BG,
            width=22,
            height=2,
            relief="flat",
            cursor="hand2",
            command=self.next_lock
        )

        self.next_button.pack()


        # ====================================================
        # ESCAPE HEADER
        # ====================================================

        tk.Label(
            right,
            text="🔐 ESCAPE ROOM",
            font=("Arial", 18, "bold"),
            fg=PURPLE,
            bg=PANEL
        ).pack(
            anchor="w",
            padx=20,
            pady=(18, 2)
        )

        tk.Label(
            right,
            text="Solve the reading challenge to escape.",
            font=("Arial", 10),
            fg=MUTED,
            bg=PANEL
        ).pack(
            anchor="w",
            padx=20,
            pady=(0, 2)
        )


        # ====================================================
        # LOCK ICON
        # ====================================================

        self.lock_visual = tk.Label(
            right,
            text="🔒",
            font=("Arial", 40),
            bg=PANEL
        )

        self.lock_visual.pack(
            pady=(0, 0)
        )


        self.lock_name = tk.Label(
            right,
            text="LOCK 1",
            font=("Arial", 15, "bold"),
            fg=YELLOW,
            bg=PANEL
        )

        self.lock_name.pack(
            pady=(0, 3)
        )


        self.question_type = tk.Label(
            right,
            text="TYPE: DETAIL",
            font=("Arial", 10, "bold"),
            fg=YELLOW,
            bg=PANEL
        )

        self.question_type.pack(
            pady=(0, 3)
        )


        # ====================================================
        # QUESTION
        # ====================================================

        self.question_text = tk.Text(
            right,
            height=4,
            font=("Arial", 13, "bold"),
            fg=WHITE,
            bg=PANEL,
            relief="flat",
            borderwidth=0,
            wrap="word",
            padx=8,
            pady=4
        )

        self.question_text.pack(
            fill="x",
            padx=20,
            pady=(0, 3)
        )

        self.question_text.config(
            state="disabled"
        )


        # ====================================================
        # OPTIONS
        # ====================================================

        self.options_frame = tk.Frame(
            right,
            bg=PANEL
        )

        self.options_frame.pack(
            fill="x",
            padx=20,
            pady=(0, 2)
        )


        # ====================================================
        # FEEDBACK
        # ====================================================

        self.feedback = tk.Label(
            right,
            text="",
            font=("Arial", 10, "bold"),
            fg=WHITE,
            bg=PANEL,
            wraplength=450,
            justify="left"
        )

        self.feedback.pack(
            fill="x",
            padx=20,
            pady=(2, 5)
        )


    # ========================================================
    # DISPLAY PASSAGE
    # ========================================================

    def display_passage(self):

        self.passage_text.config(
            state="normal"
        )

        self.passage_text.delete(
            "1.0",
            tk.END
        )

        self.passage_text.insert(
            "1.0",
            CASE["passage"].strip()
        )

        self.passage_text.config(
            state="disabled"
        )


    # ========================================================
    # DISPLAY LOCK
    # ========================================================

    def display_lock(self):

        lock = CASE["locks"][
            self.current_lock
        ]

        self.selected_answer = None

        # Progress

        self.progress_label.config(
            text=(
                f"🔐 Lock "
                f"{self.current_lock + 1} / 3"
            )
        )

        # Lock information

        self.lock_name.config(
            text=lock["name"]
        )

        self.question_type.config(
            text=f"TYPE: {lock['type']}"
        )

        self.lock_visual.config(
            text="🔒"
        )

        # Question

        self.question_text.config(
            state="normal"
        )

        self.question_text.delete(
            "1.0",
            tk.END
        )

        self.question_text.insert(
            "1.0",
            lock["question"]
        )

        self.question_text.config(
            state="disabled"
        )

        # Feedback

        self.feedback.config(
            text=""
        )

        # Button

        self.next_button.config(
            state="disabled",
            text="🔓 Next Question →"
        )

        # Remove old buttons

        for button in self.option_buttons:

            button.destroy()

        self.option_buttons = []

        # Create options

        for i, option in enumerate(
            lock["options"]
        ):

            button = tk.Button(
                self.options_frame,
                text=(
                    f"{chr(65 + i)}. {option}"
                ),
                font=("Arial", 10),
                bg=CARD,
                fg=WHITE,
                activebackground=BLUE,
                activeforeground=BG,
                relief="flat",
                anchor="w",
                justify="left",
                wraplength=430,
                padx=10,
                pady=7,
                cursor="hand2",
                command=lambda index=i:
                    self.check_answer(index)
            )

            button.pack(
                fill="x",
                pady=3
            )

            self.option_buttons.append(
                button
            )


    # ========================================================
    # CHECK ANSWER
    # ========================================================

    def check_answer(self, selected):

        if self.selected_answer is not None:
            return

        self.selected_answer = selected

        lock = CASE["locks"][
            self.current_lock
        ]

        correct = (
            selected == lock["answer"]
        )

        # Disable options

        for button in self.option_buttons:

            button.config(
                state="disabled"
            )


        # ====================================================
        # CORRECT
        # ====================================================

        if correct:

            self.correct_answers += 1

            self.score += 100

            self.option_buttons[
                selected
            ].config(
                bg="#166534"
            )

            self.feedback.config(
                text=(
                    "✅ CORRECT!\n"
                    f"{lock['explanation']}"
                ),
                fg=GREEN
            )

            self.lock_visual.config(
                text="🔓"
            )

            self.next_button.config(
                state="normal",
                text=(
                    "➡️ Next Question"
                    if self.current_lock < 2
                    else "🚪 Escape Room"
                )
            )


        # ====================================================
        # WRONG
        # ====================================================

        else:

            self.lives -= 1

            self.option_buttons[
                selected
            ].config(
                bg="#991b1b"
            )

            correct_index = lock["answer"]

            self.option_buttons[
                correct_index
            ].config(
                bg="#166534"
            )

            self.feedback.config(
                text=(
                    "❌ WRONG ANSWER\n"
                    f"{lock['explanation']}\n"
                    "❤️ One life lost."
                ),
                fg=RED
            )

            self.update_lives()

            if self.lives > 0:

                self.next_button.config(
                    state="normal",
                    text="➡️ Next Question"
                )

            else:

                self.next_button.config(
                    state="normal",
                    text="💀 Game Over"
                )

        self.update_score()


    # ========================================================
    # NEXT LOCK
    # ========================================================

    def next_lock(self):

        if self.lives <= 0:

            self.game_over()

            return

        self.current_lock += 1

        if self.current_lock >= 3:

            self.escape_success()

            return

        self.display_lock()


    # ========================================================
    # UPDATE SCORE
    # ========================================================

    def update_score(self):

        self.score_label.config(
            text=f"⭐ Score: {self.score}"
        )


    # ========================================================
    # UPDATE LIVES
    # ========================================================

    def update_lives(self):

        self.lives_label.config(
            text=(
                "❤️" * self.lives
                +
                "🖤" * (3 - self.lives)
            )
        )


    # ========================================================
    # TIMER
    # ========================================================

    def update_timer(self):

        if self.game_finished:
            return

        elapsed = int(
            time.time() - self.start_time
        )

        remaining = (
            CASE["time_limit"] - elapsed
        )

        if remaining <= 0:

            self.timer_label.config(
                text="⏱ 00:00"
            )

            self.game_over()

            return

        minutes = remaining // 60

        seconds = remaining % 60

        self.timer_label.config(
            text=(
                f"⏱ {minutes:02d}:{seconds:02d}"
            )
        )

        if remaining <= 60:

            self.timer_label.config(
                fg=RED
            )

        self.root.after(
            1000,
            self.update_timer
        )


    # ========================================================
    # ESCAPE SUCCESS
    # ========================================================

    def escape_success(self):

        self.game_finished = True

        elapsed = int(
            time.time() - self.start_time
        )

        accuracy = int(
            (
                self.correct_answers / 3
            ) * 100
        )

        # Remaining life bonus

        self.score += (
            self.lives * 50
        )

        # Time bonus

        remaining = max(
            0,
            CASE["time_limit"] - elapsed
        )

        self.score += (
            remaining // 10
        )

        self.lock_visual.config(
            text="🚪"
        )

        self.next_button.config(
            state="disabled"
        )

        self.show_result(
            True,
            accuracy
        )


    # ========================================================
    # GAME OVER
    # ========================================================

    def game_over(self):

        if self.game_finished:
            return

        self.game_finished = True

        accuracy = int(
            (
                self.correct_answers / 3
            ) * 100
        )

        self.show_result(
            False,
            accuracy
        )


    # ========================================================
    # RESULT SCREEN
    # ========================================================

    def show_result(
        self,
        escaped,
        accuracy
    ):

        result = tk.Toplevel(
            self.root
        )

        result.title(
            "Read & Escape Result"
        )

        result.geometry(
            "520x480"
        )

        result.configure(
            bg=BG
        )

        result.resizable(
            False,
            False
        )

        result.grab_set()

        if escaped:

            title = "🎉 YOU ESCAPED!"

            color = GREEN

            message = (
                "Excellent reading skills!\n"
                "You successfully unlocked "
                "all three locks."
            )

        else:

            title = "💀 ESCAPE FAILED"

            color = RED

            message = (
                "You could not escape the room.\n"
                "Read the passage carefully and try again."
            )


        tk.Label(
            result,
            text=title,
            font=("Arial", 27, "bold"),
            fg=color,
            bg=BG
        ).pack(
            pady=(35, 12)
        )


        tk.Label(
            result,
            text=message,
            font=("Arial", 13),
            fg=WHITE,
            bg=BG,
            justify="center"
        ).pack(
            pady=8
        )


        tk.Label(
            result,
            text=f"⭐ Final Score: {self.score}",
            font=("Arial", 19, "bold"),
            fg=YELLOW,
            bg=BG
        ).pack(
            pady=15
        )


        tk.Label(
            result,
            text=(
                f"Correct Locks: "
                f"{self.correct_answers}/3"
            ),
            font=("Arial", 13),
            fg=MUTED,
            bg=BG
        ).pack(
            pady=3
        )


        tk.Label(
            result,
            text=f"Accuracy: {accuracy}%",
            font=("Arial", 13),
            fg=MUTED,
            bg=BG
        ).pack(
            pady=3
        )


        tk.Label(
            result,
            text=(
                f"❤️ Lives Remaining: "
                f"{self.lives}"
            ),
            font=("Arial", 13),
            fg=MUTED,
            bg=BG
        ).pack(
            pady=3
        )


        if accuracy >= 80:

            performance = "🏆 Excellent Reader"

        elif accuracy >= 60:

            performance = "🔎 Good Reader"

        else:

            performance = "📚 Keep Practicing"


        tk.Label(
            result,
            text=performance,
            font=("Arial", 17, "bold"),
            fg=BLUE,
            bg=BG
        ).pack(
            pady=12
        )


        tk.Button(
            result,
            text="🔄 Play Again",
            font=("Arial", 12, "bold"),
            bg=BLUE,
            fg=BG,
            width=22,
            height=2,
            relief="flat",
            cursor="hand2",
            command=lambda: self.restart(result)
        ).pack(
            pady=8
        )


        tk.Button(
            result,
            text="Close",
            width=18,
            command=result.destroy
        ).pack()


    # ========================================================
    # RESTART
    # ========================================================

    def restart(self, result):

        result.destroy()

        self.current_lock = 0

        self.score = 0

        self.lives = 3

        self.correct_answers = 0

        self.game_finished = False

        self.selected_answer = None

        self.start_time = time.time()

        self.update_lives()

        self.update_score()

        self.display_lock()

        self.update_timer()


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    root = tk.Tk()

    app = ReadAndEscape(root)

    root.mainloop()