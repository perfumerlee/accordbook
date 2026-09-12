# Development

## Development server rule

- Accordbook uses port 5173 exclusively.
- Normal local development should use:

  `npm.cmd run dev:safe`

- Direct development start without Git synchronization remains available:

  `npm.cmd run dev`

- Do not manually start multiple persistent Vite servers.
- Do not silently switch to another port.
- Before starting a temporary development server, check port 5173.
- If a temporary server is started for verification, terminate it before finishing the task.
- Never kill a process merely because it uses port 5173.
- Only terminate processes positively identified as stale Accordbook Node/Vite processes.
- IPv4 / IPv6 LISTENING entries using the same PID are acceptable.
- Different PIDs simultaneously LISTENING on 5173 are not acceptable for Accordbook development.
