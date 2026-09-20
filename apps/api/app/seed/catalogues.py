"""Static seed catalogues: the evaluation parameter set, courses, games, practice modes, badges.

These are platform content, not fabricated statistics. The 95+ trainer-rated parameters below are
the catalogue the Trainer module's evaluation form renders, grouped into the 7 pillars.
"""
from __future__ import annotations

from typing import Any

# --------------------------------------------------------------------------- 7 pillars × parameters
#: (pillar, code, label, description, maxScore, weight, semesterFrom, semesterTo)
EVALUATION_PARAMETERS: list[tuple[str, str, str, str, int, float, int, int]] = [
    # ---------------- Behaviour (14)
    ("behaviour", "BEH01", "Punctuality", "Arrives on time for sessions and submissions", 5, 1.0, 1, 12),
    ("behaviour", "BEH02", "Attendance discipline", "Consistent participation across the cycle", 5, 1.2, 1, 12),
    ("behaviour", "BEH03", "Classroom conduct", "Respectful, attentive behaviour in sessions", 5, 1.0, 1, 12),
    ("behaviour", "BEH04", "Grooming & presentation", "Appropriate personal presentation", 5, 0.8, 1, 12),
    ("behaviour", "BEH05", "Integrity", "Honest work, no plagiarism or misrepresentation", 5, 1.4, 1, 12),
    ("behaviour", "BEH06", "Receptiveness to feedback", "Acts on trainer feedback constructively", 5, 1.2, 1, 12),
    ("behaviour", "BEH07", "Peer respect", "Treats peers with courtesy and inclusion", 5, 1.0, 1, 12),
    ("behaviour", "BEH08", "Digital etiquette", "Appropriate conduct in online sessions and chats", 5, 0.8, 1, 12),
    ("behaviour", "BEH09", "Task ownership", "Takes responsibility without prompting", 5, 1.2, 1, 12),
    ("behaviour", "BEH10", "Emotional regulation", "Handles setbacks and criticism calmly", 5, 1.0, 3, 12),
    ("behaviour", "BEH11", "Consistency", "Sustains effort across the programme", 5, 1.0, 1, 12),
    ("behaviour", "BEH12", "Deadline adherence", "Meets committed dates", 5, 1.2, 1, 12),
    ("behaviour", "BEH13", "Initiative in class", "Volunteers, asks questions, participates", 5, 1.0, 1, 12),
    ("behaviour", "BEH14", "Professional boundaries", "Appropriate conduct with faculty and peers", 5, 1.0, 4, 12),

    # ---------------- Communication (18)
    ("communication", "COM01", "Verbal clarity", "Words and sentences are easy to follow", 5, 1.4, 1, 12),
    ("communication", "COM02", "Pronunciation", "Sounds are formed clearly and correctly", 5, 1.0, 1, 12),
    ("communication", "COM03", "Fluency", "Speech flows without excessive hesitation", 5, 1.4, 1, 12),
    ("communication", "COM04", "Vocabulary range", "Uses precise, varied word choice", 5, 1.0, 1, 12),
    ("communication", "COM05", "Grammar accuracy", "Spoken and written grammar is correct", 5, 1.2, 1, 12),
    ("communication", "COM06", "Listening comprehension", "Understands and responds to what was asked", 5, 1.2, 1, 12),
    ("communication", "COM07", "Active listening behaviour", "Signals attention, paraphrases, checks understanding", 5, 1.0, 1, 12),
    ("communication", "COM08", "Email writing", "Structure, tone and clarity in email", 5, 1.2, 2, 12),
    ("communication", "COM09", "Report writing", "Organised, evidence-led written work", 5, 1.0, 3, 12),
    ("communication", "COM10", "Presentation delivery", "Pace, projection and audience contact", 5, 1.4, 2, 12),
    ("communication", "COM11", "Visual aid usage", "Slides support rather than replace the message", 5, 0.8, 3, 12),
    ("communication", "COM12", "Group discussion contribution", "Adds substance without dominating", 5, 1.2, 2, 12),
    ("communication", "COM13", "Question handling", "Answers follow-ups directly and calmly", 5, 1.2, 3, 12),
    ("communication", "COM14", "Non-verbal communication", "Posture, gesture and expression support the message", 5, 1.0, 1, 12),
    ("communication", "COM15", "Storytelling & structure", "Frames answers with a clear arc", 5, 1.2, 3, 12),
    ("communication", "COM16", "Concise summarising", "Compresses detail without losing meaning", 5, 1.0, 2, 12),
    ("communication", "COM17", "Audience adaptation", "Adjusts register for the listener", 5, 1.0, 4, 12),
    ("communication", "COM18", "Filler-word control", "Minimal um/uh/like under pressure", 5, 1.0, 1, 12),

    # ---------------- Confidence (12)
    ("confidence", "CNF01", "Self-introduction", "Introduces self clearly and convincingly", 5, 1.4, 1, 12),
    ("confidence", "CNF02", "Eye contact", "Maintains appropriate eye contact", 5, 1.0, 1, 12),
    ("confidence", "CNF03", "Voice modulation", "Varies tone and emphasis purposefully", 5, 1.0, 1, 12),
    ("confidence", "CNF04", "Body language", "Open, steady, purposeful physical presence", 5, 1.0, 1, 12),
    ("confidence", "CNF05", "Composure under pressure", "Stays steady when challenged", 5, 1.4, 2, 12),
    ("confidence", "CNF06", "Willingness to volunteer", "Steps forward in group settings", 5, 1.0, 1, 12),
    ("confidence", "CNF07", "Handling criticism", "Receives critique without defensiveness", 5, 1.2, 2, 12),
    ("confidence", "CNF08", "Opinion assertion", "States a view and supports it", 5, 1.2, 3, 12),
    ("confidence", "CNF09", "Self-awareness", "Accurate about own strengths and gaps", 5, 1.0, 3, 12),
    ("confidence", "CNF10", "Stage presence", "Commands attention when presenting", 5, 1.0, 4, 12),
    ("confidence", "CNF11", "Recovery from error", "Regains flow after a mistake", 5, 1.0, 2, 12),
    ("confidence", "CNF12", "Decisiveness", "Commits to a position or choice", 5, 1.0, 4, 12),

    # ---------------- Leadership (14)
    ("leadership", "LDR01", "Team collaboration", "Works productively with others", 5, 1.4, 1, 12),
    ("leadership", "LDR02", "Initiative", "Starts work without being told", 5, 1.4, 1, 12),
    ("leadership", "LDR03", "Delegation", "Distributes work sensibly", 5, 1.0, 4, 12),
    ("leadership", "LDR04", "Conflict resolution", "De-escalates and resolves disagreement", 5, 1.2, 3, 12),
    ("leadership", "LDR05", "Motivating peers", "Lifts the group's energy and focus", 5, 1.0, 3, 12),
    ("leadership", "LDR06", "Decision making", "Makes reasoned choices under constraint", 5, 1.2, 3, 12),
    ("leadership", "LDR07", "Accountability", "Owns outcomes, including failures", 5, 1.4, 2, 12),
    ("leadership", "LDR08", "Mentoring others", "Helps peers improve", 5, 1.0, 5, 12),
    ("leadership", "LDR09", "Meeting facilitation", "Runs a discussion to a useful end", 5, 1.0, 5, 12),
    ("leadership", "LDR10", "Planning & organisation", "Sequences work sensibly", 5, 1.2, 2, 12),
    ("leadership", "LDR11", "Influence without authority", "Persuades peers on merit", 5, 1.0, 5, 12),
    ("leadership", "LDR12", "Role flexibility", "Adapts between leading and supporting", 5, 1.0, 3, 12),
    ("leadership", "LDR13", "Stakeholder awareness", "Considers who is affected by a decision", 5, 1.0, 5, 12),
    ("leadership", "LDR14", "Feedback to peers", "Gives useful, kind, specific feedback", 5, 1.0, 4, 12),

    # ---------------- Technical (14)
    ("technical", "TEC01", "Core subject knowledge", "Command of the fundamentals", 5, 1.4, 1, 12),
    ("technical", "TEC02", "Programming fundamentals", "Language and syntax competence", 5, 1.4, 1, 12),
    ("technical", "TEC03", "Data structures", "Chooses and applies suitable structures", 5, 1.4, 2, 12),
    ("technical", "TEC04", "Algorithms", "Designs and analyses solutions", 5, 1.4, 3, 12),
    ("technical", "TEC05", "Database concepts", "Modelling and querying competence", 5, 1.2, 3, 12),
    ("technical", "TEC06", "Operating systems", "Processes, memory, concurrency basics", 5, 1.0, 4, 12),
    ("technical", "TEC07", "Networking basics", "Protocols and layering fundamentals", 5, 1.0, 4, 12),
    ("technical", "TEC08", "Debugging skill", "Isolates and fixes defects methodically", 5, 1.2, 2, 12),
    ("technical", "TEC09", "Code quality", "Readable, maintainable work", 5, 1.0, 3, 12),
    ("technical", "TEC10", "Tooling proficiency", "Version control, editors, build tools", 5, 1.0, 2, 12),
    ("technical", "TEC11", "Project execution", "Delivers a working artefact", 5, 1.2, 4, 12),
    ("technical", "TEC12", "Technical documentation", "Explains work in writing", 5, 1.0, 4, 12),
    ("technical", "TEC13", "Technical explanation", "Explains a concept to a listener", 5, 1.2, 3, 12),
    ("technical", "TEC14", "Continuous learning", "Keeps skills current independently", 5, 1.0, 1, 12),

    # ---------------- Problem solving (12)
    ("problem_solving", "PRB01", "Problem comprehension", "Understands what is actually being asked", 5, 1.4, 1, 12),
    ("problem_solving", "PRB02", "Analytical reasoning", "Breaks problems into parts", 5, 1.4, 1, 12),
    ("problem_solving", "PRB03", "Logical reasoning", "Sound deduction and inference", 5, 1.2, 1, 12),
    ("problem_solving", "PRB04", "Quantitative aptitude", "Numerical and data reasoning", 5, 1.2, 1, 12),
    ("problem_solving", "PRB05", "Creative thinking", "Generates non-obvious options", 5, 1.0, 2, 12),
    ("problem_solving", "PRB06", "Structured approach", "Works to a method rather than by guesswork", 5, 1.2, 2, 12),
    ("problem_solving", "PRB07", "Edge-case thinking", "Considers what could break", 5, 1.2, 3, 12),
    ("problem_solving", "PRB08", "Time-bound problem solving", "Performs under a clock", 5, 1.2, 3, 12),
    ("problem_solving", "PRB09", "Trade-off evaluation", "Weighs competing options", 5, 1.0, 4, 12),
    ("problem_solving", "PRB10", "Root-cause analysis", "Finds causes, not just symptoms", 5, 1.2, 4, 12),
    ("problem_solving", "PRB11", "Attention to detail", "Catches errors and inconsistencies", 5, 1.0, 1, 12),
    ("problem_solving", "PRB12", "Priority setting", "Does the most important thing first", 5, 1.0, 2, 12),

    # ---------------- Career readiness (14)
    ("career_readiness", "CAR01", "Resume quality", "Clear, quantified, well-structured CV", 5, 1.4, 3, 12),
    ("career_readiness", "CAR02", "Interview readiness", "Performs in mock interview conditions", 5, 1.4, 4, 12),
    ("career_readiness", "CAR03", "HR question handling", "Handles behavioural questions well", 5, 1.2, 4, 12),
    ("career_readiness", "CAR04", "Technical interview handling", "Thinks aloud under technical questioning", 5, 1.4, 4, 12),
    ("career_readiness", "CAR05", "Group discussion performance", "Effective in GD rounds", 5, 1.2, 3, 12),
    ("career_readiness", "CAR06", "Aptitude test performance", "Scores well on aptitude rounds", 5, 1.2, 2, 12),
    ("career_readiness", "CAR07", "Industry awareness", "Knows the sector and roles", 5, 1.0, 4, 12),
    ("career_readiness", "CAR08", "Company research habit", "Prepares for specific employers", 5, 1.0, 5, 12),
    ("career_readiness", "CAR09", "Career goal clarity", "Has a defined, realistic target", 5, 1.0, 3, 12),
    ("career_readiness", "CAR10", "Professional networking", "Builds and uses professional contacts", 5, 0.8, 5, 12),
    ("career_readiness", "CAR11", "Workplace etiquette", "Understands professional norms", 5, 1.0, 3, 12),
    ("career_readiness", "CAR12", "Portfolio / projects", "Has demonstrable work to show", 5, 1.2, 4, 12),
    ("career_readiness", "CAR13", "Salary & offer literacy", "Understands offers and negotiation basics", 5, 0.8, 6, 12),
    ("career_readiness", "CAR14", "Onboarding readiness", "Ready to be productive in a first role", 5, 1.0, 6, 12),
]

# --------------------------------------------------------------------------- courses
COURSES: list[dict[str, Any]] = [
    {
        "title": "Communication Skills", "slug": "communication-skills", "stage": "Communication",
        "category": "Communication", "icon": "message-square", "difficulty": "Beginner",
        "durationHours": 18, "order": 1,
        "description": "Speak and write with clarity, structure and confidence in professional settings.",
        "tags": ["speaking", "writing", "listening"],
        "modules": [
            ("Foundations of clear speech", ["Why clarity wins", "Pace, pause and emphasis", "Cutting filler words"]),
            ("Verbal communication", ["Structuring a spoken answer", "Active listening", "Asking better questions"]),
            ("Written communication", ["Email etiquette & professional tone", "Short-form writing", "Proofreading habits"]),
        ],
    },
    {
        "title": "Interview Preparation", "slug": "interview-preparation", "stage": "Interview Ready",
        "category": "Interview", "icon": "user-check", "difficulty": "Intermediate",
        "durationHours": 22, "order": 2,
        "description": "Prepare for HR and technical rounds with structured answers and mock practice.",
        "tags": ["interview", "hr", "technical", "star"],
        "modules": [
            ("Before the interview", ["Researching the company", "Reading a job description", "Preparing your stories"]),
            ("HR rounds", ["Tell me about yourself", "Strengths & weaknesses", "Behavioural questions with STAR"]),
            ("Technical rounds", ["Thinking aloud", "Handling what you don't know", "Whiteboard communication"]),
        ],
    },
    {
        "title": "Group Discussion", "slug": "group-discussion", "stage": "Communication",
        "category": "Teamwork", "icon": "users", "difficulty": "Intermediate",
        "durationHours": 12, "order": 3,
        "description": "Contribute substance in group discussions without dominating the room.",
        "tags": ["gd", "teamwork", "debate"],
        "modules": [
            ("GD fundamentals", ["How GDs are assessed", "Entering a discussion", "Building on others"]),
            ("Advanced GD", ["Handling disagreement", "Summarising for the group", "Staying on the topic"]),
        ],
    },
    {
        "title": "Aptitude and Reasoning", "slug": "aptitude-and-reasoning", "stage": "Foundation",
        "category": "Problem Solving", "icon": "calculator", "difficulty": "Beginner",
        "durationHours": 26, "order": 4,
        "description": "Quantitative, logical and verbal reasoning for placement aptitude rounds.",
        "tags": ["aptitude", "quant", "logical", "verbal"],
        "modules": [
            ("Quantitative aptitude", ["Ratios & percentages", "Time, speed & distance", "Data interpretation"]),
            ("Logical reasoning", ["Series & patterns", "Syllogisms", "Puzzles & seating"]),
            ("Verbal reasoning", ["Reading comprehension", "Sentence correction", "Critical reasoning"]),
        ],
    },
    {
        "title": "Resume Building", "slug": "resume-building", "stage": "Interview Ready",
        "category": "Career", "icon": "file-text", "difficulty": "Beginner",
        "durationHours": 8, "order": 5,
        "description": "Build a resume that survives a six-second scan and an ATS filter.",
        "tags": ["resume", "cv", "ats"],
        "modules": [
            ("Resume anatomy", ["What recruiters scan first", "Section order that works", "ATS-safe formatting"]),
            ("Writing impact", ["Action verbs", "Quantifying results", "Tailoring per role"]),
        ],
    },
    {
        "title": "Personality Development", "slug": "personality-development", "stage": "Foundation",
        "category": "Behaviour", "icon": "sparkles", "difficulty": "Beginner",
        "durationHours": 16, "order": 6,
        "description": "Build self-awareness, resilience and the habits that make you easy to work with.",
        "tags": ["personality", "confidence", "habits"],
        "modules": [
            ("Self-awareness", ["Knowing your strengths", "Receiving feedback", "Growth mindset"]),
            ("Presence", ["Body language", "Voice and modulation", "First impressions"]),
        ],
    },
    {
        "title": "Workplace Etiquette", "slug": "workplace-etiquette", "stage": "Interview Ready",
        "category": "Behaviour", "icon": "briefcase", "difficulty": "Beginner",
        "durationHours": 10, "order": 7,
        "description": "Navigate meetings, email, feedback and escalation like a professional.",
        "tags": ["etiquette", "professionalism", "workplace"],
        "modules": [
            ("Day one professionalism", ["Meeting etiquette", "Written tone at work", "Time and commitments"]),
            ("Working with people", ["Giving and taking feedback", "Escalating well", "Inclusion at work"]),
        ],
    },
    {
        "title": "Business Communication", "slug": "business-communication", "stage": "Communication",
        "category": "Communication", "icon": "message-square", "difficulty": "Intermediate",
        "durationHours": 20, "order": 8, "trainerName": "Prof. Alan Walker",
        "description": "Professional writing and speaking for business contexts.",
        "tags": ["business", "email", "presentation"],
        "modules": [
            ("Professional writing", ["Email Etiquette & Professional Tone", "Writing for decisions", "Documenting clearly"]),
            ("Speaking at work", ["Status updates", "Presenting to stakeholders", "Difficult conversations"]),
        ],
    },
    {
        "title": "Coding & DSA", "slug": "coding-and-dsa", "stage": "Technical",
        "category": "Technical", "icon": "code", "difficulty": "Advanced",
        "durationHours": 40, "order": 9, "trainerName": "Prof. Rohan Mehta",
        "description": "Data structures and algorithms for technical interviews.",
        "tags": ["dsa", "coding", "algorithms"],
        "modules": [
            ("Arrays & strings", ["Arrays: Two Pointer Technique", "Sliding window", "String manipulation"]),
            ("Trees & graphs", ["Binary trees", "Traversals", "Graph basics"]),
            ("Problem patterns", ["Recursion & backtracking", "Dynamic programming intro", "Complexity analysis"]),
        ],
    },
    {
        "title": "Professional Ethics", "slug": "professional-ethics", "stage": "Foundation",
        "category": "Behaviour", "icon": "scale", "difficulty": "Beginner",
        "durationHours": 12, "order": 10, "trainerName": "Dr. Neha Sharma",
        "description": "Integrity, confidentiality and responsible conduct at work.",
        "tags": ["ethics", "integrity", "confidentiality"],
        "modules": [
            ("Ethical foundations", ["Why ethics matters at work", "Conflicts of interest", "Workplace Integrity & Confidentiality"]),
            ("Applied ethics", ["Data and privacy", "Speaking up safely", "Case discussions"]),
        ],
    },
]

# --------------------------------------------------------------------------- practice modes
PRACTICE_MODES: list[dict[str, Any]] = [
    {
        "code": "ai-roleplay", "title": "AI Role-play", "kind": "roleplay", "category": "Speaking",
        "icon": "bot", "difficulty": "intermediate", "durationMinutes": 12, "order": 1,
        "description": "Practice real-life conversations with AI across different scenarios.",
        "pillars": ["communication", "behaviour", "leadership"],
        "questions": [
            {"text": "A teammate missed a deadline and is defensive. How do you open the conversation?",
             "guidance": "Acknowledge feelings first, then move to a shared solution."},
        ],
    },
    {
        "code": "mock-interview", "title": "Mock Interview", "kind": "interview",
        "category": "Interview", "icon": "user-check", "difficulty": "intermediate",
        "durationMinutes": 25, "order": 2,
        "description": "Simulate interview rounds and get AI + expert feedback.",
        "pillars": ["career_readiness", "communication", "confidence"],
        "questions": [
            {"text": "Tell me about yourself.", "guidance": "Who you are → what you've done → what you bring."},
            {"text": "Walk me through your background and what makes you a strong fit for this role.",
             "guidance": "Connect two concrete achievements to the role's needs."},
            {"text": "Describe a time you handled a difficult stakeholder.",
             "guidance": "Use STAR: Situation, Task, Action, Result."},
            {"text": "What is your biggest weakness, and what are you doing about it?",
             "guidance": "Name a real one, then show the correction in progress."},
            {"text": "Where do you see yourself in three years?",
             "guidance": "Tie your goal to the role you're interviewing for."},
        ],
    },
    {
        "code": "presentation-coach", "title": "Presentation Coach", "kind": "presentation",
        "category": "Speaking", "icon": "presentation", "difficulty": "intermediate",
        "durationMinutes": 18, "order": 3,
        "description": "Create and deliver presentations with AI feedback on structure, clarity & impact.",
        "pillars": ["communication", "confidence", "technical"],
        "questions": [
            {"text": "Explain how a binary search tree keeps lookups fast, in under two minutes.",
             "guidance": "Open with the core idea, give one example, close with the trade-off."},
        ],
    },
    {
        "code": "group-discussion-lab", "title": "Group Discussion Lab", "kind": "discussion",
        "category": "Teamwork", "icon": "users", "difficulty": "advanced",
        "durationMinutes": 18, "order": 4,
        "description": "Practice group discussions on trending topics with AI moderation.",
        "pillars": ["leadership", "communication"],
        "questions": [
            {"text": "Is remote work better for early-career professionals? Contribute to the discussion.",
             "guidance": "Build on the previous speaker, then add one new dimension."},
        ],
    },
    {
        "code": "workplace-writing", "title": "Workplace Writing", "kind": "writing",
        "category": "Writing", "icon": "file-edit", "difficulty": "beginner",
        "durationMinutes": 12, "order": 5,
        "description": "Emails, reports, and business writing with AI feedback.",
        "pillars": ["communication"],
        "questions": [
            {"text": "Write an email informing a client that the delivery date has moved by one week.",
             "guidance": "Lead with the change, give the reason, state the next step."},
        ],
    },
    {
        "code": "speaking-fluency", "title": "Speaking Fluency", "kind": "speaking",
        "category": "Speaking", "icon": "mic", "difficulty": "beginner",
        "durationMinutes": 12, "order": 6,
        "description": "Improve fluency, vocabulary and pronunciation through guided practice.",
        "pillars": ["communication", "confidence"],
        "questions": [
            {"text": "Describe your daily routine for practising spoken English.",
             "guidance": "Speak for 60–90 seconds without stopping."},
        ],
    },
]

# --------------------------------------------------------------------------- games
def _options(items: list[tuple[str, str, int, list[str], bool, str]]) -> list[dict[str, Any]]:
    return [
        {
            "id": f"o{index + 1}", "text": text, "tag": tag, "delta": delta,
            "skills": skills, "best": best, "feedback": feedback,
        }
        for index, (text, tag, delta, skills, best, feedback) in enumerate(items)
    ]


GAMES: list[dict[str, Any]] = [
    {
        "code": "inbox-rescue", "title": "Inbox Rescue", "category": "Communication",
        "icon": "mail", "difficulty": "Beginner", "durationMinutes": 6, "xpReward": 50, "order": 1,
        "description": "Sort and respond to emails with clarity and priority.",
        "skillMap": ["Clarity", "Prioritisation", "Professional tone"],
        "levels": [
            {
                "title": "The overflowing inbox",
                "scenario": "Four emails arrived while you were in a session. One is from a client "
                            "asking for a status update, and the deadline is tomorrow.",
                "dialogue": [
                    {"speaker": "Client", "at": "09:12", "text": "Any update on the report? We present tomorrow."},
                ],
                "question": "Which reply do you send first?",
                "objectives": ["Identify the urgent item", "Answer the actual question",
                               "Set a clear next step"],
                "hint": "Answer the question that blocks someone else's work first.",
                "skillsAssessed": ["Prioritisation", "Clarity"],
                "options": _options([
                    ("The report is 80% done — I'll send it by 4pm today with the summary section first.",
                     "Clear and specific", 40, ["Clarity", "Prioritisation"], True,
                     "You answered the question and gave a commitment they can plan around."),
                    ("Working on it, will update soon.", "Vague", 10, ["Clarity"], False,
                     "This tells them nothing they can act on."),
                    ("Sorry for the delay, it's been a very busy week here.", "Apology without substance",
                     5, ["Professional tone"], False, "An apology is not an update."),
                    ("Let me check with the team and get back to you.", "Deflecting", 15,
                     ["Professional tone"], False, "Reasonable only if you name when."),
                ]),
            },
        ],
    },
    {
        "code": "conflict-navigator", "title": "Conflict Navigator", "category": "Communication",
        "icon": "users", "difficulty": "Intermediate", "durationMinutes": 8, "xpReward": 70, "order": 2,
        "description": "Resolve workplace conflicts with confidence.",
        "skillMap": ["Empathy", "Clarity", "Accountability", "De-escalation"],
        "levels": [
            {
                "title": "Missed handover",
                "scenario": "A teammate missed a handover and the client noticed.",
                "dialogue": [
                    {"speaker": "You", "at": "10:02", "text": "Hey, did the handover doc go out yesterday?"},
                    {"speaker": "Maya", "at": "10:03", "text": "I thought you were sending it."},
                ],
                "question": "How do you respond?",
                "objectives": ["Avoid blame", "Establish the facts", "Agree a fix"],
                "hint": "Separate the problem from the person.",
                "skillsAssessed": ["Empathy", "Accountability"],
                "options": _options([
                    ("Let's not worry who — the client needs it in an hour. I'll draft, you review?",
                     "Solution first", 40, ["Accountability", "De-escalation"], True,
                     "You protected the outcome and kept the relationship intact."),
                    ("I definitely told you it was yours.", "Blame", 0, ["Clarity"], False,
                     "Establishing fault does not fix the client's problem."),
                    ("Fine, I'll do it myself again.", "Passive-aggressive", 5, ["Accountability"], False,
                     "This stores up resentment for later."),
                    ("I'll flag it to our manager so it's documented.", "Escalating early", 15,
                     ["Accountability"], False, "Escalation before an attempt to fix reads as blame."),
                ]),
            },
            {
                "title": "Managing friction",
                "scenario": "A teammate has missed a deadline and becomes defensive when you ask "
                            "for an update.",
                "dialogue": [
                    {"speaker": "Alex", "at": "10:02",
                     "text": "Hey Maya, just checking in on the client report. It was due this "
                             "morning—can you share an update?"},
                    {"speaker": "Maya", "at": "10:03",
                     "text": "I'm aware of the deadline. I've been swamped. You don't need to "
                             "micromanage me."},
                ],
                "question": "How would you respond?",
                "objectives": [
                    "Identify the teammate's emotional state",
                    "Choose a response that shows empathy",
                    "Communicate clearly and constructively",
                    "De-escalate and keep the relationship strong",
                ],
                "hint": "Acknowledge their feelings first, then focus on finding a solution together.",
                "skillsAssessed": ["Empathy", "Clarity", "Accountability", "De-escalation"],
                "options": _options([
                    ("I hear that you're busy. Let's figure out what happened and how I can help "
                     "so we can get back on track together.",
                     "Best for collaboration", 50, ["Empathy", "De-escalation"], True,
                     "You acknowledged the pressure and moved straight to a shared solution."),
                    ("Deadlines are important. We need to make sure this doesn't happen again. "
                     "What went wrong?", "Good for accountability", 25,
                     ["Accountability", "Clarity"], False,
                     "Right instinct, but leading with the rule raises defences further."),
                    ("I'll escalate this to the manager since the deadline was missed.",
                     "May escalate conflict", 5, ["Accountability"], False,
                     "Escalating before a conversation damages trust."),
                    ("Okay, let me know when you're done.", "Less effective", 10, ["Empathy"], False,
                     "This avoids the conflict and leaves the deadline unresolved."),
                ]),
            },
        ],
    },
    {
        "code": "pitch-perfect", "title": "Pitch Perfect", "category": "Communication",
        "icon": "mic", "difficulty": "Intermediate", "durationMinutes": 7, "xpReward": 65, "order": 3,
        "description": "Deliver a short pitch that engages your audience.",
        "skillMap": ["Structure", "Impact", "Confidence"],
        "levels": [
            {
                "title": "Sixty seconds",
                "scenario": "You have one minute with a recruiter at a campus drive.",
                "dialogue": [{"speaker": "Recruiter", "at": "now", "text": "So — tell me why you."}],
                "question": "How do you open?",
                "objectives": ["Lead with relevance", "Give one proof point", "Close with a question"],
                "hint": "Lead with what they need, not with your chronology.",
                "skillsAssessed": ["Structure", "Impact"],
                "options": _options([
                    ("I build data tooling — I cut a report pipeline from 40 minutes to 4. Is that "
                     "the kind of work on your team?", "Impact-led", 45, ["Impact", "Structure"], True,
                     "Concrete result plus a question that opens a conversation."),
                    ("I'm a final-year CS student with a CGPA of 8.6.", "Credential-led", 15,
                     ["Structure"], False, "True, but every candidate says this."),
                    ("I'm passionate about technology and love to learn.", "Generic", 5,
                     ["Confidence"], False, "Nothing here distinguishes you."),
                    ("Let me walk you through my resume from the top.", "Chronological", 10,
                     ["Structure"], False, "A minute is too short for chronology."),
                ]),
            },
        ],
    },
    {
        "code": "priority-sprint", "title": "Priority Sprint", "category": "Problem Solving",
        "icon": "list-checks", "difficulty": "Beginner", "durationMinutes": 5, "xpReward": 60, "order": 4,
        "description": "Tackle tasks and manage time like a pro.",
        "skillMap": ["Prioritisation", "Planning", "Judgement"],
        "levels": [
            {
                "title": "Four things, one hour",
                "scenario": "A demo in an hour, a failing test, an unanswered client email and a "
                            "teammate asking for a review.",
                "dialogue": [{"speaker": "Calendar", "at": "now", "text": "Client demo in 60 minutes."}],
                "question": "What do you do first?",
                "objectives": ["Protect the commitment", "Unblock others", "Defer what can wait"],
                "hint": "Fix what breaks the thing that is about to happen.",
                "skillsAssessed": ["Prioritisation", "Judgement"],
                "options": _options([
                    ("Fix the failing test — the demo runs on that code path.", "Protects the demo",
                     45, ["Prioritisation", "Judgement"], True,
                     "You protected the imminent commitment first."),
                    ("Reply to the client email first — they've waited longest.", "Fairness-led", 20,
                     ["Judgement"], False, "Longest-waiting is not the same as most urgent."),
                    ("Review the teammate's PR so they aren't blocked.", "Unblocking", 25,
                     ["Planning"], False, "Good instinct, wrong hour."),
                    ("Prepare demo slides.", "Cosmetic", 10, ["Planning"], False,
                     "Slides don't matter if the demo crashes."),
                ]),
            },
        ],
    },
    {
        "code": "interview-lightning-round", "title": "Interview Lightning Round",
        "category": "Interview", "icon": "zap", "difficulty": "Advanced", "durationMinutes": 6,
        "xpReward": 60, "order": 5,
        "description": "Quick-fire questions. Smart answers.",
        "skillMap": ["Composure", "Structure", "Relevance"],
        "levels": [
            {
                "title": "Rapid fire",
                "scenario": "The interviewer moves fast and cuts you off twice.",
                "dialogue": [{"speaker": "Interviewer", "at": "now",
                              "text": "Thirty seconds: why should we hire you over the last candidate?"}],
                "question": "How do you answer?",
                "objectives": ["Stay composed", "Answer in one structure", "Stop on time"],
                "hint": "One claim, one proof, stop.",
                "skillsAssessed": ["Composure", "Structure"],
                "options": _options([
                    ("I ship. Last semester I took a stalled project to production in six weeks. "
                     "That's what I'd bring here.", "Tight and evidenced", 45,
                     ["Structure", "Relevance"], True, "One claim, one proof, finished on time."),
                    ("I can't speak to other candidates, but I'm a hard worker and fast learner.",
                     "Safe but empty", 15, ["Composure"], False, "Deflects without substance."),
                    ("That's an unfair question to ask.", "Defensive", 0, ["Composure"], False,
                     "Pushing back here reads as fragile under pressure."),
                    ("Let me walk you through my three main strengths in detail.", "Over-running",
                     10, ["Structure"], False, "You were given thirty seconds."),
                ]),
            },
        ],
    },
    {
        "code": "tone-detective", "title": "Tone Detective", "category": "Professional Writing",
        "icon": "search", "difficulty": "Intermediate", "durationMinutes": 6, "xpReward": 60, "order": 6,
        "description": "Spot the tone and make it more effective.",
        "skillMap": ["Professional tone", "Empathy", "Clarity"],
        "levels": [
            {
                "title": "Rewrite the reply",
                "scenario": "A colleague drafted a reply to a frustrated customer and asks you to check it.",
                "dialogue": [{"speaker": "Draft", "at": "now",
                              "text": "As I already explained in my previous email, this is not our fault."}],
                "question": "What's the best rewrite?",
                "objectives": ["Remove blame", "Keep the facts", "Offer a next step"],
                "hint": "Keep the facts, drop the scorekeeping.",
                "skillsAssessed": ["Professional tone", "Empathy"],
                "options": _options([
                    ("I'm sorry this is still causing problems. Here's what happened and what we "
                     "can do next.", "Warm and factual", 45, ["Professional tone", "Empathy"], True,
                     "Acknowledges the frustration, keeps the facts, moves forward."),
                    ("Per my previous email, the issue originated on your side.", "Cold", 5,
                     ["Clarity"], False, "Technically accurate, relationally expensive."),
                    ("We're really very sorry, this is entirely our fault and we'll fix everything.",
                     "Over-apologising", 15, ["Empathy"], False,
                     "Accepting fault you don't have creates a different problem."),
                    ("Please refer to the attached documentation.", "Dismissive", 5, ["Clarity"],
                     False, "This reads as a brush-off."),
                ]),
            },
        ],
    },
]

# --------------------------------------------------------------------------- exercises
EXERCISES: list[dict[str, Any]] = [
    {"code": "star-framework", "title": "Structure answers with STAR",
     "targetDimension": "interview_readiness", "practiceModeCode": "mock-interview",
     "estimatedMinutes": 20, "xpReward": 30, "order": 1,
     "steps": ["Situation — set the scene in one sentence", "Task — what you had to do",
               "Action — what you actually did", "Result — the measurable outcome"]},
    {"code": "pause-not-filler", "title": "Pause, don't fill",
     "targetDimension": "verbal_fluency", "practiceModeCode": "speaking-fluency",
     "estimatedMinutes": 10, "xpReward": 20, "order": 2,
     "steps": ["Record 60 seconds on any topic", "Mark every filler word",
               "Re-record, replacing each with a breath"]},
    {"code": "land-the-close", "title": "Land the close",
     "targetDimension": "confidence_presentation", "practiceModeCode": "presentation-coach",
     "estimatedMinutes": 15, "xpReward": 25, "order": 3,
     "steps": ["Write your final sentence", "Drop your pitch on the last phrase",
               "Hold two seconds of silence before moving"]},
    {"code": "workplace-register", "title": "Workplace register",
     "targetDimension": "behaviour_professionalism", "practiceModeCode": "workplace-writing",
     "estimatedMinutes": 15, "xpReward": 25, "order": 4,
     "steps": ["Open with courtesy", "State the ask in one line", "Confirm the next step and date"]},
    {"code": "build-on-others", "title": "Build on what others said",
     "targetDimension": "leadership_teamwork", "practiceModeCode": "group-discussion-lab",
     "estimatedMinutes": 18, "xpReward": 30, "order": 5,
     "steps": ["Name the previous speaker's point", "Add one new dimension",
               "Invite a quieter member in"]},
    {"code": "one-idea-per-sentence", "title": "One idea per sentence",
     "targetDimension": "professional_writing", "practiceModeCode": "workplace-writing",
     "estimatedMinutes": 12, "xpReward": 20, "order": 6,
     "steps": ["Write your paragraph long", "Split every 'and' into a new sentence",
               "Cut any sentence over 20 words"]},
]

# --------------------------------------------------------------------------- badges
ACHIEVEMENTS: list[dict[str, Any]] = [
    {"code": "7-day-streak", "title": "7-Day Streak", "description": "Maintain consistency for 7 days",
     "icon": "flame", "color": "#8B5CF6", "order": 1, "rule": {"kind": "streak", "days": 7}},
    {"code": "clear-communicator", "title": "Clear Communicator",
     "description": "Score 80+ in Communication", "icon": "message-square", "color": "#1E9E6B",
     "order": 2, "rule": {"kind": "pillar_score", "pillar": "communication", "score": 80}},
    {"code": "interview-ready", "title": "Interview Ready",
     "description": "Complete 3 mock interviews", "icon": "clipboard-check", "color": "#2F6FE4",
     "order": 3, "rule": {"kind": "practice_count", "count": 3}},
    {"code": "leadership-star", "title": "Leadership Star", "description": "Score 85+ in Leadership",
     "icon": "award", "color": "#9A9BB0", "order": 4,
     "rule": {"kind": "pillar_score", "pillar": "leadership", "score": 85}},
    {"code": "problem-solver", "title": "Problem Solver",
     "description": "Score 80+ in Problem Solving", "icon": "puzzle", "color": "#0EA5A0",
     "order": 5, "rule": {"kind": "pillar_score", "pillar": "problem_solving", "score": 80}},
    {"code": "confident-contributor", "title": "Confident Contributor",
     "description": "Score 80+ in Confidence", "icon": "trophy", "color": "#F2A93B", "order": 6,
     "rule": {"kind": "pillar_score", "pillar": "confidence", "score": 80}},
    {"code": "quick-learner", "title": "Quick Learner", "description": "Earn 1,000 XP",
     "icon": "zap", "color": "#4B3FE4", "order": 7, "rule": {"kind": "xp", "xp": 1000}},
]

# --------------------------------------------------------------------------- FAQs
FAQS: list[dict[str, Any]] = [
    {"order": 1, "question": "How do I register for Winners Creek?",
     "answer": "Most accounts are created by your institution. If public registration is enabled "
               "for your college, use Sign Up with your institutional email and college code, then "
               "verify your email with the code we send you."},
    {"order": 2, "question": "I can't access my account — what should I do?",
     "answer": "Check that your email is verified. After five failed sign-in attempts the account "
               "locks for a short period. If it persists, contact your department or institution "
               "administrator."},
    {"order": 3, "question": "How do I enrol in a course?",
     "answer": "Open Courses, choose a program and select Start Learning. Some programs are assigned "
               "to your batch by your trainer and appear automatically under My Learning."},
    {"order": 4, "question": "How do I submit an assignment?",
     "answer": "Go to My Learning, open the assignment and attach your file or add a note before the "
               "due date. Late submissions are only accepted if your trainer has allowed them."},
    {"order": 5, "question": "When do I get a certificate?",
     "answer": "Certificates require both a minimum session attendance and a minimum average "
               "assessment score. If only one is met you'll see the exact reason on your "
               "Achievements page — partial certificates are never issued."},
    {"order": 6, "question": "How do I reset my password?",
     "answer": "Use Forgot Password on the sign-in page. We'll email you a code and a link. Resetting "
               "your password signs you out of every other device for your security."},
    {"order": 7, "question": "How do I contact my trainer?",
     "answer": "Your trainer's name appears on each course and live class. Use the feedback thread on "
               "a practice attempt, or reach them through your department office."},
    {"order": 8, "question": "Are my practice recordings private?",
     "answer": "Yes. Recordings are stored encrypted in private storage, are visible only to you and "
               "your trainer, and are used solely to generate your feedback. You control recording "
               "consent in Settings."},
]

TESTIMONIALS: list[dict[str, Any]] = [
    {"order": 1, "name": "Demo learner — Batch C", "role": "B.Tech CSE, Semester 6",
     "quote": "The evidence-backed feedback showed me exactly which sentences were hurting my "
              "answers. That was more useful than any generic tip.",
     "readinessBefore": 64, "readinessAfter": 78, "demo": True},
    {"order": 2, "name": "Demo learner — Batch A", "role": "B.Tech ECE, Semester 5",
     "quote": "Practising group discussions with the lab meant my first real GD wasn't my first GD.",
     "readinessBefore": 58, "readinessAfter": 71, "demo": True},
    {"order": 3, "name": "Demo trainer", "role": "Faculty, Communication module",
     "quote": "I can see which pillar each participant is weakest on before I walk into the room.",
     "demo": True},
]

ANNOUNCEMENT_TEMPLATES: list[dict[str, Any]] = [
    {"kind": "class", "title": "Interview Techniques Masterclass",
     "body": "Dr. Neha Sharma runs a live masterclass on structuring interview answers. "
             "Open to all Semester 6 batches.", "public": True},
    {"kind": "assessment", "title": "Aptitude Test — Semester 6",
     "body": "The next aptitude assessment covers quantitative reasoning and data interpretation.",
     "public": True},
    {"kind": "deadline", "title": "Communication Assignment due",
     "body": "Submit a formal email and report for the Business Communication module.",
     "public": True},
    {"kind": "workshop", "title": "Resume Clinic",
     "body": "Bring a draft resume for a line-by-line review with the placement cell.",
     "public": True},
    {"kind": "placement", "title": "Placement training begins",
     "body": "Placement readiness training starts for all final-year batches this month.",
     "public": True},
    {"kind": "notice", "title": "Platform maintenance window",
     "body": "Winners Creek will be briefly unavailable during the scheduled maintenance window.",
     "public": True},
    {"kind": "course", "title": "New program: Workplace Etiquette",
     "body": "A new short program on professional conduct is now open for enrolment.",
     "public": True},
]

RUBRIC_CRITERIA = ("Communication", "Teamwork", "Leadership", "Presentation")

TRAINING_MODULES: list[dict[str, Any]] = [
    {"code": "TM-COMM", "name": "Communication", "description": "Spoken and written communication"},
    {"code": "TM-TEAM", "name": "Teamwork", "description": "Collaboration and group work"},
    {"code": "TM-LEAD", "name": "Leadership", "description": "Initiative, ownership and influence"},
    {"code": "TM-PRES", "name": "Presentation Skills", "description": "Structured public speaking"},
]
