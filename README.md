
# GitHub SaaS Platform

This project is a modern SaaS (Software as a Service) web application built with Next.js, TypeScript, and Prisma ORM. It provides a collaborative platform for managing projects, integrating with GitHub, handling billing, and leveraging AI-powered features.

## Features

- **User Authentication:** Secure sign-in and sign-up flows, with support for social login (e.g., GitHub).
- **Project Management:** Create, join, and manage projects with dashboards, team collaboration, and Q&A modules.
- **Meetings:** Schedule and manage meetings within projects.
- **Billing & Payments:** Integrated with Razorpay for handling subscriptions and payments.
- **AI Integration:** Leverages AI (Gemini) for code analysis, suggestions, or automation.
- **GitHub Integration:** Load and interact with GitHub repositories and data.
- **Responsive UI:** Built with a comprehensive set of reusable UI components for a consistent and modern user experience.

## Tech Stack

- **Frontend:** Next.js, React, TypeScript
- **Backend:** Next.js API routes, tRPC for type-safe APIs
- **Database:** Prisma ORM
- **Payments:** Razorpay
- **Authentication:** NextAuth (or similar), Firebase
- **AI/ML:** Gemini integration
- **Styling:** PostCSS, CSS Modules, custom UI components

## Project Structure

- `src/app/`: Main application pages, layouts, and protected routes (dashboard, billing, meetings, Q&A, etc.)
- `src/components/ui/`: Reusable UI components (buttons, dialogs, forms, etc.)
- `src/lib/`: Utility libraries for third-party integrations (GitHub, Razorpay, Firebase, Gemini)
- `src/server/`: Server-side logic, database access, and API endpoints
- `prisma/`: Prisma schema and migrations
- `generated/prisma/`: Generated Prisma client

## Getting Started

1. **Install dependencies:**
	```bash
	npm install
	```

2. **Set up environment variables:**
	- Copy `.env.example` to `.env` and fill in the required values (database URL, API keys, etc.).

3. **Run database migrations:**
	```bash
	npx prisma migrate dev
	```

4. **Start the development server:**
	```bash
	npm run dev
	```

5. **Access the app:**
	- Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

- `npm run dev` — Start the development server
- `npm run build` — Build for production
- `npm run start` — Start the production server
- `npx prisma migrate dev` — Run database migrations

## Contributing

Contributions are welcome! Please open issues or submit pull requests for improvements or bug fixes.

## License

MIT
