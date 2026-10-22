# Soft-Skills Course Catalog & Curriculum Architecture

## Overview
Winners Creek LMS for Arya College of Engineering & IT has completed a complete curricular transition from miscellaneous technical demo courses to an **exclusively Soft-Skills and Career-Readiness Course Catalog**.

Technical courses (e.g. *Advanced Java*, *Cloud Systems*, *DevOps Mastery*, *Neural Networks*, *Python Architecture*, *Online Global Seminar*) have been unpublished (`published = FALSE`) and retired from active student and public catalogs.

---

## 1. The Active Soft-Skills Course Catalog

The active institutional catalog consists of exactly **8 professional development courses**:

| # | Course Title | Slug | Code | Duration | Category | Enrollment Status |
| :- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Soft Skills – Arya Old** *(Lead Course)* | `soft-skills-arya-old` | `SS-ARYA-OLD` | 40 Hours | Soft Skills | **All 1,087 Students Enrolled** |
| 2 | Professional Communication & Business English | `professional-communication-and-business-english` | `SS-PCBE` | 36 Hours | Soft Skills | Available / Elective Track |
| 3 | Public Speaking and Presentation Skills | `public-speaking-and-presentation-skills` | `SS-PSPS` | 30 Hours | Soft Skills | Available / Elective Track |
| 4 | Leadership and Team Collaboration | `leadership-and-team-collaboration` | `SS-LTC` | 30 Hours | Soft Skills | Available / Elective Track |
| 5 | Personality Development & Confidence Building | `personality-development-and-confidence-building` | `SS-PDCB` | 32 Hours | Soft Skills | Available / Elective Track |
| 6 | Interview Skills and Career Readiness | `interview-skills-and-career-readiness` | `SS-ISCR` | 40 Hours | Soft Skills | Available / Elective Track |
| 7 | Group Discussion & Workplace Communication | `group-discussion-and-workplace-communication` | `SS-GDWC` | 30 Hours | Soft Skills | Available / Elective Track |
| 8 | Critical Thinking, Problem Solving & Decision Making | `critical-thinking-problem-solving-and-decision-making` | `SS-CTPS` | 32 Hours | Soft Skills | Available / Elective Track |

---

## 2. Lead Course Detailed Syllabus: `Soft Skills – Arya Old`

The flagship course `Soft Skills – Arya Old` (`SS-ARYA-OLD`) is populated with 5 structured academic modules and 15 interactive multimedia lessons:

### Module 1: Foundations of Professional Communication
- **Order**: 1
- **Description**: Core principles of verbal and non-verbal communication, tone moderation, and active listening for professional environments.
- **Lessons**:
  1. *The Communication Matrix & First Impressions* (30 min, `VIDEO`)
  2. *Active Listening and Non-Verbal Cues* (45 min, `INTERACTIVE`)
  3. *Professional Email Writing and Tone Control* (40 min, `READING`)

### Module 2: Placement Resume Architecture & ATS Optimization
- **Order**: 2
- **Description**: Industry standard resume structuring, quantifiable impact bullet points, and ATS keywords for technical campus placements.
- **Lessons**:
  1. *Deconstructing High-Impact ATS Resumes* (35 min, `VIDEO`)
  2. *Quantifying Impact: The XYZ Action-Result Formula* (50 min, `PRACTICE`)
  3. *Common Resume Traps & Verification Checklist* (25 min, `QUIZ`)

### Module 3: Placement Group Discussion Mastery
- **Order**: 3
- **Description**: Strategic frameworks for case study and abstract group discussions, initiating, turn-taking, and consensus building.
- **Lessons**:
  1. *GD Dynamics: Roles, Etiquette, and Scoring Rubrics* (40 min, `VIDEO`)
  2. *Structuring Content Under Time Pressure: The PESTLE Framework* (45 min, `PRACTICE`)
  3. *Intervention Techniques & Conflict Handling* (35 min, `INTERACTIVE`)

### Module 4: Campus Placement Technical & HR Mock Interviews
- **Order**: 4
- **Description**: Mastering behavioral questions, technical articulation, the STAR story technique, and professional body language.
- **Lessons**:
  1. *Mastering 'Tell Me About Yourself' with Gravitas* (30 min, `VIDEO`)
  2. *The STAR Method: Structuring Behavioral Responses* (60 min, `PRACTICE`)
  3. *Navigating Weaknesses, Gaps, and Salary Expectations* (45 min, `INTERACTIVE`)

### Module 5: Corporate Etiquette, Team Dynamics & Career Agility
- **Order**: 5
- **Description**: Workplace professionalism, conflict resolution, collaborative teamwork, and continuous growth mindset.
- **Lessons**:
  1. *Meeting Etiquette and Virtual Presence* (30 min, `VIDEO`)
  2. *Constructive Feedback & Psychological Safety in Teams* (45 min, `READING`)
  3. *Cap-Stone Capstone: 360-Degree Employability Simulation* (60 min, `PRACTICE`)

---

## 3. Universal Student Enrollment Verification

Every single verified student record (1,087 students) is enrolled in `Soft Skills – Arya Old`:

```sql
SELECT c.title, e.enrollment_status, e.access_status, count(*) as count
FROM enrollments e
JOIN courses c ON e.course_id = c.id
WHERE c.code = 'SS-ARYA-OLD'
GROUP BY c.title, e.enrollment_status, e.access_status;
```

**Results**:
- `Soft Skills – Arya Old (ACTIVE | ACTIVE)`: **950 Students** (all Sem 3 students + fee-verified Sem 7 students)
- `Soft Skills – Arya Old (ACTIVE | INACTIVE)`: **137 Students** (Sem 7 students pending fee verification)
- **Total Arya College Enrollments**: **1,087**

---

## 4. API Verification Evidence

### 4.1 Public Catalog (`GET /api/v1/courses`)
```bash
curl -s http://localhost:8000/api/v1/courses | jq '.data[] | {title, category, published}'
```
**Output**:
- Total courses returned: **8**
- Non-Soft Skills courses returned: **0**
- Published status: 100% `true`

### 4.2 Student Enrolled Courses (`GET /api/v1/student/courses`)
```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/student/courses | jq '.data[] | {title, code, category, enrolled}'
```
**Output**:
- All 8 courses returned with `category: "Soft Skills"`.
- `SS-ARYA-OLD` reflects `enrolled: true`.
- Zero technical courses displayed.

