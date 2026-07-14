# ApplyPilot AI

<p align="center">
<h1 align="center">🤖 ApplyPilot AI</h1>
<p align="center">
<strong>An AI-Powered Job Application Automation Platform that discovers relevant jobs, optimizes resumes, generates tailored cover letters, and automates the application workflow.</strong>
</p>
</p>

---

# 📌 Overview

ApplyPilot AI is an intelligent career assistant that simplifies the job application process. Instead of manually searching hundreds of job portals, customizing resumes, and tracking applications, users can automate their entire workflow using AI.

The platform analyzes resumes, matches jobs based on skills, generates ATS-friendly resumes and cover letters, tracks applications, and provides interview preparation insights.

---

# ✨ Features

## 👤 User Authentication
- Secure Login & Registration
- Google OAuth
- JWT Authentication
- User Profiles

## 💼 Job Discovery
- Search jobs from multiple job portals
- AI-powered job matching
- Location & salary filters
- Internship & full-time filtering
- Bookmark opportunities

## 📄 Resume Intelligence
- Resume Parsing
- ATS Score Analysis
- Keyword Gap Detection
- AI Resume Optimization
- Resume Version Management

## ✉️ Cover Letter Generator
- Personalized Cover Letters
- Company-Specific Content
- Recruiter-Friendly Templates
- Export as PDF

## 🤖 Auto Apply
- One-click job applications
- Form auto-fill
- Resume attachment
- Cover letter submission
- Application confirmation

## 📊 Dashboard
- Application Tracker
- Interview Schedule
- Rejection & Offer Analytics
- Saved Jobs
- Daily Application Statistics

## 🧠 AI Assistant
- Resume Review
- Interview Question Generator
- Skill Gap Analysis
- Career Recommendations
- Salary Insights

---

# 🛠 Tech Stack

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend
- Node.js
- Express.js
- REST APIs

### AI
- OpenAI / Gemini API
- LangChain
- Vector Search
- Prompt Engineering

### Database
- PostgreSQL
- Prisma ORM
- Redis

### Authentication
- NextAuth.js
- Google OAuth

### Deployment
- Docker
- Vercel
- Railway

---

# 🏗 Architecture

```text
User
 │
Next.js Frontend
 │
API Layer
 │
AI Engine
 │
Resume Parser ─ ATS Analyzer ─ Job Matcher
 │
Workflow Automation Engine
 │
PostgreSQL + Redis
```

---

# 📂 Folder Structure

```text
applypilot-ai/
├── app/
├── components/
├── actions/
├── lib/
├── prisma/
├── ai/
├── services/
├── public/
├── package.json
└── README.md
```

---

# 🗄 Database Models

- User
- Resume
- Job
- Company
- Application
- CoverLetter
- Interview
- Skill
- Notification

---

# 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | User Login |
| POST | /api/resume/upload | Upload Resume |
| POST | /api/jobs/search | Search Jobs |
| POST | /api/jobs/match | AI Job Matching |
| POST | /api/resume/analyze | ATS Analysis |
| POST | /api/cover-letter | Generate Cover Letter |
| POST | /api/apply | Submit Application |
| GET | /api/dashboard | User Dashboard |

---

# ⚙️ Installation

```bash
git clone https://github.com/yourusername/applypilot-ai.git
cd applypilot-ai
npm install
```

Create a `.env` file:

```env
DATABASE_URL=
NEXTAUTH_SECRET=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
REDIS_URL=
```

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# 🔒 Security

- OAuth Authentication
- Encrypted Credentials
- Rate Limiting
- Input Validation
- Secure Session Management
- CSRF Protection
- Audit Logs

---

# 🚀 Future Improvements

- LinkedIn Integration
- Indeed & Naukri Integration
- AI Recruiter Chat
- Portfolio Website Generator
- Interview Mock Simulator
- Email Follow-up Automation
- Browser Extension
- Mobile App

---

# 📝 Resume Description

**ApplyPilot AI — Intelligent Job Application Automation Platform**

- Built an AI-powered platform that automates job discovery, ATS resume analysis, personalized cover letter generation, and application tracking.
- Developed secure authentication, resume parsing, AI job matching, and workflow automation using Next.js, TypeScript, Node.js, PostgreSQL, and AI APIs.
- Designed a scalable architecture for intelligent career assistance with analytics and interview preparation tools.

> Replace these bullets with actual implementation details before using them on your resume.

---

# 🗺 Roadmap

- [ ] Authentication
- [ ] Resume Parser
- [ ] ATS Analyzer
- [ ] AI Job Matching
- [ ] Cover Letter Generator
- [ ] Auto Apply Engine
- [ ] Dashboard
- [ ] Interview Assistant
- [ ] Deployment

---

# 📄 License

MIT License

---

# 👨‍💻 Author

**Ritwik Singh**

- GitHub: https://github.com/theritwik
- LinkedIn: Add your LinkedIn URL

---

<p align="center">
Built to help job seekers land opportunities faster with AI 🚀
</p>
