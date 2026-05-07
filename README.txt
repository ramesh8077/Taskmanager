========================================================================
             TEAM TASK MANAGER & HELPDESK SYSTEM
========================================================================

Project Overview:
-----------------
The Team Task Manager & Helpdesk System is a professional-grade hybrid platform 
designed to streamline project workflows and customer support operations. 
Built with a modern tech stack (Next.js & Node.js), it offers a centralized 
dashboard for managing team tasks, project timelines, and support tickets 
with real-time updates and an intuitive UI.

Key Features:
-------------
1. User Authentication & Security:
   - Secure Login/Registration with JWT-based authentication.
   - Protected routes and session management via HTTP-only cookies.
   - Role-based access (Agent, Manager, Admin).

2. Task & Project Management:
   - Create, update, and track projects.
   - Assign tasks to team members with status and priority tracking.
   - Dynamic dashboard summarizing task progress.

3. Helpdesk & Support Ticket System:
   - Specialized ticket management for resolving user issues.
   - Audit trails for ticket history and resolution workflows.
   - Priority-based filtering (Urgent, High, Medium, Low).
   - Department-specific ticket routing.

4. Professional Dashboard UI:
   - Clean, modern interface with Light/Dark mode support.
   - Table-based list views for large datasets.
   - Responsive design for various screen sizes (Mobile, Tablet, Desktop).

Technology Stack:
-----------------
Frontend:
- Next.js 14+ (App Router)
- React.js
- Tailwind CSS (Styling)
- Axios (API Integration)
- Sonner (Notifications)
- Lucide React (Icons)

Backend:
- Node.js & Express.js
- Sequelize ORM (Database Management)
- JWT (Authentication)
- Cookie-parser & CORS

Database:
- MySQL/PostgreSQL (via Sequelize)

Setup Instructions:
-------------------
1. Backend Setup:
   - Navigate to the root directory.
   - Run 'npm install' to install dependencies.
   - Configure '.env' file with database credentials and JWT_SECRET.
   - Run 'node server.js' to start the backend.

2. Frontend Setup:
   - Navigate to the 'frontend' directory.
   - Run 'npm install' to install dependencies.
   - Run 'npm run dev' to start the Next.js development server.
   - Access the application at http://localhost:3000.

Developer Details:
------------------
Project Title: Team Task Manager & Helpdesk System
Target Viewport: Desktop & Jio Laptop (768px optimized)
Status: Completed

========================================================================
