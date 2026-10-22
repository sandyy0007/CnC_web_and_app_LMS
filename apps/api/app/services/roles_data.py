"""Roles, Job Descriptions, and Question Bank Database ported from apps/chatbot/roles_data.js.

Provides standardized, industry-aligned career profiles:
1. Data Scientist / Machine Learning Engineer
2. Senior Backend Python Engineer
3. Cloud DevOps & Platform Engineer
4. Senior Frontend React / Next.js Engineer
5. Full Stack Software Engineer
6. Cybersecurity & Incident Response Analyst

Along with EEDI 5-Parameter Evaluation Weights and diagnostic question banks.
"""
from __future__ import annotations

from typing import Any

EEDI_DEFAULT_WEIGHTS = {
    "technical": 30,         # Technical Knowledge (30%)
    "problemSolving": 25,    # Problem Solving (25%)
    "communication": 20,     # Communication (20%)
    "criticalThinking": 15,  # Critical Thinking (15%)
    "professionalism": 10,   # Professionalism (10%)
}

ROLES_DATABASE: dict[str, dict[str, Any]] = {
    "data-science-ai": {
        "id": "data-science-ai",
        "title": "Data Scientist / Machine Learning Engineer",
        "domain": "Artificial Intelligence & Data Science",
        "experienceLevel": "Mid to Senior (3-6 Years)",
        "experienceLevelDetails": "3+ years designing production ML pipelines, model evaluation, and feature engineering.",
        "jdSummary": "Seeking an applied Data Scientist / ML Engineer to design predictive models, evaluate machine learning pipelines, build vector-grounded RAG architectures, and deploy scalable inference microservices. The candidate must deeply understand supervised vs unsupervised algorithms, loss metrics, and feature drift.",
        "requiredSkills": [
            "machine learning",
            "supervised learning",
            "unsupervised learning",
            "python",
            "pandas",
            "numpy",
            "scikit-learn",
            "pytorch",
            "tensorflow",
            "vector databases",
            "faiss",
            "rag architecture",
            "feature engineering",
            "model evaluation",
            "sql"
        ],
        "technologies": ["Python", "PyTorch", "Scikit-Learn", "FAISS", "LangChain", "FastAPI", "Docker", "MLflow"],
        "responsibilities": [
            "Architect end-to-end training pipelines for classification, regression, and clustering",
            "Formulate diagnostic loss functions and evaluate models using cross-validation",
            "Implement Retrieval-Augmented Generation (RAG) pipelines with vector search",
            "Monitor production models for concept drift and inference latency"
        ],
        "questionBank": [
            {
                "id": "ds-q1",
                "category": "Technical",
                "difficulty": "Medium",
                "question": "Explain the difference between supervised and unsupervised learning, providing real-world examples for each.",
                "expectedAnswer": "Supervised learning trains models on labeled input-output pairs for prediction (classification/regression) against ground-truth targets (e.g. spam filtering, price forecasting). Unsupervised learning discovers hidden patterns or clusters in unlabeled data without predefined targets (e.g. customer segmentation with K-Means, anomaly detection).",
                "importantConcepts": [
                    "Labeled datasets with target labels vs Unlabeled datasets without ground-truth targets",
                    "Function approximation / mapping vs Pattern discovery / clustering",
                    "Supervised tasks: Classification and Regression",
                    "Unsupervised tasks: Clustering (K-Means, DBSCAN) and Dimensionality Reduction (PCA)",
                    "Concrete real-world use cases for both"
                ],
                "keywords": ["supervised", "unsupervised", "labeled", "unlabeled", "ground truth", "classification", "regression", "clustering", "k-means", "patterns"],
                "conditionCorrect": "Clearly contrasts labeled vs unlabeled data and provides valid real-world examples for both.",
                "conditionPenalty": "Penalty applied if student simply copies/echoes the question prompt, rambles about unrelated topics, or confuses labels with clusters."
            },
            {
                "id": "ds-q2",
                "category": "Technical",
                "difficulty": "Hard",
                "question": "How do you evaluate an imbalanced classification model? Why is accuracy misleading in this scenario?",
                "expectedAnswer": "Accuracy is misleading because predicting only the majority class can yield deceptively high accuracy while missing all critical minority instances (e.g. 99% accuracy in 1% fraud detection). Instead, use Precision, Recall, F1-Score, PR-AUC, and ROC-AUC, alongside confusion matrix analysis and techniques like SMOTE or cost-sensitive learning.",
                "importantConcepts": [
                    "Majority class bias masking false negatives",
                    "Precision vs Recall trade-off",
                    "F1-score harmonic mean",
                    "PR-AUC (Precision-Recall curve) superiority over ROC-AUC for high imbalance",
                    "Confusion matrix metrics"
                ],
                "keywords": ["imbalanced", "accuracy", "precision", "recall", "f1-score", "roc-auc", "confusion matrix", "majority class", "minority class", "false negatives"],
                "conditionCorrect": "Explains why accuracy is biased by the majority class and proposes balanced metrics such as Precision, Recall, or F1.",
                "conditionPenalty": "Penalty if the response recommends accuracy or fails to explain why high accuracy can coincide with zero true positives."
            }
        ]
    },
    "senior-python-backend": {
        "id": "senior-python-backend",
        "title": "Senior Backend Python Engineer",
        "domain": "Distributed Systems & Cloud Services",
        "experienceLevel": "Senior (4-7 Years)",
        "experienceLevelDetails": "4+ years designing high-throughput REST APIs, relational schemas, caching layers, and asynchronous event pipelines.",
        "jdSummary": "Seeking a Senior Backend Python Engineer to architect, build, and optimize scalable distributed microservices, APIs, and data ingestion pipelines. Required: Python, FastAPI, PostgreSQL, Database Indexing, Asyncio Concurrency, Docker & Kubernetes, Redis Caching, AWS.",
        "requiredSkills": [
            "python",
            "fastapi",
            "django",
            "postgresql",
            "sql",
            "database indexing",
            "query optimization",
            "asyncio",
            "concurrency",
            "docker",
            "kubernetes",
            "redis",
            "caching",
            "aws",
            "microservices",
            "rest apis",
            "ci/cd",
            "git"
        ],
        "technologies": ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker", "Kubernetes", "AWS", "Celery", "SQLAlchemy"],
        "responsibilities": [
            "Architect resilient asynchronous microservices and API gateways",
            "Analyze and tune PostgreSQL query execution plans using EXPLAIN ANALYZE",
            "Deploy containerized workloads to cloud clusters with automated CI/CD",
            "Implement distributed caching and message broker queues"
        ],
        "questionBank": [
            {
                "id": "py-q1",
                "category": "Technical",
                "difficulty": "Medium",
                "question": "How does asynchronous concurrency in Python asyncio differ from multi-threading and multi-processing? When would you use each?",
                "expectedAnswer": "asyncio uses single-threaded cooperative multitasking via an event loop with non-blocking I/O (coroutine suspension via await). Multi-threading uses OS threads but is constrained by Python's GIL for CPU work, though helpful for blocking I/O. Multi-processing bypasses the GIL by spawning independent OS processes with separate memory spaces, ideal for CPU-bound computational workloads.",
                "importantConcepts": [
                    "Event loop cooperative multitasking vs preemptive OS scheduling",
                    "Global Interpreter Lock (GIL) implications",
                    "I/O-bound (asyncio/threading) vs CPU-bound (multiprocessing)",
                    "Memory overhead: low for asyncio coroutines vs high for spawned processes",
                    "Context switching overhead"
                ],
                "keywords": ["asyncio", "event loop", "coroutine", "gil", "multithreading", "multiprocessing", "i/o-bound", "cpu-bound", "non-blocking", "await"],
                "conditionCorrect": "Accurately contrasts cooperative event loop I/O vs preemptive threads vs separate memory multi-processing.",
                "conditionPenalty": "Penalty if the response claims asyncio runs multiple threads simultaneously across multiple CPU cores."
            },
            {
                "id": "py-q2",
                "category": "Technical",
                "difficulty": "Hard",
                "question": "How do B-tree database indexes work in PostgreSQL, and how do you diagnose slow queries using EXPLAIN ANALYZE?",
                "expectedAnswer": "B-tree indexes maintain balanced hierarchical trees keeping keys sorted for logarithmic O(log N) lookups, range scans, and equality checks. EXPLAIN ANALYZE executes the query and returns the actual execution plan, showing total cost, execution time, node types (Seq Scan vs Index Scan vs Index Only Scan), buffer cache hits, and loops to identify missing indexes or expensive sequential scans.",
                "importantConcepts": [
                    "Balanced tree structure with O(log N) lookups",
                    "Seq Scan (Sequential full table scan) vs Index Scan vs Index Only Scan",
                    "EXPLAIN (estimated cost) vs EXPLAIN ANALYZE (actual execution run)",
                    "Composite indexes and leftmost prefix rule",
                    "Index maintenance cost on writes"
                ],
                "keywords": ["b-tree", "index", "postgresql", "explain analyze", "sequential scan", "index scan", "execution plan", "cost", "buffer", "lookup"],
                "conditionCorrect": "Explains sorted logarithmic lookups and distinguishes Seq Scan from Index Scan in execution plans.",
                "conditionPenalty": "Penalty if the student cannot define what an Index Scan is or confuses index creation with data deletion."
            }
        ]
    },
    "devops-cloud": {
        "id": "devops-cloud",
        "title": "Cloud DevOps & Platform Engineer",
        "domain": "Cloud Infrastructure & SRE",
        "experienceLevel": "Mid to Senior (4-8 Years)",
        "experienceLevelDetails": "4+ years managing cloud-native infrastructure, Kubernetes orchestration, CI/CD automation, and observability.",
        "jdSummary": "Looking for a Cloud DevOps Engineer to design, deploy, and maintain zero-downtime multi-region cloud infrastructures. Must have expertise in Kubernetes, Terraform IaC, Docker containerization, Prometheus/Grafana monitoring, and GitOps pipelines.",
        "requiredSkills": [
            "kubernetes",
            "docker",
            "terraform",
            "infrastructure as code",
            "aws",
            "gcp",
            "ci/cd",
            "github actions",
            "helm",
            "prometheus",
            "grafana",
            "linux",
            "bash",
            "networking",
            "gitops"
        ],
        "technologies": ["Kubernetes", "Docker", "Terraform", "AWS", "Helm", "Prometheus", "Grafana", "ArgoCD"],
        "responsibilities": [
            "Provision and maintain multi-tier cloud infrastructure using declarative Terraform",
            "Manage production Kubernetes clusters, Ingress controllers, and Helm charts",
            "Build zero-downtime blue/green and canary deployment pipelines",
            "Implement unified logging, alerting, and automated incident response"
        ],
        "questionBank": [
            {
                "id": "devops-q1",
                "category": "Technical",
                "difficulty": "Medium",
                "question": "What is the difference between a Kubernetes Deployment, StatefulSet, and DaemonSet? Give a use case for each.",
                "expectedAnswer": "A Deployment manages stateless pods with declarative updates and replica scaling (e.g. web API). A StatefulSet manages stateful pods requiring unique persistent network identifiers and stable attached storage (e.g. PostgreSQL or MongoDB primary-replica). A DaemonSet ensures that all (or eligible) nodes run exactly one copy of a Pod (e.g. log collector like Fluentd or node metrics exporter).",
                "importantConcepts": [
                    "Stateless vs Stateful workload requirements",
                    "Persistent volume claims and stable network identities in StatefulSets",
                    "Per-node scheduling in DaemonSets",
                    "Rolling update strategies"
                ],
                "keywords": ["deployment", "statefulset", "daemonset", "kubernetes", "stateless", "stateful", "persistent storage", "node", "pod", "replica"],
                "conditionCorrect": "Identifies the core distinction between stateless scaling, ordered stateful identity, and per-node daemon scheduling.",
                "conditionPenalty": "Penalty if the response confuses StatefulSet with stateless web servers."
            }
        ]
    },
    "frontend-react": {
        "id": "frontend-react",
        "title": "Senior Frontend React / Next.js Engineer",
        "domain": "Frontend Architecture & Web Performance",
        "experienceLevel": "Senior (4-6 Years)",
        "experienceLevelDetails": "4+ years building responsive enterprise SPAs/SSRs, component design systems, and optimizing Core Web Vitals.",
        "jdSummary": "Seeking a Senior Frontend Engineer proficient in React 18+, Next.js App Router, TypeScript, Tailwind CSS, and state management. The engineer will lead UI architecture, ensure WCAG 2.1 accessibility, and optimize web vitals (LCP, FID, CLS).",
        "requiredSkills": [
            "react",
            "next.js",
            "typescript",
            "javascript",
            "tailwind css",
            "html5",
            "css3",
            "state management",
            "redux",
            "react query",
            "core web vitals",
            "accessibility",
            "wcag",
            "rest apis",
            "responsive design"
        ],
        "technologies": ["React", "Next.js", "TypeScript", "Tailwind CSS", "Redux Toolkit", "Jest", "Playwright"],
        "responsibilities": [
            "Architect high-performance client and server components using Next.js App Router",
            "Establish unified design system tokens with responsive light and dark themes",
            "Optimize bundle sizes, code-splitting, image optimization, and Core Web Vitals",
            "Enforce strict accessibility, keyboard navigation, and semantic HTML standards"
        ],
        "questionBank": [
            {
                "id": "fe-q1",
                "category": "Technical",
                "difficulty": "Medium",
                "question": "What is the difference between React Server Components (RSC) and Client Components in Next.js App Router? When should you use 'use client'?",
                "expectedAnswer": "React Server Components execute strictly on the server, generating static HTML or serializable virtual DOM without sending JavaScript bundles to the browser, reducing client bundle size and allowing direct server-side database access. Client Components ('use client') run on both server (for SSR) and client, enabling browser APIs, React state hooks (useState, useEffect), and interactive event listeners (onClick, onChange). Use 'use client' only at the leaf nodes requiring user interactivity or browser APIs.",
                "importantConcepts": [
                    "Zero-bundle-size server execution vs browser hydration",
                    "Direct backend/db access in RSC vs API fetching in Client components",
                    "Interactivity boundary: hooks (useState, useEffect) require 'use client'",
                    "Leaf-node architectural pattern for client boundaries"
                ],
                "keywords": ["server components", "client components", "use client", "next.js", "hydration", "bundle size", "interactive", "hooks", "usestate", "event listener"],
                "conditionCorrect": "Accurately contrasts zero-bundle server execution with client hydration and hooks.",
                "conditionPenalty": "Penalty if the response claims 'use client' means the component never renders on the server."
            }
        ]
    },
    "fullstack-web": {
        "id": "fullstack-web",
        "title": "Full Stack Software Engineer",
        "domain": "Full Lifecycle Web Application Engineering",
        "experienceLevel": "Mid-Level (3-5 Years)",
        "experienceLevelDetails": "3+ years engineering modern web apps across React/Next.js frontends, Python/Node backends, and relational/NoSQL datastores.",
        "jdSummary": "Seeking a versatile Full Stack Software Engineer to build end-to-end features. Must be proficient in TypeScript, React, Python/FastAPI, SQL databases, Docker, and RESTful API integration.",
        "requiredSkills": [
            "full stack",
            "javascript",
            "typescript",
            "react",
            "python",
            "fastapi",
            "node.js",
            "sql",
            "postgresql",
            "mongodb",
            "docker",
            "rest apis",
            "git",
            "html5",
            "css3"
        ],
        "technologies": ["React", "TypeScript", "Python", "FastAPI", "PostgreSQL", "Docker", "Tailwind CSS"],
        "responsibilities": [
            "Design and build responsive frontend user interfaces and authenticated API consumers",
            "Develop secure REST endpoints with role-based access control and input validation",
            "Model relational schemas and maintain database migration scripts",
            "Participate in full SDLC from sprint design to containerized deployment"
        ],
        "questionBank": [
            {
                "id": "fs-q1",
                "category": "Technical",
                "difficulty": "Medium",
                "question": "How do you protect a modern full-stack web application against Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF)?",
                "expectedAnswer": "To prevent XSS, sanitize and escape all user input, use React's built-in JSX escaping, configure strict Content Security Policy (CSP) headers, and store sensitive session tokens in HttpOnly cookies rather than localStorage. To prevent CSRF, use SameSite=Lax/Strict cookie flags, issue and validate anti-CSRF tokens for state-changing POST/PUT requests, or use Authorization Bearer headers for API endpoints.",
                "importantConcepts": [
                    "XSS: Script injection in client context; prevented via escaping, CSP, and HttpOnly cookies",
                    "CSRF: Unauthorized requests from external origins; prevented via SameSite cookies and CSRF tokens",
                    "HttpOnly cookie isolation from document.cookie",
                    "Input validation and output encoding"
                ],
                "keywords": ["xss", "csrf", "cross-site scripting", "httponly", "samesite", "content security policy", "csp", "tokens", "sanitization", "cookies"],
                "conditionCorrect": "Explains both attack vectors and their respective defenses (HttpOnly/CSP for XSS, SameSite/tokens for CSRF).",
                "conditionPenalty": "Penalty if the response confuses XSS with SQL injection or claims HTTPS stops XSS."
            }
        ]
    },
    "cyber-security": {
        "id": "cyber-security",
        "title": "Cybersecurity & Incident Response Analyst",
        "domain": "Information Security & Threat Analysis",
        "experienceLevel": "Mid to Senior (3-6 Years)",
        "experienceLevelDetails": "3+ years analyzing SIEM telemetry, vulnerability management, penetration testing, and incident containment.",
        "jdSummary": "Seeking a Cybersecurity Analyst to monitor threat vectors, conduct vulnerability assessments, harden cloud infrastructures, and investigate security alerts. Knowledge of MITRE ATT&CK, SIEM, network protocols, and ethical hacking is required.",
        "requiredSkills": [
            "cybersecurity",
            "information security",
            "siem",
            "incident response",
            "network security",
            "vulnerability assessment",
            "mitre att&ck",
            "wireshark",
            "linux",
            "python",
            "firewalls",
            "cryptography",
            "penetration testing"
        ],
        "technologies": ["Wireshark", "Splunk / ELK", "Nmap", "Metasploit", "Burp Suite", "Snort", "Linux"],
        "responsibilities": [
            "Monitor security operations center (SOC) dashboards and triage incoming alerts",
            "Investigate security incidents, collect digital forensics, and lead root-cause containment",
            "Perform vulnerability scans and coordinate patch management across server fleets",
            "Enforce zero-trust security postures and conduct security awareness reviews"
        ],
        "questionBank": [
            {
                "id": "sec-q1",
                "category": "Technical",
                "difficulty": "Medium",
                "question": "What is the difference between Symmetric and Asymmetric encryption? When is each used in the TLS handshake?",
                "expectedAnswer": "Symmetric encryption uses a single shared secret key for both encryption and decryption (e.g. AES), making it fast and suitable for bulk data transfer. Asymmetric encryption uses a mathematically linked public-private key pair (e.g. RSA, ECC), enabling secure key exchange and digital identity verification without sharing private secrets. In a TLS handshake, asymmetric encryption verifies server identity and securely negotiates a session key, after which symmetric encryption encrypts all subsequent application traffic for speed.",
                "importantConcepts": [
                    "Single shared key (Symmetric) vs Public/Private key pair (Asymmetric)",
                    "Computational speed: Symmetric is orders of magnitude faster",
                    "Key distribution problem solved by Asymmetric",
                    "TLS hybrid architecture: Asymmetric for handshake / key exchange, Symmetric for data stream"
                ],
                "keywords": ["symmetric", "asymmetric", "encryption", "public key", "private key", "tls handshake", "aes", "rsa", "session key", "hybrid"],
                "conditionCorrect": "Accurately contrasts key architecture, speed, and explains the hybrid role in TLS.",
                "conditionPenalty": "Penalty if the student claims symmetric encryption uses two keys or that asymmetric encrypts bulk streaming data."
            }
        ]
    }
}

