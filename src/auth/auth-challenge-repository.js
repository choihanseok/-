export class AuthChallengeRepository {
  async findById(_challengeId) { throw new Error('NOT_IMPLEMENTED'); }
  async save(_challenge) { throw new Error('NOT_IMPLEMENTED'); }
}

export class InMemoryAuthChallengeRepository extends AuthChallengeRepository {
  #byId = new Map();

  async findById(challengeId) {
    return this.#byId.get(challengeId) ?? null;
  }

  async save(challenge) {
    this.#byId.set(challenge.challengeId, challenge);
    return challenge;
  }
}
