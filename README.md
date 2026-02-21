# Frontpage — @Bhzeuscagd (CAGD)

A customizable content aggregator that pulls RSS and Atom feeds into one well-designed reading dashboard. Built with Astro, React, and Supabase.

---

## Overview

Frontpage is a minimalist and powerful RSS aggregator created to return control of the news diet back to the reader. It allows anyone to follow their favorite tech blogs, news outlets, and creators with a distraction-free reader view, multi-layout support, and advanced organization features.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 5 |
| UI Components | Astro Components (Vanilla JS) |
| Styling | Tailwind CSS v4, Vanilla CSS |
| Database | Supabase (PostgreSQL) |
| Authentication | Supabase Auth |
| Feed Parsing | `feed-parser` library (Server-side) |

---

## Design Decisions

These are the product and design choices I made to accomplish a Brutalist, high-contrast and minimalist aesthetic:

### Content Discovery & Onboarding

**The problem I was solving:** Getting users to understand the value of an RSS aggregator quickly without immediately forcing them to create an account, which can cause drop-off.

**My approach:** I implemented a robust Guest Mode and a "Try as Guest" onboarding path. Selecting this instantly provisions a curated feed (The Verge) and saves read status inside LocalStorage so users get a taste of the functionality (sidebar counters, feed parsing, article viewing).
For authenticated users, they can sign up, add feeds, and group them as they prefer.

**Why I chose this approach:** Frictionless onboarding is key for modern applications. The local-storage approach allowed me to build the exact same UI as the authenticated dashboard but completely client-side.

**What I'd do differently:** In the future, I would implement "Feed Discovery"—a directory of popular RSS feeds users can browse and add with one click.

### Digest / Summary View

**The problem I was solving:** Preventing users from feeling overwhelmed by unread counts and huge lists of articles, a common issue with RSS readers.

**My approach:** Designing a clean Dashboard that aggregates "All" articles chronologically, but also separating feeds in the Sidebar. Unread counts dynamically decrease as the user marks items as read. Articles open in a "Preview" view that strips ad trackers and extraneous layout.

**Why I chose this approach:** The "Reader" view approach keeps the focus strictly on content, allowing the high-contrast typography to shine.

**What I'd do differently:** I'd like to implement an AI summary feature (e.g., "TL;DR of today's tech news") at the top of the dashboard.

### Layout Customization

**The problem I was solving:** Different users prefer different scanning methods (visual vs text-dense).

**My approach:** Added a View Mode toggle inside the Dashboard with three layouts: Card View (image heavy), List View (traditional), and Compact View (highest density, no images).

**Why I chose this approach:** Offering choices gives users the "pro" feel of desktop readers while maintaining web simplicity.

**What I'd do differently:** Allow users to set a default view mode per-feed rather than globally.

### Other Design Choices

A high-contrast, brutalist "shutter" animation is used on the landing page's Feature section, creating a cinematic reveal experience as users scroll, combined with thick `3px` borders and bold typography.

---

## Development Journey

### Initial Approach vs. Final

Initially, I planned to use a more standard SaaS template style, but I quickly pivoted to a minimalist, typography-driven brutalist design because it perfectly matches the ethos of "taking back your reading."

### What Surprised Me

Building a flexible guest mode using just `localStorage` seamlessly integrating alongside the server-rendered Astro views was easier than expected thanks to Astro's client directives. Handling XML namespaces in some RSS feeds for thumbnail images was more challenging.

---

## Self-Assessment

| Category | Rating | Notes |
|----------|--------|-------|
| **Works for real users** | 4/5 | Fully functional, but relies on accurate user RSS URLs. |
| **Feed parsing robustness** | 4/5 | Handles standard RSS/Atom and gets descriptions gracefully. |
| **Design quality** | 5/5 | High-contrast, tailored typography and brutalist accents. |
| **Responsive design** | 5/5 | Sidebar collapses and grids adjust perfectly to mobile. |
| **Performance** | 5/5 | Extremely fast thanks to Astro's static/hybrid model. |
| **Accessibility** | 4/5 | Good contrast and semantic HTML used. |
| **Edge case handling** | 4/5 | Handles empty feed lists and invalid URLs with error states. |
| **Code quality** | 4/5 | Well-organized into components, `api` routes, and layouts. |
| **Landing page** | 5/5 | Striking animations and engaging copy. |
| **Guest experience** | 5/5 | LocalStorage read tracking works flawlessly without a database. |

### Strengths

The visual identity and the seamless transition between the guest experience and authenticated experience. The app looks like a premium, modern reader immediately. 

### Areas for Improvement

Adding a true OPML import/export system to migrate from other platforms.

---

## Running Locally

```bash
# Clone the repo
git clone [your-repo-url]
cd frontpage

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Fill in your database and auth credentials for Supabase

# Run the development server
pnpm run dev
```

### Environment Variables

| Variable | Description |
|----------|------------|
| `PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Your Supabase Anon Key |

---

## Acknowledgments

Designed and built as a fully-featured, unapologetically minimalist feed reader.
