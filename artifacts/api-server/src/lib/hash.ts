import argon2, { type HashOptions } from "argon2";

// Argon2id — recommended variant (resists both side-channel and GPU attacks)
const ARGON2_OPTIONS: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

// Refresh tokens are random strings — hash them for storage with lighter params
const TOKEN_OPTIONS: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 4096, // 4 MiB — lighter for token compare
  timeCost: 1,
  parallelism: 1,
};

export async function hashToken(token: string): Promise<string> {
  return argon2.hash(token, TOKEN_OPTIONS);
}

export async function compareToken(
  token: string,
  hash: string,
): Promise<boolean> {
  return argon2.verify(hash, token);
}
