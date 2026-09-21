# Runtime Validation

Date: 2026-09-22 (Asia/Seoul)

## Installed runtime packages

- typesafe-sdk 0.7.1
- browser-harness 0.1.13

## Official Jev SDK smoke test

The installed SDK successfully imported:

- Choice
- TypeSafeClient

A real Choice object was constructed locally without making a network request.

## Project tests

Result: 3 passed.

## Browser Harness doctor

The package itself is healthy and current at 0.1.13, but the Linux workmachine reports:

- Chrome/Edge process: not visible in this runtime
- Browser Harness daemon: not connected
- Active browser connections: 0

The Windows Edge instance on port 9223 is not reachable from this isolated Linux container over localhost, host.docker.internal, the Docker gateway, or the container bridge gateway. The intended remote path remains the existing outbound OAuth/WSS Windows browser agent.

## Live Jev call

Blocked only on secret-manager authorization. No API key has been copied to disk.

## Live browser action

Blocked only on Windows browser-agent connection. The browser bridge service itself is healthy.
