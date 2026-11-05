Connection diagnosis

Reproduced the exact create-poll error with repro-connection.mjs.
Browser WebSocket error: ERR_NAME_NOT_RESOLVED for the former default room-server hostname.
Windows DNS also returned NXDOMAIN for that hostname; rankzap.site and example.com resolved.
The deployed app bundle used the same former hostname. Authentication and schema validation were never reached.

Fix: local development uses the existing room-server implementation via npm run dev:server on port 1999. .env.local points the current preview at it; .env.example and README document the reproducible setup. Local persistence is ignored by git. Production deployment still needs a reachable hosted room server.

Verified with check-live.mjs using two real browser sessions and the actual local backend:
- poll creation saves chosen colour and two options;
- a voter can join, enter a name and submit;
- the host receives the vote;
- colour changes sync to the voter;
- closing the poll reveals final results;
- the test poll is deleted afterward.

The drag-keyboard check in the exploratory harness is outside this connection regression; its immediate assertion was timing-sensitive and was removed from the connection check. No ballot code was changed for this fix.
