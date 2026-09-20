# TinyRoom MVP privacy notes

This is a technical starting point, not legal advice.

The app uses Firebase Anonymous Authentication and Firebase Realtime Database. Anonymous Authentication creates a temporary Firebase account/UID so database rules can distinguish participants without asking for an email or password.

The database stores room metadata, temporary participant UIDs, nicknames, timestamps and messages.

"Anonymous" does not mean "zero metadata exists anywhere". Firebase and related infrastructure may process operational/connection metadata according to their policies.

Do not claim:
- 100% anonymity
- zero logging
- guaranteed immediate deletion
- end-to-end encryption

unless those claims are actually implemented and verified.

The current free-only architecture has no server-side scheduled deletion job.
