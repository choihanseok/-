import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { AuthChallenge } from './auth-challenge.js';
import { AuthChallengeStatus } from './auth-challenge-status.js';

export class VerificationCodeSender {
  async send(_payload) { throw new Error('NOT_IMPLEMENTED'); }
}

export class PhoneVerificationService {
  constructor({
    challengeRepository,
    codeSender,
    hashSecret,
    idGenerator = randomUUID,
    clock = () => new Date(),
    codeGenerator = () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
    ttlMs = 5 * 60 * 1000,
    maxAttempts = 5,
  }) {
    if (!challengeRepository) throw new TypeError('AUTH_CHALLENGE_REPOSITORY_REQUIRED');
    if (!codeSender) throw new TypeError('AUTH_CODE_SENDER_REQUIRED');
    if (!hashSecret) throw new TypeError('AUTH_HASH_SECRET_REQUIRED');
    this.challengeRepository = challengeRepository;
    this.codeSender = codeSender;
    this.hashSecret = hashSecret;
    this.idGenerator = idGenerator;
    this.clock = clock;
    this.codeGenerator = codeGenerator;
    this.ttlMs = ttlMs;
    this.maxAttempts = maxAttempts;
  }

  #hash(code) {
    return createHmac('sha256', this.hashSecret).update(code).digest('hex');
  }

  #matches(code, expectedHash) {
    const actual = Buffer.from(this.#hash(code), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async requestVerification({ phone, purpose }) {
    if (!phone) throw new TypeError('AUTH_PHONE_REQUIRED');
    if (!purpose) throw new TypeError('AUTH_PURPOSE_REQUIRED');

    const now = this.clock();
    const code = this.codeGenerator();
    const challenge = new AuthChallenge({
      challengeId: this.idGenerator(),
      phone,
      purpose,
      codeHash: this.#hash(code),
      expiresAt: new Date(now.getTime() + this.ttlMs),
      createdAt: now,
      updatedAt: now,
    });

    await this.challengeRepository.save(challenge);
    await this.codeSender.send({ phone, code, purpose, challengeId: challenge.challengeId });
    return { challengeId: challenge.challengeId, expiresAt: challenge.expiresAt };
  }

  async verify({ challengeId, code }) {
    if (!challengeId) throw new TypeError('AUTH_CHALLENGE_ID_REQUIRED');
    if (!code) throw new TypeError('AUTH_CODE_REQUIRED');

    const challenge = await this.challengeRepository.findById(challengeId);
    if (!challenge) throw new Error('AUTH_CHALLENGE_NOT_FOUND');
    if (challenge.status === AuthChallengeStatus.VERIFIED) return challenge;
    if (challenge.status !== AuthChallengeStatus.PENDING) throw new Error('AUTH_CHALLENGE_NOT_PENDING');

    const now = this.clock();
    if (challenge.isExpired(now)) {
      await this.challengeRepository.save(challenge.withState({ status: AuthChallengeStatus.EXPIRED, updatedAt: now }));
      throw new Error('AUTH_CHALLENGE_EXPIRED');
    }

    const attempts = challenge.attemptCount + 1;
    if (!this.#matches(code, challenge.codeHash)) {
      const status = attempts >= this.maxAttempts ? AuthChallengeStatus.FAILED : AuthChallengeStatus.PENDING;
      await this.challengeRepository.save(challenge.withState({ status, attemptCount: attempts, updatedAt: now }));
      throw new Error(status === AuthChallengeStatus.FAILED ? 'AUTH_CHALLENGE_ATTEMPTS_EXCEEDED' : 'AUTH_CODE_INVALID');
    }

    return this.challengeRepository.save(challenge.withState({
      status: AuthChallengeStatus.VERIFIED,
      attemptCount: attempts,
      updatedAt: now,
    }));
  }
}
