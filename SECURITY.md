# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private vulnerability reporting:
`Security` tab → `Report a vulnerability`

Include:

- affected version / commit
- steps to reproduce
- impact
- any suggested fix

## Deployment notes

- Never commit `.env`, `data/`, backups, passwords, session cookies, or SSH keys.
- The admin entry is `/admin`; hiding it is not a security boundary. Use a strong unique password and HTTPS.
- The public site is read-only. If you add write endpoints, keep them behind authentication and add tests.
- Keep dependencies updated; the repository's CI builds every push.
- Back up `data/` before upgrading.
