# This is WAter.

A full-stack social media web application built with **Flask**, featuring real-time direct messaging, a social graph (friends system), OTP-verified registration, file sharing in DMs, and a complete admin control panel.

> Designed and developed by [Abiram Kumaran](https://github.com/abiram-kumaran)

---

## Features

### User-facing
| Feature | Details |
|---|---|
| **Auth** | OTP-verified email sign-up, secure login with hashed passwords (PBKDF2-SHA256) |
| **Feed** | Global post feed ordered by recency; create, delete, like, and comment on posts |
| **Profile** | Custom bio, profile picture upload/removal, personal post history |
| **Friends** | Send / accept / decline friend requests; people you may know suggestions |
| **Direct Messages** | Real-time DM polling between friends; send images and files as attachments |
| **Search** | Live user search with friend status context |
| **Projects Showcase** | Portfolio-style page for displaying creative work |

### Visual / UX
- Animated Grainient WebGL background with refractive lens effect
- Liquid-glass sidebar navigation with spring-physics magnification
- Scroll-driven gradual blur overlays on the feed (GradualBlur port)
- TV-boot intro animation on first load
- Watercolour wave favicon and branded logo
- Fully responsive; mobile-aware layout

### Admin Panel (`/admin`)
- Separate session-based auth — completely isolated from the public site
- Live stats dashboard (users, posts, comments, likes, messages, friend requests)
- Full CRUD over every database table with pagination and search
- Conversation viewer — read any DM thread between any two users
- User detail view — edit username / email / bio / password, view full activity

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.9+ · Flask 3.0 · Flask-SQLAlchemy · Flask-Login · Flask-Mail |
| Database | SQLite (dev) · PostgreSQL via `DATABASE_URL` (production) |
| Frontend | Jinja2 templates · Vanilla JS · Bootstrap 5 · GSAP · Three.js |
| Auth | Werkzeug password hashing · OTP email verification (10-min expiry) |
| Deployment | Vercel (serverless) · Gunicorn (traditional) |

---

## Project Structure

```
this-is-water/
├── app.py                      # WSGI entry point
├── vercel.json                 # Vercel deployment config
├── requirements.txt            # Production dependencies
├── requirements-dev.txt        # Dev / test dependencies
├── .env.example                # Environment variable template
└── website/
    ├── __init__.py             # App factory, DB init, context processor
    ├── models.py               # SQLAlchemy models (User, Post, Comment, Like, FriendRequest, Message)
    ├── views.py                # Main routes + REST API (18 routes)
    ├── auth.py                 # Authentication routes (login, register, OTP, logout)
    ├── admin.py                # Admin panel blueprint (20 routes)
    ├── static/
    │   ├── effects/            # Custom visual effects (WebGL, canvas, spring physics)
    │   ├── uploads/            # User-uploaded files (gitignored)
    │   ├── favicon.ico         # Wave favicon (multi-size ICO)
    │   ├── tiw-logo.png        # Brand logo (auth pages)
    │   └── home-logo.png       # Home feed logo
    └── templates/
        ├── base.html           # Layout shell (nav, DM rail, search panel, effects)
        ├── home.html           # Feed (extends posts_div.html)
        ├── posts_div.html      # Feed content block
        ├── posts.html          # User profile page
        ├── login.html          # Login
        ├── signup.html         # Sign-up with OTP flow
        ├── create_post.html    # Post composer
        ├── projects.html       # Portfolio showcase
        └── admin/              # Admin panel templates
            ├── base.html
            ├── login.html
            ├── dashboard.html
            ├── users.html
            ├── user_detail.html
            ├── posts.html
            ├── comments.html
            ├── messages.html
            ├── friend_requests.html
            ├── likes.html
            └── conversation.html
```

---

## Getting Started

### Prerequisites
- Python 3.9+
- A Gmail account with an [App Password](https://support.google.com/accounts/answer/185833) enabled

### 1. Clone & install
```bash
git clone https://github.com/abiram-kumaran/this-is-water.git
cd this-is-water
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt   # optional, for tests
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
SECRET_KEY=your-long-random-secret-key
DATABASE_URL=sqlite:///project.db
MAIL_USERNAME=you@gmail.com
MAIL_PASSWORD=your-gmail-app-password
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_admin_password
```

### 3. Run locally
```bash
python3 app.py
```

Open [http://localhost:5000](http://localhost:5000)

### 4. Run tests
```bash
pytest tests/ -v
```

---

## Deployment (Vercel)

This project is configured for one-click Vercel deployment.

> **Note:** Vercel's filesystem is ephemeral — SQLite data won't persist. Use a hosted PostgreSQL database (e.g. [Neon](https://neon.tech) — free tier available).

1. Push this repo to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Set environment variables in the Vercel dashboard (same keys as `.env.example`)
4. Deploy — Vercel auto-detects `vercel.json` and builds `app.py`

---

## API Reference

All endpoints require an authenticated session unless noted.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/search?q=` | Search users by username |
| `GET` | `/api/suggestions` | Suggested users to friend |
| `POST` | `/api/friend-request/send` | Send a friend request `{user_id}` |
| `POST` | `/api/friend-request/<id>/accept` | Accept a pending request |
| `POST` | `/api/friend-request/<id>/decline` | Decline a pending request |
| `GET` | `/api/messages/<username>` | Fetch DM history with a friend |
| `POST` | `/api/messages/send` | Send a text DM `{username, text}` |
| `POST` | `/api/messages/send-file` | Send a file/image DM (multipart) |
| `POST` | `/api/profile-picture` | Upload profile picture (multipart) |
| `DELETE` | `/api/profile-picture` | Remove profile picture |
| `POST` | `/like-post/<id>` | Toggle like on a post |
| `POST` | `/send-otp` | Send OTP to email (no auth required) |

---

## Admin Panel

The admin panel is deliberately unlisted — no link to it appears anywhere on the public site.

**URL:** `/admin/login`

Credentials are set via environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`). The admin session is completely separate from Flask-Login user sessions.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | ✅ | Flask session secret — use a long random string in production |
| `DATABASE_URL` | ✅ | SQLAlchemy DB URI. SQLite for local, PostgreSQL for production |
| `MAIL_SERVER` | ✅ | SMTP server (default: `smtp.gmail.com`) |
| `MAIL_PORT` | ✅ | SMTP port (default: `465`) |
| `MAIL_USERNAME` | ✅ | Sender email address |
| `MAIL_PASSWORD` | ✅ | Gmail App Password |
| `MAIL_USE_SSL` | ✅ | `True` for port 465 |
| `MAIL_USE_TLS` | ✅ | `False` when using SSL |
| `ADMIN_USERNAME` | ✅ | Admin panel login username |
| `ADMIN_PASSWORD` | ✅ | Admin panel login password |
| `FLASK_DEBUG` | ❌ | Set to `False` in production |

---

## Security Notes

- Passwords hashed with PBKDF2-SHA256 via Werkzeug
- OTP codes expire after 10 minutes and are single-use
- Admin panel uses a separate session key — user sessions cannot escalate to admin
- File uploads validated by extension allowlist; filenames sanitized with UUID
- `.env` is gitignored — secrets are never committed

---

## License

MIT — free to use, modify, and distribute.
