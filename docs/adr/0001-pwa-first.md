# ADR 0001: PWA First, Native Later

## Status

Accepted

## Context

The product needs rich inline clickable text, fast UI iteration, and phone access. Native packaging is useful but should not be the first bottleneck.

## Decision

Build the first version as a PWA with React and TypeScript. Add Capacitor after the reader UX and content pipeline are validated.

## Consequences

- Faster prototype and easier debugging.
- Works on phone browser immediately.
- Native app packaging remains possible.
- Offline persistence must be tested carefully on target mobile browsers.

