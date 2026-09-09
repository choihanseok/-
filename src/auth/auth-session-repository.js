export class AuthSessionRepository {
  async findById(_sessionId) { throw new Error('NOT_IMPLEMENTED'); }
  async findByAccessTokenHash(_accessTokenHash) { throw new Error('NOT_IMPLEMENTED'); }
  async findByRefreshTokenHash(_refreshTokenHash) { throw new Error('NOT_IMPLEMENTED'); }
  async save(_session) { throw new Error('NOT_IMPLEMENTED'); }
}

export class InMemoryAuthSessionRepository extends AuthSessionRepository {
  #byId = new Map();

  async findById(sessionId) {
    return this.#byId.get(sessionId) ?? null;
  }

  async findByAccessTokenHash(accessTokenHash) {
    for (const session of this.#byId.values()) {
      if (session.accessTokenHash === accessTokenHash) return session;
    }
    return null;
  }

  async findByRefreshTokenHash(refreshTokenHash) {
    for (const session of this.#byId.values()) {
      if (session.refreshTokenHash === refreshTokenHash) return session;
    }
    return null;
  }

  async save(session) {
    this.#byId.set(session.sessionId, session);
    return session;
  }
}
