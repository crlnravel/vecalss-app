# **Vecalss LMS Use Case Specifications**

1. ## **Revision History**

| Version | Description (Changes) |
| :---: | ----- |
| 1.0 | Initial document. |
|  |  |
|  |  |

2. ## **Scope and Actors**

| Actor | Description |
| :---: | ----- |
| Guest | A visitor on the pre-login landing page who may register or log in. |
| Student | The primary learner who studies modules, takes quizzes and tryouts, tracks progress, and uses Vera AI. |
| Kapten | A support role that monitors student progress, intervenes based on risk flags, and helps interpret learning gaps. (Permissions restricted to student data view and communication). |
| Admin | A platform operator who manages content, banners, question banks, announcements, and system-wide visibility. |

3. ## **Standardized Priority Scale**

| Scale | Description |
| :---: | ----- |
| P0 (Critical) | Must-have for MVP launch. The system cannot function without this. |
| P1 (High) | Core value proposition features. Required for launch but have minor workarounds. |
| P2 (Enhancement) | "Smart" features or optimizations that can follow post-launch. |

4. ## **Use Case Specifications**

### **UC-00: User Authentication and Session Management**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P0 |
| **Primary Actor** | Guest and Student |
| **Goal** | Allow users to securely log in, reset passwords, and maintain an active session. |
| **Preconditions** | \- |
| **Trigger** | Guest clicks “Login” from the landing page. |
| **Main Scenario** | Guest enters credentials (email/password). System validates input against auth provider. System verifies existing credentials. System issues secure session tokens. System routes user to onboarding flow (if first login) or dashboard. |
| **Alternate Flows** | The user requests a password reset; the system emails a time-bound reset link. |
| **Exception Flows** | **Auth Service Down** If auth service is down, display a "Service Unavailable" banner.  If credentials fail, log the failed attempt and display a generic "Invalid credentials" error. Lock account after 5 failed attempts.  |
| **Postconditions** | Session is active in the authentication service. The user's last login time is recorded. |
| **Non-functional** | Password hashing must use a secure hashing algorithm (e.g. Bcrypt) Password reset link expires in 15 minutes. |

### 

### **UC-01: Browse Landing Page and Enter Platform**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P0 |
| **Primary Actor** | Guest |
| **Goal** | Help a visitor understand Vecalss, learn about available programs, and proceed to either registration or login. |
| **Preconditions** | The landing page is available. Program information, announcements, and call-to-action (CTA) configurations are published. |
| **Trigger** | Guest opens the Vecalss public website URL. |
| **Main Scenario** | Guest accesses the Vecalss landing page. System displays the hero section, About Vecalss, program overview, and available learning offerings. System displays active announcements or promotional banners (if available). Guest selects either "Register" or "Login". If the guest selects "Register", the system redirects the guest to the official registration Google Form. If the guest selects "Login", the system routes the guest to the authentication flow (UC-00). |
| **Alternate Flows** | If no active announcement or promotional banner exists, the landing page is rendered without the banner section. If the guest is not yet registered in the Vecalss student database and attempts to log in, the system displays guidance to complete the registration form first. |
| **Exception Flows** | **CMS Content Unavailable** If CMS content is unavailable, serve a fallback landing page with the primary CTAs intact. |
| **Postconditions** | Landing page view analytics are recorded. The guest is redirected to either the registration form or authentication flow |
| **Non-functional** | Fully responsive across mobile breakpoints. |

### **UC-02: Complete First-Login Onboarding**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P1 |
| **Primary Actor** | Student |
| **Goal** | Orient a newly logged-in student to the dashboard, modules, tryouts, and daily learning rhythm.   |
| **Preconditions** | Student account has been created by an administrator. Student successfully logs in for the first time. |
| **Trigger** | Student completes first successful login.   |
| **Main Scenario** | System detects that the student is logging in for the first time. System displays a welcome guide introducing the platform's key features. Student reviews the onboarding information. Student confirms or updates their target university, major, or exam goals. System saves the onboarding information. System marks onboarding as completed. System redirects the student to the dashboard. |
| **Alternate Flows** | Student chooses to skip onboarding. System stores default values and redirects the student to the dashboard. |
| **Exception Flows** | \- |
| **Postconditions** | Student onboarding status is marked as completed. Student profile information is stored or updated. Student gains access to the dashboard. |
| **Non-functional** | \- |

### 

### 

### **UC-03: View Dashboard and Study Priorities**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P0 |
| **Primary Actor** | Student |
| **Goal** | Give the student a focused home view containing daily missions, countdowns, summary progress, and next best actions.   |
| **Preconditions** | The student is authenticated. |
| **Trigger** | Student opens Home/Dashboard.   |
| **Main Scenario** | System queries analytics DB for progress summary and latest tryout score. The system loads countdown widgets based on target exam dates. The system fetches daily mission status. The system highlights weak subtests based on recent analytics. The system renders all components. |
| **Alternate Flows** | New student with no data sees starter recommendations and zero-state progress bars. |
| **Exception Flows** | \- |
| **Postconditions** | Dashboard view event is logged in analytics. |
| **Non-functional** | \- |

### 

### **UC-04: Study Sequential Learning Module**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P0 |
| **Primary Actor** | Student |
| **Goal** | Let a student study structured materials by subtest and topic in the intended order. |
| **Preconditions** | Student is authenticated. Modules are published in the CMS. |
| **Trigger** | Student selects "Materi Runtun" from dashboard or sidebar. |
| **Main Scenario** | Student selects a subtest. System fetches topic modules and completion status. Student opens next available module. System streams text, video, and examples. Student marks module as complete. System records completion and unlocks the next sequential module. |
| **Alternate Flows** | Student returns to an in-progress module System restores video timestamp/scroll position. |
| **Exception Flows** | **Progress Save Fails** If progress save fails, display a non-blocking toast warning "Syncing progress..." and append the action to a local sync queue. |
| **Postconditions** | The module is marked as completed for the student. The next sequential module becomes available to the student. |
| **Non-functional** | \- |

### 

### 

### **UC-05: Complete Module Quiz**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P0 |
| **Primary Actor** | Student |
| **Goal** | Validate comprehension after a learning module and store quiz results. |
| **Preconditions** | Student has opened a module with an attached quiz. |
| **Trigger** | Student clicks "Start Quiz". |
| **Main Scenario** | System fetches quiz items and renders the first question. Student answers items and submits. System validates submission payload and executes auto-scoring logic. System calculates score and records answer history. System displays score, explanations, and updates topic performance metrics. |
| **Alternate Flows** | Student closes browser mid-quiz System saves draft state periodically. |
| **Exception Flows** | \- |
| **Postconditions** | The student's quiz attempt and score are saved. The student's mastery level for that topic is updated. |
| **Non-functional** | \- |

### 

### **UC-06: Take Tryout and Review Results**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P0 |
| **Primary Actor** | Student |
| **Goal** | Complete a timed tryout, receive score, detailed statistics, and study recommendations. |
| **Preconditions** | Tryout package is published. Timer rules configured. |
| **Trigger** | Student selects a tryout. |
| **Main Scenario** | System initiates server-side timer session and sends initial timestamp to client. Student answers questions. System auto-submits exactly at timeout (or accepts manual submission prior). System auto-scores and calculates national/cohort percentiles. System displays result, explanations, and updates recommendation engine. |
| **Alternate Flows** | \- |
| **Exception Flows** | **Student Disconnected Mid-Tryout** If connectivity drops, answers buffer in LocalStorage indefinitely. Frontend timer pauses visually but records disconnect timestamp. Upon reconnection, system reconciles; if time expired offline, system forces an immediate background submission of buffered answers. |
| **Postconditions** | The tryout session is marked as completed. The student's score, per-question answers, and updated performance indicators are saved. |
| **Non-functional** | Timer must rely on server-side absolute timestamps. Offline answer buffer must hold at least 500 KB of data safely. *Eviction Policy: Offline buffer is cleared instantly upon successful server sync, or automatically purged after 7 days to prevent stale state buildup.* |

### 

### **UC-07: Track Progress and Learning Gaps**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P0 |
| **Primary Actor** | Student |
| **Goal** | Make the student aware of completed modules, scores, streaks, and areas needing improvement. |
| **Preconditions** | Student has analytics data. |
| **Trigger** | Student opens the progress area. |
| **Main Scenario** | System aggregates metrics (completion %, latest scores, active streak, weak subtests). System renders per-subtest score breakdowns and progress summaries. Student selects a recommended module based on the highlighted gap. |
| **Alternate Flows** | Student filters by date range (e.g., "Last 30 days"). |
| **Exception Flows** | \- |
| **Postconditions** | The page view is recorded for analytics. |
| **Non-functional** | Complex analytical aggregations must run asynchronously |

### 

### 

### **UC-08: Complete Daily Mission and Streak**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P1 |
| **Primary Actor** | Student |
| **Goal** | Encourage consistent learning by assigning short daily practice and rewarding completion. |
| **Preconditions** | Daily mission scheduler has generated today's task. |
| **Trigger** | Student clicks daily mission card. |
| **Main Scenario** | System loads assigned task (e.g., 5 math questions). Student completes activity. System validates completion criteria. System increments current\_streak integer in DB. System renders streak animation and unlocks relevant badges. |
| **Alternate Flows** | Student misses a day Streak resets to 0 unless a "streak freeze" item is consumed. |
| **Exception Flows** | If the validation webhook is delayed, show mission as "Verifying..." and rely on server-sent events (SSE) or polling to update the UI once confirmed. |
| **Postconditions** | The daily mission is marked as completed. The student's streak count is updated. Any newly earned badges are added to the student's profile. |
| **Non-functional** | Mission completion validation must be idempotent to prevent double-counting streaks on rapid clicks. |

### 

### 

### **UC-09: Ask Vera AI for Kapten Support**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P1 |
| **Primary Actor** | Student |
| **Goal** | Provide contextual, conversational explanations and examples at any time. |
| **Preconditions** | AI service is active. Student has not exceeded daily token limits. |
| **Trigger** | Student opens the floating Vera chat widget. |
| **Main Scenario** | System packages prompt, including user question(s) and precise metadata context. System routes request to AI API. Vera returns an explanation formatted in markdown. System renders response in chat UI. Chat history is saved to DB. |
| **Alternate Flows** | Student asks an ambiguous question Vera responds with a clarifying question instead of hallucinating. |
| **Exception Flows** | **AI API Failed To Respond** If API times out (\> 15s) or returns a 5xx, system displays: "Vera is taking a quick break. Please try again in a moment," and offers a link to standard module discussion forum. |
| **Postconditions** | The conversation is saved to the student's chat history. The student's AI usage for the day is updated. |
| **Non-functional** | AI Gateway must enforce strict daily token limit per student. Chat history retention is capped at 30 days. Prompt injection guardrails must be active. |

### 

### 

### **UC-10: Receive Vera AI Weakness Analysis**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P1 |
| **Primary Actor** | Student |
| **Goal** | Identify weak topics from tryout history and explain them conversationally. |
| **Preconditions** | Student has completed at least one tryout. |
| **Trigger** | Student clicks "Analyze my weaknesses" on the dashboard. |
| **Main Scenario** | System queries the last 3 tryout result objects and extracts lowest-performing subtopics. System passes data to Vera with "Analysis Prompt". Vera generates personalized summary explaining struggles. System maps Vera's analysis to specific module IDs and outputs actionable recommendations. |
| **Alternate Flows** | Insufficient data; Vera recommends taking a diagnostic tryout first. |
| **Exception Flows** | **Invalid Content** If generated recommendation IDs do not match CMS taxonomy, filter out invalid links before rendering UI to avoid 404s. **AI Fallback** If conversational AI analysis is not working correctly (API problem or connectivity issue), default to a standard statistical list of weak topics. |
| **Postconditions** | The weakness analysis is saved for the student. Recommendation engagement is tracked. |
| **Non-functional** | Analysis prompt must enforce a max output token limit of 500 to keep explanations concise. |

### 

### 

### **UC-11: Generate Adaptive Practice with Vera AI**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P2 |
| **Primary Actor** | Student |
| **Goal** | Create targeted practice questions dynamically based on student weaknesses. |
| **Preconditions** | Topic context is defined. AI generation policy allows dynamic creation. |
| **Trigger** | Student selects "Smart Drill". |
| **Main Scenario** | System identifies target topic and required difficulty level based on IRT profile. System prompts Vera to generate 3 unique questions. Vera outputs structured JSON. System renders quiz UI. Student answers; system checks against Vera's JSON. |
| **Alternate Flows** | \- |
| **Exception Flows** | **Generation Failure** If JSON is malformed or fails schema validation, silently discard it and pull backup question from static bank. |
| **Postconditions** | Generated questions are discarded after session to prevent DB bloat. practice\_result\_metrics saved to analytics DB. |
| **Non-functional** | Question generation must complete in \< 10 seconds or failover to static bank. |

### 

### 

### **UC-12: Consult PTN and Major Strategy with Vera AI**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P2 |
| **Primary Actor** | Student |
| **Goal** | Discuss target universities, passing grades, and entrance strategies. |
| **Preconditions** | PTN knowledge base is populated and up-to-date. |
| **Trigger** | Student asks Vera about a specific major or university. |
| **Main Scenario** | System searches PTN database for recent admission stats. System feeds stats \+ student tryout average to Vera. Vera provides realistic assessment and study strategy. |
| **Alternate Flows** | \- |
| **Exception Flows** | **PTN Data Unavailable** If requested PTN data doesn't exist, Vera explicitly states: "I don't have the exact passing grade data for that major. Please verify with official SNPMB sources.". |
| **Postconditions** |  |
| **Non-functional** | PTN admission data in the knowledge base must be audited and updated annually (data freshness \< 1 year). Responses must include a standard disclaimer. |

### 

### 

### **UC-13: Manage Banners and Announcements**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P1 |
| **Primary Actor** | Admin |
| **Goal** | Publish, schedule, or disable promotional/breaking banners. |
| **Preconditions** | Admin is authenticated content manager role. |
| **Trigger** | Admin opens CMS banner management. |
| **Main Scenario** | Admin inputs copy, image assets, and CTA links. Admin selects target placement. Admin sets active start/end date-times. System validates inputs and saves configuration. |
| **Alternate Flows** | Admin immediately disables a currently active banner. |
| **Exception Flows** | **Asset Exceeds Threshold** If an image asset exceeds 2MB, reject the upload and prompt the Admin to compress. |
| **Postconditions** | Banner is updated. |
| **Non-functional** | \- |

### 

### 

### **UC-14: Monitor Students and System (Admin Dashboard)**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P0 |
| **Primary Actor** | Admin |
| **Goal** | Provide system-wide oversight of platform health, total user progress, and content configuration. |
| **Preconditions** | Admin is authenticated with  system admin role. |
| **Trigger** | Admin navigates to Admin Control Panel. |
| **Main Scenario** | System verifies RBAC token. System loads aggregated system-wide metrics. Admin searches for a specific student account. System displays full student audit log, billing status, and raw progress data. Admin can reset passwords, extend access, or modify system configurations. |
| **Alternate Flows** | Admin exports a CSV of all tryout results for a specific date range. |
| **Exception Flows** | \- |
| **Postconditions** | Read-only for views. Any administrative action taken is recorded in the audit trail. |
| **Non-functional** | \- |

### 

### 

### **UC-15: Monitor Students and Intervene (Kapten Dashboard)**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P1 |
| **Primary Actor** | Kapten |
| **Goal** | Allow human kapten to monitor specific cohorts, identify at-risk learners, and send targeted interventions. |
| **Preconditions** | Kapten is authenticated with kapten role and assigned to a specific cohort. |
| **Trigger** | Kapten opens Kapten Dashboard. |
| **Main Scenario** | System verifies RBAC token and restricts data scope to Kapten's assigned cohort. System displays ranked list of students, highlighting those with dropping scores or broken streaks (At-Risk flag). Kapten clicks at-risk student to view detailed learning gaps. Kapten types custom motivational message and recommended module link. System dispatches message via Notification Service. |
| **Alternate Flows** | Kapten filters list by specific subtests (e.g., "Show all students failing Quantitative Reasoning"). |
| **Exception Flows** | If analytics DB fails to load, dashboard shows cached cohort data and disables the intervention messaging tool until sync is restored. |
| **Postconditions** | The intervention message is recorded. The notification is queued for delivery. |
| **Non-functional** | Strict data isolation: Kapten must absolutely not be able to query or view data of students outside their assigned cohort. |

### 

### 

### **UC-16: Receive and Manage Notifications**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P1 |
| **Primary Actor** | Student |
| **Goal** | Deliver timely alerts for daily missions, tryout results, kapten interventions, and system announcements. |
| **Preconditions** | Notification service is running. Student has configured notification preferences. |
| **Trigger** | System event occurs (e.g., tryout graded, kapten sends message, 24 hours since last login). |
| **Main Scenario** | Event triggers payload sent to Notification Queue. Service checks user preferences (In-App, Email, Push). Service formats message payload based on channel. Service dispatches notification. Students receive notification and clicks to deep-link into relevant platform areas. |
| **Alternate Flows** | See UC-17 for preference management. The system honors opt-outs and only sends transactional alerts (password reset) if marketing is disabled. |
| **Exception Flows** | If the Email Provider API is down, queue messages and retry with exponential backoff for up to 6 hours. Drop non-critical messages after 6 hours. |
| **Postconditions** | Each notification is recorded as either delivered or failed. |
| **Non-functional** | In-app notifications must appear via WebSockets/SSE in real-time (\< 2 seconds) if user is online. |

### 

### 

### **UC-17: Manage Profile and Preferences**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P1 |
| **Primary Actor** | Student |
| **Goal** | Allow the student to update their personal details, target university goals, and communication preferences. |
| **Preconditions** | Student is authenticated. |
| **Trigger** | Student navigates to "Profile" or "Settings" page. |
| **Main Scenario** | System fetches and displays current profile data and notification toggles. Student modifies target exam or toggles off "Marketing Emails" and "SMS Alerts". Student clicks save. System validates payload and updates database. |
| **Alternate Flows** | Student requests to delete their account; system initiates a 30-day soft-deletion cooling-off period. |
| **Exception Flows** | If the database fails to update, display an error message and revert the UI toggles back to the server's truth state. |
| **Postconditions** | The student's profile and notification preferences are saved. Notification opt-outs take effect immediately. |
| **Non-functional** | Profile changes must reflect immediately across the frontend session without requiring a hard refresh. |

## 

### **UC-18: Manage Student Enrollment**

| Attribute | Description |
| ----- | ----- |
| **Priority** | P1 |
| **Primary Actor** | Manage Student Enrollment |
| **Goal** | Allow administrators to manually create, activate, update, or deactivate student accounts based on approved registrations. |
| **Preconditions** | Admin is authenticated and has user-management permissions. |
| **Trigger** | Admin receives approved student registration information and accesses enrollment management. |
| **Main Scenario** | Admin opens the Student Enrollment Management page. Admin enters student information (name, email, program, etc.). System validates the entered information. Admin creates a new student account. System stores the account in the database. System generates login credentials or activates the student's access. System records the action in the audit log. |
| **Alternate Flows** | Admin updates an existing student account. Admin deactivates or reactivates a student's access. |
| **Exception Flows** | **Duplicate Account Detected** If the email already exists, the system prevents duplicate account creation and displays an error message. |
| **Postconditions** | Student account is created, updated, activated, or deactivated.- Audit logs are updated. |
| **Non-functional** | All enrollment actions must be logged. Only users with administrative privileges may access enrollment management functions. |

## 

5. ## **Cross-Use-Case Requirements & Constraints**

**Accessibility & Responsiveness** The platform is web-first but must remain fully functional on mobile. Navigation must collapse on smaller screens, and primary actions (e.g., tryout timer, submit buttons) must remain accessible without horizontal scrolling.

**Visual Consistency** Progress indicators (bars, checkmarks) must appear consistently across module sections, dashboard summaries, and learning cards. All UI must adhere to the following brand palette:

* Primary: 	Green	\#\#  \#1A6B3C  
* Secondary:	Navy   	\#\#  \#1B2C6B  
* Accent:		Gold	\#\#  \#F5C518

**Access Control** Every platform action must be authorized based on the user's role (Guest, Student, Kapten, Admin). Hiding interface elements alone is not sufficient, access must be enforced at the system level for every request.

**Learning Analytics Consistency** All learning activities (e.g. quizzes, tryouts, modules, and AI interactions) must reference a shared topic taxonomy. This ensures the dashboard and Vera AI have a consistent understanding of each topic and can produce coherent recommendations.

**Data Retention & Privacy** Student tryout history and learning records are retained for 3 years. AI conversation history is retained for a maximum of 30 days. All personally identifiable information must be protected at rest in compliance with applicable regional data privacy laws.

**Launch Timeline** The MVP (all P0 features) must be ready for launch by July 2026\. Work across content preparation, core development, AI integration, and beta testing must be sequenced across May through July.