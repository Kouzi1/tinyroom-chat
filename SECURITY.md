# Security checklist

Before public launch:
- Enable and evaluate Firebase App Check.
- Add stronger abuse/rate limiting.
- Add reporting/blocking.
- Add Privacy Policy and Terms.
- Add monitoring and alerts.
- Add reliable server-side deletion if instant deletion is a product promise.
- Review room-token entropy and invite handling.
- Never put a Firebase Admin SDK private key in `public/`.
