# Auth Service

Authentication microservice for the SaaS platform.

## Features
- JWT-based access tokens
- refresh token rotation
- email/password registration and login
- Google OAuth login
- profile read/update
- password change
- health check endpoint

## Run locally
1. Copy `.env.template` to `.env` and update values.
2. Install dependencies:
   ```bash
   cd Auth_Service
   npm install
   ```
3. Start the service:
   ```bash
   npm start
   ```

## API Endpoints
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `POST /auth/refresh`
- `POST /auth/change-password`
- `GET /auth/profile`
- `PUT /auth/profile`
- `GET /auth/health`

## Database
The service uses MariaDB/MySQL and creates the `User` table automatically if missing.
The table includes fields for email, password hash, Google login, refresh token hash, and profile metadata.
