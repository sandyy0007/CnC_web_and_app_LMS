import tkinter as tk
from cases import CASES


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
DARK_GREEN = "#166534"


# ============================================================
# WINDOW SETTINGS
# ============================================================

WINDOW_WIDTH = 1150
WINDOW_HEIGHT = 760


# ============================================================
# READING DETECTIVE APPLICATION
# ============================================================

class ReadingDetective:

    def __init__(self, root):

        self.root = root

        self.root.title(
            "Reading Detective - Soft Skills LMS"
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

        # ----------------------------------------------------
        # GAME VARIABLES
        # ----------------------------------------------------

        self.case_index = 0

        self.question_index = 0

        self.score = 0

        self.lives = 3

        self.correct_answers = 0

        self.total_questions = 0

        self.case = None

        self.selected_answer = None

        self.question_buttons = []

        # ----------------------------------------------------
        # BUILD UI
        # ----------------------------------------------------

        self.build_interface()

        self.start_case()


    # ========================================================
    # BUILD MAIN INTERFACE
    # ========================================================

    def build_interface(self):

        # ----------------------------------------------------
        # HEADER
        # ----------------------------------------------------

        header = tk.Frame(
            self.root,
            bg=BG
        )

        header.pack(
            fill="x",
            padx=25,
            pady=(15, 10)
        )

        tk.Label(
            header,
            text="🕵️ READING DETECTIVE",
            font=("Arial", 26, "bold"),
            fg=BLUE,
            bg=BG
        ).pack(
            side="left"
        )

        tk.Label(
            header,
            text="Soft Skills LMS",
            font=("Arial", 14),
            fg=MUTED,
            bg=BG
        ).pack(
            side="right"
        )

        # ----------------------------------------------------
        # STATUS BAR
        # ----------------------------------------------------

        self.status_frame = tk.Frame(
            self.root,
            bg=PANEL,
            height=55
        )

        self.status_frame.pack(
            fill="x",
            padx=25,
            pady=(0, 15)
        )

        self.case_label = tk.Label(
            self.status_frame,
            text="CASE",
            font=("Arial", 13, "bold"),
            fg=WHITE,
            bg=PANEL
        )

        self.case_label.pack(
            side="left",
            padx=20,
            pady=15
        )

        self.score_label = tk.Label(
            self.status_frame,
            text="⭐ Score: 0",
            font=("Arial", 13, "bold"),
            fg=YELLOW,
            bg=PANEL
        )

        self.score_label.pack(
            side="left",
            padx=20
        )

        self.progress_label = tk.Label(
            self.status_frame,
            text="Question 1/5",
            font=("Arial", 12),
            fg=MUTED,
            bg=PANEL
        )

        self.progress_label.pack(
            side="left",
            padx=20
        )

        self.lives_label = tk.Label(
            self.status_frame,
            text="❤️❤️❤️",
            font=("Arial", 14),
            fg=RED,
            bg=PANEL
        )

        self.lives_label.pack(
            side="right",
            padx=20
        )

        # ----------------------------------------------------
        # MAIN CONTENT
        # ----------------------------------------------------

        self.content = tk.Frame(
            self.root,
            bg=BG
        )

        self.content.pack(
            fill="both",
            expand=True,
            padx=25,
            pady=(0, 15)
        )

        # ====================================================
        # LEFT PANEL - READING PASSAGE
        # ====================================================

        self.passage_panel = tk.Frame(
            self.content,
            bg=PANEL,
            width=520
        )

        self.passage_panel.pack(
            side="left",
            fill="both",
            expand=True,
            padx=(0, 8)
        )

        # Heading

        tk.Label(
            self.passage_panel,
            text="📖 CASE FILE",
            font=("Arial", 18, "bold"),
            fg=BLUE,
            bg=PANEL
        ).pack(
            anchor="w",
            padx=20,
            pady=(20, 5)
        )

        # Case title

        self.case_title = tk.Label(
            self.passage_panel,
            text="",
            font=("Arial", 16, "bold"),
            fg=WHITE,
            bg=PANEL
        )

        self.case_title.pack(
            anchor="w",
            padx=20,
            pady=(5, 2)
        )

        # Description

        self.case_description = tk.Label(
            self.passage_panel,
            text="",
            font=("Arial", 11),
            fg=MUTED,
            bg=PANEL,
            wraplength=470,
            justify="left"
        )

        self.case_description.pack(
            anchor="w",
            padx=20,
            pady=(3, 10)
        )

        # Passage container

        passage_container = tk.Frame(
            self.passage_panel,
            bg=CARD
        )

        passage_container.pack(
            fill="both",
            expand=True,
            padx=20,
            pady=(5, 20)
        )

        # Scrollbar

        passage_scrollbar = tk.Scrollbar(
            passage_container
        )

        passage_scrollbar.pack(
            side="right",
            fill="y"
        )

        # Passage Text

        self.passage_text = tk.Text(
            passage_container,
            font=("Arial", 12),
            bg=CARD,
            fg=WHITE,
            insertbackground=WHITE,
            relief="flat",
            wrap="word",
            padx=15,
            pady=15,
            yscrollcommand=passage_scrollbar.set
        )

        self.passage_text.pack(
            side="left",
            fill="both",
            expand=True
        )

        passage_scrollbar.config(
            command=self.passage_text.yview
        )

        self.passage_text.config(
            state="disabled"
        )

        # ====================================================
        # RIGHT PANEL - QUESTIONS
        # ====================================================

        self.question_panel = tk.Frame(
            self.content,
            bg=PANEL,
            width=520
        )

        self.question_panel.pack(
            side="right",
            fill="both",
            expand=True,
            padx=(8, 0)
        )

        # Question heading

        self.question_title = tk.Label(
            self.question_panel,
            text="🔎 INVESTIGATION",
            font=("Arial", 18, "bold"),
            fg=PURPLE,
            bg=PANEL
        )

        self.question_title.pack(
            anchor="w",
            padx=20,
            pady=(20, 8)
        )

        # Question type

        self.question_type = tk.Label(
            self.question_panel,
            text="",
            font=("Arial", 11, "bold"),
            fg=YELLOW,
            bg=PANEL
        )

        self.question_type.pack(
            anchor="w",
            padx=20,
            pady=(0, 8)
        )

        # ====================================================
        # FIXED QUESTION AREA
        # ====================================================
        #
        # Text widget is used instead of Label so that long
        # questions automatically wrap to multiple lines.
        #

        question_container = tk.Frame(
            self.question_panel,
            bg=PANEL
        )

        question_container.pack(
            fill="x",
            padx=20,
            pady=(0, 10)
        )

        self.question_text = tk.Text(
            question_container,
            height=5,
            font=("Arial", 14, "bold"),
            fg=WHITE,
            bg=PANEL,
            relief="flat",
            borderwidth=0,
            wrap="word",
            padx=5,
            pady=5,
            cursor="arrow"
        )

        self.question_text.pack(
            fill="x",
            expand=True
        )

        self.question_text.config(
            state="disabled"
        )

        # ----------------------------------------------------
        # OPTIONS
        # ----------------------------------------------------

        self.options_frame = tk.Frame(
            self.question_panel,
            bg=PANEL
        )

        self.options_frame.pack(
            fill="x",
            padx=20,
            pady=5
        )

        # ----------------------------------------------------
        # FEEDBACK
        # ----------------------------------------------------

        self.feedback_label = tk.Label(
            self.question_panel,
            text="",
            font=("Arial", 11, "bold"),
            bg=PANEL,
            wraplength=470,
            justify="left"
        )

        self.feedback_label.pack(
            fill="x",
            padx=20,
            pady=(8, 5)
        )

        # ----------------------------------------------------
        # NEXT BUTTON
        # ----------------------------------------------------

        self.next_button = tk.Button(
            self.question_panel,
            text="Next Question →",
            font=("Arial", 12, "bold"),
            bg=BLUE,
            fg=BG,
            activebackground="#0ea5e9",
            activeforeground=BG,
            width=22,
            height=2,
            relief="flat",
            cursor="hand2",
            command=self.next_question
        )

        self.next_button.pack(
            pady=12
        )

        self.next_button.config(
            state="disabled"
        )


    # ========================================================
    # START CASE
    # ========================================================

    def start_case(self):

        self.case = CASES[
            self.case_index
        ]

        self.question_index = 0

        self.score = 0

        self.lives = 3

        self.correct_answers = 0

        self.total_questions = len(
            self.case["questions"]
        )

        self.update_status()

        self.display_passage()

        self.display_question()


    # ========================================================
    # DISPLAY PASSAGE
    # ========================================================

    def display_passage(self):

        self.case_label.config(
            text=(
                f"CASE #{self.case['id']}"
            )
        )

        self.case_title.config(
            text=self.case["title"]
        )

        self.case_description.config(
            text=(
                f"{self.case['description']}\n"
                f"Difficulty: {self.case['difficulty']}"
            )
        )

        self.passage_text.config(
            state="normal"
        )

        self.passage_text.delete(
            "1.0",
            tk.END
        )

        self.passage_text.insert(
            "1.0",
            self.case["passage"].strip()
        )

        self.passage_text.config(
            state="disabled"
        )


    # ========================================================
    # DISPLAY QUESTION
    # ========================================================

    def display_question(self):

        question = self.case[
            "questions"
        ][self.question_index]

        self.selected_answer = None

        # Progress

        self.progress_label.config(
            text=(
                f"Question "
                f"{self.question_index + 1}/"
                f"{self.total_questions}"
            )
        )

        # Reset next button

        self.next_button.config(
            state="disabled"
        )

        # Clear feedback

        self.feedback_label.config(
            text=""
        )

        # Question type

        self.question_type.config(
            text=(
                f"TYPE: "
                f"{question['type'].upper()}"
            )
        )

        # ====================================================
        # UPDATE QUESTION TEXT
        # ====================================================

        self.question_text.config(
            state="normal"
        )

        self.question_text.delete(
            "1.0",
            tk.END
        )

        self.question_text.insert(
            "1.0",
            question["question"]
        )

        self.question_text.config(
            state="disabled"
        )

        # ====================================================
        # REMOVE OLD OPTION BUTTONS
        # ====================================================

        for button in self.question_buttons:

            button.destroy()

        self.question_buttons = []

        # ====================================================
        # CREATE OPTIONS
        # ====================================================

        for index, option in enumerate(
            question["options"]
        ):

            button = tk.Button(
                self.options_frame,
                text=(
                    f"{chr(65 + index)}. "
                    f"{option}"
                ),
                font=("Arial", 11),
                bg=CARD,
                fg=WHITE,
                activebackground=BLUE,
                activeforeground=BG,
                relief="flat",
                anchor="w",
                padx=15,
                pady=9,
                wraplength=440,
                justify="left",
                cursor="hand2",
                command=lambda i=index:
                    self.select_answer(i)
            )

            button.pack(
                fill="x",
                pady=4
            )

            self.question_buttons.append(
                button
            )


    # ========================================================
    # SELECT ANSWER
    # ========================================================

    def select_answer(
        self,
        answer_index
    ):

        # Prevent changing answer

        if self.selected_answer is not None:

            return

        self.selected_answer = answer_index

        question = self.case[
            "questions"
        ][self.question_index]

        correct = (
            answer_index ==
            question["answer"]
        )

        # Disable buttons

        for button in self.question_buttons:

            button.config(
                state="disabled"
            )

        # ----------------------------------------------------
        # CORRECT
        # ----------------------------------------------------

        if correct:

            self.correct_answers += 1

            self.score += 100

            self.question_buttons[
                answer_index
            ].config(
                bg=DARK_GREEN,
                fg=WHITE
            )

            self.feedback_label.config(
                text=(
                    "✅ Correct!\n\n"
                    + question["explanation"]
                ),
                fg=GREEN
            )

        # ----------------------------------------------------
        # WRONG
        # ----------------------------------------------------

        else:

            self.lives -= 1

            self.question_buttons[
                answer_index
            ].config(
                bg="#991b1b",
                fg=WHITE
            )

            # Show correct answer

            correct_index = question[
                "answer"
            ]

            self.question_buttons[
                correct_index
            ].config(
                bg=DARK_GREEN,
                fg=WHITE
            )

            self.feedback_label.config(
                text=(
                    "❌ Incorrect.\n\n"
                    + question["explanation"]
                ),
                fg=RED
            )

        self.update_status()

        self.next_button.config(
            state="normal"
        )


    # ========================================================
    # NEXT QUESTION
    # ========================================================

    def next_question(self):

        # No lives left

        if self.lives <= 0:

            self.game_over()

            return

        self.question_index += 1

        # End of case

        if (
            self.question_index
            >= self.total_questions
        ):

            self.case_completed()

            return

        self.display_question()


    # ========================================================
    # CASE COMPLETED
    # ========================================================

    def case_completed(self):

        percentage = int(
            (
                self.correct_answers /
                self.total_questions
            ) * 100
        )

        if percentage >= 80:

            performance = (
                "Excellent Detective! 🏆"
            )

        elif percentage >= 60:

            performance = (
                "Good Investigation! 🔎"
            )

        else:

            performance = (
                "Keep Practicing! 📚"
            )

        self.show_completion_screen(
            percentage,
            performance
        )


    # ========================================================
    # GAME OVER
    # ========================================================

    def game_over(self):

        percentage = int(
            (
                self.correct_answers /
                self.total_questions
            ) * 100
        )

        self.show_completion_screen(
            percentage,
            "You ran out of lives! ❤️"
        )


    # ========================================================
    # COMPLETION SCREEN
    # ========================================================

    def show_completion_screen(
        self,
        percentage,
        performance
    ):

        window = tk.Toplevel(
            self.root
        )

        window.title(
            "Case Completed"
        )

        window.geometry(
            "520x470"
        )

        window.configure(
            bg=BG
        )

        window.resizable(
            False,
            False
        )

        window.grab_set()

        # Header

        tk.Label(
            window,
            text="🎉 CASE COMPLETED",
            font=("Arial", 25, "bold"),
            fg=GREEN,
            bg=BG
        ).pack(
            pady=(35, 20)
        )

        # Case

        tk.Label(
            window,
            text=self.case["title"],
            font=("Arial", 18, "bold"),
            fg=WHITE,
            bg=BG
        ).pack()

        # Score

        tk.Label(
            window,
            text=f"⭐ Score: {self.score}",
            font=("Arial", 17, "bold"),
            fg=YELLOW,
            bg=BG
        ).pack(
            pady=15
        )

        # Correct answers

        tk.Label(
            window,
            text=(
                f"Correct Answers: "
                f"{self.correct_answers}/"
                f"{self.total_questions}"
            ),
            font=("Arial", 13),
            fg=MUTED,
            bg=BG
        ).pack()

        # Accuracy

        tk.Label(
            window,
            text=f"Accuracy: {percentage}%",
            font=("Arial", 14),
            fg=MUTED,
            bg=BG
        ).pack(
            pady=8
        )

        # Performance

        tk.Label(
            window,
            text=performance,
            font=("Arial", 18, "bold"),
            fg=BLUE,
            bg=BG
        ).pack(
            pady=15
        )

        # Play another case

        tk.Button(
            window,
            text="🔄 Play Another Case",
            font=("Arial", 12, "bold"),
            bg=BLUE,
            fg=BG,
            width=25,
            height=2,
            relief="flat",
            cursor="hand2",
            command=lambda: self.restart_from_window(
                window
            )
        ).pack(
            pady=10
        )

        # Close

        tk.Button(
            window,
            text="Close",
            width=20,
            command=window.destroy
        ).pack()


    # ========================================================
    # RESTART FROM COMPLETION WINDOW
    # ========================================================

    def restart_from_window(
        self,
        window
    ):

        window.destroy()

        self.next_case()


    # ========================================================
    # NEXT CASE
    # ========================================================

    def next_case(self):

        self.case_index += 1

        if (
            self.case_index
            >= len(CASES)
        ):

            self.case_index = 0

        self.start_case()


    # ========================================================
    # UPDATE STATUS
    # ========================================================

    def update_status(self):

        self.score_label.config(
            text=f"⭐ Score: {self.score}"
        )

        self.lives_label.config(
            text=(
                "❤️" * self.lives
                +
                "🖤" * (3 - self.lives)
            )
        )


# ============================================================
# START APPLICATION
# ============================================================

if __name__ == "__main__":

    root = tk.Tk()

    app = ReadingDetective(
        root
    )

    root.mainloop()