import crypto from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export function verifyPassword(password, storedHash) {
  return new Promise((resolve, reject) => {
    if (!storedHash || typeof storedHash !== "string") return resolve(false);
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return resolve(false);
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) return reject(error);
      try {
        resolve(crypto.timingSafeEqual(Buffer.from(key, "hex"), derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}
