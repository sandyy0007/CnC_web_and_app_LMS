CASES = [

    {
        "id": 1,
        "title": "The Missing Laptop",
        "difficulty": "Easy",
        "description": "A laptop has disappeared from the office. Read the case carefully and investigate the clues.",

        "passage": """
Rahul arrived at the office at 9:15 AM on Monday morning.
He placed his laptop on his desk and went to the meeting room
at approximately 9:30 AM.

Rahul returned to his desk at 10:15 AM and noticed that his
laptop was missing.

According to the receptionist, Neha entered the office at
9:40 AM and went directly to the meeting room.

The security guard reported that nobody left the building
between 9:30 AM and 10:00 AM.

Later, Rahul remembered that he had moved his laptop to the
meeting room before leaving his desk because he needed it
during the meeting.
        """,

        "questions": [

            {
                "type": "Detail",
                "question": "What time did Rahul arrive at the office?",
                "options": [
                    "8:45 AM",
                    "9:15 AM",
                    "9:30 AM",
                    "10:15 AM"
                ],
                "answer": 1,
                "explanation":
                    "The passage states that Rahul arrived at 9:15 AM."
            },

            {
                "type": "Detail",
                "question": "Where did Rahul go at approximately 9:30 AM?",
                "options": [
                    "Cafeteria",
                    "Parking area",
                    "Meeting room",
                    "Reception"
                ],
                "answer": 2,
                "explanation":
                    "Rahul went to the meeting room."
            },

            {
                "type": "Inference",
                "question": "Why could the laptop not have been taken outside the building between 9:30 and 10:00?",
                "options": [
                    "The office was closed",
                    "The security guard saw nobody leave",
                    "Rahul was using it",
                    "The laptop was locked"
                ],
                "answer": 1,
                "explanation":
                    "The security guard reported that nobody left the building during that period."
            },

            {
                "type": "Inference",
                "question": "Where was the laptop most likely located?",
                "options": [
                    "Reception",
                    "Parking area",
                    "Meeting room",
                    "Outside the building"
                ],
                "answer": 2,
                "explanation":
                    "Rahul remembered moving the laptop to the meeting room."
            },

            {
                "type": "Vocabulary",
                "question": "What does 'approximately' mean in the passage?",
                "options": [
                    "Exactly",
                    "Roughly or about",
                    "Never",
                    "Immediately"
                ],
                "answer": 1,
                "explanation":
                    "Approximately means roughly or about."
            }
        ]
    },


    {
        "id": 2,
        "title": "The Unexpected Presentation",
        "difficulty": "Medium",
        "description": "A student must give an unexpected presentation. Read carefully and determine what happened.",

        "passage": """
Ananya was preparing a presentation for her communication skills
class. She had planned to speak for ten minutes about effective
teamwork.

On the morning of the presentation, the professor announced that
each student would have only five minutes instead of ten.

Ananya quickly reviewed her slides and removed several examples.
She focused on three main points: communication, cooperation,
and responsibility.

During the presentation, the projector stopped working.
Instead of becoming nervous, Ananya continued speaking and
explained her examples without the slides.

After the presentation, the professor praised her ability to
adapt to an unexpected situation.
        """,

        "questions": [

            {
                "type": "Detail",
                "question": "How long was Ananya originally planning to speak?",
                "options": [
                    "Three minutes",
                    "Five minutes",
                    "Ten minutes",
                    "Fifteen minutes"
                ],
                "answer": 2,
                "explanation":
                    "Ananya originally planned a ten-minute presentation."
            },

            {
                "type": "Detail",
                "question": "Which topic was NOT one of Ananya's three main points?",
                "options": [
                    "Communication",
                    "Cooperation",
                    "Responsibility",
                    "Competition"
                ],
                "answer": 3,
                "explanation":
                    "Her three points were communication, cooperation and responsibility."
            },

            {
                "type": "Inference",
                "question": "What quality did Ananya demonstrate when the projector stopped?",
                "options": [
                    "Adaptability",
                    "Carelessness",
                    "Dishonesty",
                    "Impatience"
                ],
                "answer": 0,
                "explanation":
                    "She adapted to the unexpected problem and continued without the slides."
            },

            {
                "type": "Vocabulary",
                "question": "What does 'unexpected' mean?",
                "options": [
                    "Something planned carefully",
                    "Something that happens suddenly or without being predicted",
                    "Something very common",
                    "Something boring"
                ],
                "answer": 1,
                "explanation":
                    "Unexpected means something that was not predicted or planned."
            }
        ]
    }
]