# Security Policy

## Supported Scope

This repository is a local-first Android/PWA study app. It does not currently provide a hosted backend, user accounts, cloud sync, or payment flow.

Security-sensitive areas:

- Android release signing configuration
- Local textbook source files
- Imported textbook rights metadata
- Generated app content packages
- Browser localStorage learning records

## Reporting

Do not open a public issue containing secrets, keystores, private textbook files, personal data, or exploit details.

For this portfolio project, report concerns through the project owner's GitHub profile: https://github.com/Felix-Zuo

## Secret Handling

The repository must not commit:

- `android/keystore.properties`
- `*.jks`, `*.keystore`, `*.p12`, `*.pfx`, or `*.pem`
- `.env` files
- raw PDF/DOCX textbook source files
- private user notes or exported vocabulary containing personal data

Run the public-readiness scan described in [PUBLIC_READINESS.md](PUBLIC_READINESS.md) before changing repository visibility or publishing release assets.

## Dependency and Build Notes

The app is local-first and stores learning records in browser localStorage. Users should treat exported vocabulary/notes as personal study data and avoid publishing them accidentally.
