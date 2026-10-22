"""ATS Resume Scoring and Skill Gap Analysis Service.

Ported and enhanced from apps/chatbot/Resume_ats_scorer.ipynb and app.js.
Performs deterministic keyword extraction, section detection, and role-grounded ATS scoring (0-100).
Extracts verified skill gaps to feed into the Centralized Skill Gap and Course Recommendation Engines.
"""
from __future__ import annotations

import re
from typing import Any

from app.services.roles_data import ROLES_DATABASE

STANDARD_SECTIONS = ["summary", "experience", "education", "skills", "projects", "certifications"]

COMMON_TECH_DICTIONARY = {
    "python", "java", "javascript", "typescript", "c++", "c#", "golang", "rust", "ruby", "php",
    "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "cassandra", "sqlite",
    "docker", "kubernetes", "terraform", "helm", "aws", "azure", "gcp", "linux", "bash",
    "ci/cd", "git", "github actions", "gitlab", "jenkins", "fastapi", "django", "flask",
    "react", "next.js", "vue", "angular", "node.js", "express", "graphql", "rest", "rest apis",
    "microservices", "asyncio", "celery", "rabbitmq", "kafka", "pandas", "numpy", "scikit-learn",
    "pytorch", "tensorflow", "keras", "opencv", "faiss", "langchain", "langgraph", "llm", "rag",
    "system design", "database indexing", "agile", "scrum", "prometheus", "grafana", "wireshark",
    "siem", "mitre att&ck", "cryptography", "cybersecurity", "html5", "css3", "tailwind css",
    "redux", "unit testing", "pytest", "playwright", "jest"
}


def extract_skills_from_text(text: str) -> list[str]:
    """Extract recognized technical keywords present in the text."""
    lowered = text.lower()
    matched = []
    for skill in COMMON_TECH_DICTIONARY:
        # Match word boundaries or exact phrase
        pattern = r"(?:\b|_)" + re.escape(skill) + r"(?:\b|_)"
        if re.search(pattern, lowered):
            matched.append(skill)
    return sorted(list(set(matched)))


def analyze_resume_ats(
    resume_text: str,
    role_key: str = "senior-python-backend",
    custom_jd: str | None = None,
) -> dict[str, Any]:
    """Role-grounded ATS Resume Analysis.
    
    Returns deterministic scores, matched skills, missing skills, and actionable feedback.
    """
    if not resume_text or len(resume_text.strip()) < 20:
        role_info = ROLES_DATABASE.get(role_key, {})
        target_title = role_info.get("title", "Target Role")
        return {
            "overallScore": 0,
            "matchLevel": "Insufficient Content",
            "wordCount": 0,
            "detectedSections": [],
            "missingSections": STANDARD_SECTIONS,
            "matchedSkills": [],
            "missingSkills": [],
            "targetRole": role_key,
            "targetRoleTitle": target_title,
            "critique": "Uploaded resume text is too short or empty. Please upload a valid text-based resume.",
            "actionItems": ["Upload a standard PDF, DOCX, or text file with your full educational and technical details."]
        }

    lowered = resume_text.lower()
    words = re.findall(r"\b[a-zA-Z0-9_\-\+\#\.]+\b", lowered)
    word_count = len(words)

    # 1. Section Presence
    detected_sections = [s for s in STANDARD_SECTIONS if s in lowered]
    missing_sections = [s for s in STANDARD_SECTIONS if s not in detected_sections]
    section_score = int((len(detected_sections) / len(STANDARD_SECTIONS)) * 30)

    # 2. Target Role Requirements
    role_data = ROLES_DATABASE.get(role_key)
    if role_data:
        target_role_title = role_data["title"]
        required_skills = [s.lower() for s in role_data.get("requiredSkills", [])]
    else:
        target_role_title = "Custom Role"
        if custom_jd:
            required_skills = extract_skills_from_text(custom_jd)
        else:
            required_skills = list(COMMON_TECH_DICTIONARY)[:10]

    # 3. Match against required skills
    matched_required = []
    missing_required = []
    for req in required_skills:
        pattern = r"(?:\b|_)" + re.escape(req) + r"(?:\b|_)"
        if re.search(pattern, lowered):
            matched_required.append(req)
        else:
            missing_required.append(req)

    # All technical skills extracted from resume
    all_extracted_skills = extract_skills_from_text(resume_text)

    # Skill score (max 40)
    if required_skills:
        skill_score = min(40, int((len(matched_required) / len(required_skills)) * 40))
    else:
        skill_score = min(40, len(all_extracted_skills) * 4)

    # 4. Length and Formatting Score (max 30)
    # Ideal professional resume length: 300 - 1200 words
    if 300 <= word_count <= 1200:
        length_score = 30
    elif 150 <= word_count < 300 or 1200 < word_count <= 1800:
        length_score = 20
    elif word_count > 50:
        length_score = 10
    else:
        length_score = 5

    # Overall Score (0 - 100)
    overall_score = min(100, max(0, section_score + skill_score + length_score))

    # Match Level Verdict
    if overall_score >= 85:
        match_level = "High Compatibility"
    elif overall_score >= 65:
        match_level = "Moderate Compatibility"
    else:
        match_level = "Low Compatibility"

    # Actionable items & critique
    action_items = []
    if missing_required:
        action_items.append(
            f"Add hands-on projects or experience with missing critical skills: {', '.join(missing_required[:4])}."
        )
    if missing_sections:
        action_items.append(
            f"Add dedicated standard sections for: {', '.join(missing_sections)}."
        )
    if word_count < 300:
        action_items.append(
            f"Expand concise descriptions of your project outcomes and responsibilities (current: {word_count} words; target: 400-800 words)."
        )

    # Check for quantitative impact metrics
    quantified_count = len(re.findall(r"\b\d+(?:\.\d+)?%|\b\d{2,}\b", resume_text))
    if quantified_count < 2:
        action_items.append("Quantify your achievements using measurable metrics (e.g. 'reduced latency by 35%', 'handled 50K requests').")

    critique = (
        f"Analyzed against '{target_role_title}'. Found {len(matched_required)} of {len(required_skills)} required technical skills. "
        f"Overall ATS score is {overall_score}/100 ({match_level}). "
    )
    if action_items:
        critique += "Primary recommendation: " + action_items[0]

    return {
        "overallScore": overall_score,
        "matchLevel": match_level,
        "wordCount": word_count,
        "targetRole": role_key,
        "targetRoleTitle": target_role_title,
        "sectionScore": section_score,
        "skillScore": skill_score,
        "lengthScore": length_score,
        "detectedSections": detected_sections,
        "missingSections": missing_sections,
        "matchedSkills": matched_required,
        "missingSkills": missing_required,
        "allExtractedSkills": all_extracted_skills,
        "quantifiedMetricsCount": quantified_count,
        "actionItems": action_items,
        "critique": critique,
    }

