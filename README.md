# Sample Users API

In-memory REST API in plain Node.js. No dependencies, so no `npm install` is needed.

## Run

    npm start                 # http://localhost:4002
    API_PORT=5000 npm start   # another port

Data lives in memory and resets on every restart (seeded users: 1 = admin, 2 = viewer).

## Endpoints

    GET    /api/health            -> 200 { status: 'ok' }
    POST   /api/auth/login        -> 200 { token } | 400 | 401
    GET    /api/me                -> 200 { user }  | 401   (needs "Authorization: Bearer <token>")
    GET    /api/users[?role=x]    -> 200 [users]
    GET    /api/users/:id         -> 200 user | 404
    POST   /api/users             -> 201 user (+ Location header) | 400 | 409
    PUT    /api/users/:id         -> 200 user | 400 | 404 | 409
    DELETE /api/users/:id         -> 204 | 404
